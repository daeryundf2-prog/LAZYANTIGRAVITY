import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

function printUsage() {
	console.log('Usage: node analyze-sqlite.mjs <database_path> [options]');
	console.log('Options:');
	console.log('  --schema <table>     Print the CREATE TABLE query for the specified table');
	console.log('  --search <keyword>   Search for keyword in all text columns across all tables');
}

function getTables(db) {
	const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
	return stmt.all().map(row => row.name);
}

function main() {
	const args = process.argv.slice(2);
	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		printUsage();
		process.exit(args.length === 0 ? 1 : 0);
	}

	const dbPath = path.resolve(args[0]);

	if (!fs.existsSync(dbPath)) {
		console.error(`Error: Database file does not exist at '${dbPath}'`);
		process.exit(1);
	}

	let schemaTable = null;
	let searchKeyword = null;

	for (let i = 1; i < args.length; i++) {
		if (args[i] === '--schema') {
			if (i + 1 >= args.length) {
				console.error('Error: --schema requires a table name.');
				process.exit(1);
			}
			schemaTable = args[i + 1];
			i++;
		} else if (args[i].startsWith('--schema=')) {
			schemaTable = args[i].substring(9);
		} else if (args[i] === '--search') {
			if (i + 1 >= args.length) {
				console.error('Error: --search requires a keyword.');
				process.exit(1);
			}
			searchKeyword = args[i + 1];
			i++;
		} else if (args[i].startsWith('--search=')) {
			searchKeyword = args[i].substring(9);
		} else {
			console.error(`Error: Unknown option '${args[i]}'`);
			printUsage();
			process.exit(1);
		}
	}

	let db;
	try {
		db = new DatabaseSync(dbPath);
	} catch (err) {
		console.error(`Error opening database: ${err.message}`);
		process.exit(1);
	}

	try {
		if (schemaTable) {
			const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?");
			const result = stmt.get(schemaTable);
			if (result && result.sql) {
				console.log(result.sql);
			} else {
				console.error(`Error: Table '${schemaTable}' not found or has no schema.`);
				process.exit(1);
			}
		} else if (searchKeyword) {
			const tables = getTables(db);
			let totalMatches = 0;

			for (const table of tables) {
				const escapedTable = table.replace(/"/g, '""');
				// Get column info
				const colsStmt = db.prepare(`PRAGMA table_info("${escapedTable}")`);
				const cols = colsStmt.all();

				// Filter text/string columns
				const textCols = cols
					.filter(col => {
						const type = (col.type || '').toUpperCase();
						return type.includes('TEXT') ||
							type.includes('CHAR') ||
							type.includes('CLOB') ||
							type.includes('STRING') ||
							type === '';
					})
					.map(col => col.name);

				if (textCols.length === 0) {
					continue;
				}

				// Build query
				const conditions = textCols.map(col => `"${col.replace(/"/g, '""')}" LIKE ?`).join(' OR ');
				const queryStr = `SELECT * FROM "${escapedTable}" WHERE ${conditions}`;
				const stmt = db.prepare(queryStr);

				const params = Array(textCols.length).fill(`%${searchKeyword}%`);
				const results = stmt.all(...params);

				if (results.length > 0) {
					totalMatches += results.length;
					console.log(`\nTable: ${table} (${results.length} matches)`);
					results.forEach((row, idx) => {
						console.log(`  Match ${idx + 1}: ${JSON.stringify(row)}`);
					});
				}
			}

			if (totalMatches === 0) {
				console.log(`No records matching '${searchKeyword}' found in any text columns.`);
			}
		} else {
			// Default action: List tables and count records
			const tables = getTables(db);
			if (tables.length === 0) {
				console.log('No tables found in the database.');
			} else {
				console.log('Tables and record counts:');
				for (const table of tables) {
					const escapedTable = table.replace(/"/g, '""');
					const stmt = db.prepare(`SELECT COUNT(*) as count FROM "${escapedTable}"`);
					const result = stmt.get();
					console.log(`- ${table}: ${result.count} records`);
				}
			}
		}
	} catch (err) {
		console.error(`Database query failed: ${err.message}`);
		process.exit(1);
	}
}

main();

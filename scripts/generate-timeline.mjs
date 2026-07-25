import fs from 'node:fs';
import path from 'node:path';

function printUsage() {
	console.log('Usage: node generate-timeline.mjs <directory_path>');
}

function scanDir(dir, fileList = []) {
	try {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				scanDir(fullPath, fileList);
			} else if (entry.isFile()) {
				fileList.push(fullPath);
			}
		}
	} catch (err) {
		console.warn(`Warning: Could not read directory '${dir}': ${err.message}`);
	}
	return fileList;
}

function main() {
	const args = process.argv.slice(2);
	if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
		printUsage();
		process.exit(args.length === 0 ? 1 : 0);
	}

	const targetDir = path.resolve(args[0]);

	if (!fs.existsSync(targetDir)) {
		console.error(`Error: Directory does not exist at '${targetDir}'`);
		process.exit(1);
	}

	let stats;
	try {
		stats = fs.statSync(targetDir);
		if (!stats.isDirectory()) {
			console.error(`Error: '${targetDir}' is not a directory.`);
			process.exit(1);
		}
	} catch (err) {
		console.error(`Error reading directory stats: ${err.message}`);
		process.exit(1);
	}

	console.log(`Scanning directory: ${targetDir}\n`);

	const files = scanDir(targetDir);
	const events = [];

	for (const filePath of files) {
		try {
			const fileStats = fs.statSync(filePath);
			const relPath = path.relative(targetDir, filePath);

			if (fileStats.birthtime && fileStats.birthtime.getTime() > 0) {
				events.push({
					time: fileStats.birthtime,
					action: 'Born/Created',
					path: relPath,
					size: fileStats.size,
				});
			}
			if (fileStats.mtime && fileStats.mtime.getTime() > 0) {
				events.push({
					time: fileStats.mtime,
					action: 'Modified',
					path: relPath,
					size: fileStats.size,
				});
			}
			if (fileStats.atime && fileStats.atime.getTime() > 0) {
				events.push({
					time: fileStats.atime,
					action: 'Accessed',
					path: relPath,
					size: fileStats.size,
				});
			}
			if (fileStats.ctime && fileStats.ctime.getTime() > 0) {
				events.push({
					time: fileStats.ctime,
					action: 'Changed',
					path: relPath,
					size: fileStats.size,
				});
			}
		} catch (err) {
			console.warn(`Warning: Could not get stats for file '${filePath}': ${err.message}`);
		}
	}

	// Sort chronologically
	events.sort((a, b) => a.time.getTime() - b.time.getTime());

	if (events.length === 0) {
		console.log('No file events found.');
		return;
	}

	// Output Markdown table
	console.log('| Date/Time | Action | File Path | Size (Bytes) |');
	console.log('|---|---|---|---|');
	for (const event of events) {
		const timeStr = event.time.toISOString();
		console.log(`| ${timeStr} | ${event.action} | ${event.path} | ${event.size} |`);
	}
}

main();

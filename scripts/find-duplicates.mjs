import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function printUsage() {
	console.log('Usage: node scripts/find-duplicates.mjs <directory_path>');
}

function getFiles(dir) {
	let results = [];
	let list;
	try {
		list = fs.readdirSync(dir, { withFileTypes: true });
	} catch (err) {
		console.warn(`Warning: Could not read directory '${dir}': ${err.message}`);
		return [];
	}

	for (const entry of list) {
		const res = path.resolve(dir, entry.name);
		try {
			if (entry.isDirectory()) {
				results.push(...getFiles(res));
			} else if (entry.isFile()) {
				results.push(res);
			}
		} catch (err) {
			console.warn(`Warning: Could not access path '${res}': ${err.message}`);
		}
	}
	return results;
}

function calculateMd5(filePath) {
	return new Promise((resolve) => {
		const hash = crypto.createHash('md5');
		const stream = fs.createReadStream(filePath);
		stream.on('data', (chunk) => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
		stream.on('error', (err) => {
			console.warn(`Warning: Error hashing file '${filePath}': ${err.message}`);
			resolve(null);
		});
	});
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
		printUsage();
		process.exit(args.length === 0 ? 1 : 0);
	}

	const dirPath = path.resolve(args[0]);

	if (!fs.existsSync(dirPath)) {
		console.error(`Error: Directory does not exist at '${dirPath}'`);
		process.exit(1);
	}

	try {
		const stats = fs.statSync(dirPath);
		if (!stats.isDirectory()) {
			console.error(`Error: '${dirPath}' is not a directory.`);
			process.exit(1);
		}
	} catch (err) {
		console.error(`Error reading directory stats: ${err.message}`);
		process.exit(1);
	}

	console.log(`Scanning directory: ${dirPath}\n`);

	const files = getFiles(dirPath);
	if (files.length === 0) {
		console.log('No files found.');
		return;
	}

	// Group files by size first to avoid computing hash for unique file sizes
	const sizeGroups = new Map();
	for (const filePath of files) {
		try {
			const size = fs.statSync(filePath).size;
			if (!sizeGroups.has(size)) {
				sizeGroups.set(size, []);
			}
			sizeGroups.get(size).push(filePath);
		} catch (err) {
			console.warn(`Warning: Could not get stats for '${filePath}': ${err.message}`);
		}
	}

	const md5Groups = new Map();

	for (const [size, paths] of sizeGroups.entries()) {
		if (paths.length < 2) {
			continue;
		}

		for (const filePath of paths) {
			const md5 = await calculateMd5(filePath);
			if (!md5) continue;

			if (!md5Groups.has(md5)) {
				md5Groups.set(md5, { size, paths: [] });
			}
			md5Groups.get(md5).paths.push(filePath);
		}
	}

	let duplicateGroupsCount = 0;
	for (const [md5, group] of md5Groups.entries()) {
		if (group.paths.length > 1) {
			duplicateGroupsCount++;
			console.log(`Duplicate Group #${duplicateGroupsCount}`);
			console.log(`  MD5:  ${md5}`);
			console.log(`  Size: ${group.size} bytes`);
			console.log('  Paths:');
			for (const p of group.paths) {
				console.log(`    - ${p}`);
			}
			console.log();
		}
	}

	if (duplicateGroupsCount === 0) {
		console.log('No duplicate files found.');
	} else {
		console.log(`Found ${duplicateGroupsCount} duplicate groups.`);
	}
}

main();

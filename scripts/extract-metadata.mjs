import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SIGNATURES = [
	{ name: 'JPEG', hex: 'ffd8ff', extensions: ['.jpg', '.jpeg'] },
	{ name: 'PNG', hex: '89504e47', extensions: ['.png'] },
	{ name: 'PDF', hex: '25504446', extensions: ['.pdf'] },
	{ name: 'SQLite', hex: '53514c697465', extensions: ['.db', '.sqlite', '.sqlite3'] },
	{ name: 'ZIP', hex: '504b0304', extensions: ['.zip'] },
	{ name: 'EXE', hex: '4d5a', extensions: ['.exe'] },
];

function printUsage() {
	console.log('Usage: node extract-metadata.mjs <file_path>');
}

async function calculateHashes(filePath) {
	return new Promise((resolve, reject) => {
		const md5Hash = crypto.createHash('md5');
		const sha256Hash = crypto.createHash('sha256');
		const stream = fs.createReadStream(filePath);
		stream.on('data', (chunk) => {
			md5Hash.update(chunk);
			sha256Hash.update(chunk);
		});
		stream.on('end', () => {
			resolve({
				md5: md5Hash.digest('hex'),
				sha256: sha256Hash.digest('hex'),
			});
		});
		stream.on('error', (err) => reject(err));
	});
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
		printUsage();
		process.exit(args.length === 0 ? 1 : 0);
	}

	const filePath = path.resolve(args[0]);

	if (!fs.existsSync(filePath)) {
		console.error(`Error: File does not exist at '${filePath}'`);
		process.exit(1);
	}

	let stats;
	try {
		stats = fs.statSync(filePath);
		if (!stats.isFile()) {
			console.error(`Error: '${filePath}' is not a regular file.`);
			process.exit(1);
		}
	} catch (err) {
		console.error(`Error reading file stats: ${err.message}`);
		process.exit(1);
	}

	// Read first 16 bytes
	let buffer = Buffer.alloc(16);
	let bytesRead = 0;
	try {
		const fd = fs.openSync(filePath, 'r');
		bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
		fs.closeSync(fd);
	} catch (err) {
		console.error(`Error reading magic bytes: ${err.message}`);
		process.exit(1);
	}

	const hexSig = buffer.slice(0, bytesRead).toString('hex');
	const ext = path.extname(filePath).toLowerCase();

	const matchedSig = SIGNATURES.find((s) => hexSig.startsWith(s.hex));
	let verdict = 'Match';

	if (matchedSig) {
		if (!matchedSig.extensions.includes(ext)) {
			verdict = `Spoofing Detected (Magic bytes indicate ${matchedSig.name} but extension is ${ext || '(none)'})`;
		} else {
			verdict = `Match (${matchedSig.name})`;
		}
	} else {
		// No known signature match. Check if extension is one of the known extensions
		const expectedSig = SIGNATURES.find((s) => s.extensions.includes(ext));
		if (expectedSig) {
			verdict = `Spoofing Detected (Extension indicates ${expectedSig.name} but magic bytes do not match)`;
		} else {
			verdict = 'Match (Unknown Type)';
		}
	}

	try {
		const { md5, sha256 } = await calculateHashes(filePath);
		console.log(`File Name: ${path.basename(filePath)}`);
		console.log(`Size: ${stats.size} bytes`);
		console.log(`MD5: ${md5}`);
		console.log(`SHA-256: ${sha256}`);
		console.log(`Magic Bytes Signature: ${hexSig.slice(0, 32)}`);
		console.log(`Extension Match Verdict: ${verdict}`);
	} catch (err) {
		console.error(`Error calculating hashes: ${err.message}`);
		process.exit(1);
	}
}

main();

import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.resolve(__dirname, "../scripts");

function createTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "forensic-test-"));
}

test("extract-metadata.mjs: matches correct signature and computes hashes for PNG", () => {
	const tempDir = createTempDir();
	try {
		const filePath = path.join(tempDir, "test.png");
		const buffer = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
		fs.writeFileSync(filePath, buffer);

		const scriptPath = path.join(scriptsDir, "extract-metadata.mjs");
		const stdout = execSync(`node "${scriptPath}" "${filePath}"`, { encoding: "utf8" });

		assert.match(stdout, /File Name: test\.png/);
		assert.match(stdout, /Extension Match Verdict: Match \(PNG\)/);
		assert.match(stdout, /MD5: [a-f0-9]{32}/i);
		assert.match(stdout, /SHA-256: [a-f0-9]{64}/i);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test("extract-metadata.mjs: detects spoofed file with extension mismatch", () => {
	const tempDir = createTempDir();
	try {
		const filePath = path.join(tempDir, "spoofed.jpg");
		// PNG magic bytes but JPEG extension
		const buffer = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
		fs.writeFileSync(filePath, buffer);

		const scriptPath = path.join(scriptsDir, "extract-metadata.mjs");
		const stdout = execSync(`node "${scriptPath}" "${filePath}"`, { encoding: "utf8" });

		assert.match(stdout, /File Name: spoofed\.jpg/);
		assert.match(stdout, /Extension Match Verdict: Spoofing Detected \(Magic bytes indicate PNG but extension is \.jpg\)/);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test("extract-metadata.mjs: detects spoofed file when extension indicates signature but magic bytes do not", () => {
	const tempDir = createTempDir();
	try {
		const filePath = path.join(tempDir, "spoofed.png");
		fs.writeFileSync(filePath, "not a png file");

		const scriptPath = path.join(scriptsDir, "extract-metadata.mjs");
		const stdout = execSync(`node "${scriptPath}" "${filePath}"`, { encoding: "utf8" });

		assert.match(stdout, /File Name: spoofed\.png/);
		assert.match(stdout, /Extension Match Verdict: Spoofing Detected \(Extension indicates PNG but magic bytes do not match\)/);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test("extract-metadata.mjs: handles unknown file type", () => {
	const tempDir = createTempDir();
	try {
		const filePath = path.join(tempDir, "test.txt");
		fs.writeFileSync(filePath, "hello world");

		const scriptPath = path.join(scriptsDir, "extract-metadata.mjs");
		const stdout = execSync(`node "${scriptPath}" "${filePath}"`, { encoding: "utf8" });

		assert.match(stdout, /File Name: test\.txt/);
		assert.match(stdout, /Extension Match Verdict: Match \(Unknown Type\)/);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test("extract-metadata.mjs: outputs usage when no arguments are provided", () => {
	const scriptPath = path.join(scriptsDir, "extract-metadata.mjs");
	assert.throws(() => {
		execSync(`node "${scriptPath}"`, { stdio: "pipe" });
	});
});

test("find-duplicates.mjs: identifies duplicates correctly including nested folders", () => {
	const tempDir = createTempDir();
	try {
		const file1 = path.join(tempDir, "file1.txt");
		const file2 = path.join(tempDir, "file2.txt");
		const file3 = path.join(tempDir, "file3.txt");
		
		fs.writeFileSync(file1, "duplicate content");
		fs.writeFileSync(file2, "duplicate content");
		fs.writeFileSync(file3, "different content");

		fs.mkdirSync(path.join(tempDir, "sub"));
		const file4 = path.join(tempDir, "sub", "file4.txt");
		fs.writeFileSync(file4, "duplicate content");

		const scriptPath = path.join(scriptsDir, "find-duplicates.mjs");
		const stdout = execSync(`node "${scriptPath}" "${tempDir}"`, { encoding: "utf8" });

		assert.match(stdout, /Scanning directory:/);
		assert.match(stdout, /Duplicate Group #1/);
		assert.match(stdout, /Found 1 duplicate groups\./);
		assert.match(stdout, /file1\.txt/);
		assert.match(stdout, /file2\.txt/);
		assert.match(stdout, /file4\.txt/);
		assert.doesNotMatch(stdout, /file3\.txt/);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test("find-duplicates.mjs: prints clean message when no duplicates exist", () => {
	const tempDir = createTempDir();
	try {
		const file1 = path.join(tempDir, "file1.txt");
		const file2 = path.join(tempDir, "file2.txt");
		fs.writeFileSync(file1, "content a");
		fs.writeFileSync(file2, "content b");

		const scriptPath = path.join(scriptsDir, "find-duplicates.mjs");
		const stdout = execSync(`node "${scriptPath}" "${tempDir}"`, { encoding: "utf8" });

		assert.match(stdout, /No duplicate files found\./);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test("generate-timeline.mjs: generates sorted timeline markdown table", () => {
	const tempDir = createTempDir();
	try {
		const file1 = path.join(tempDir, "oldest.txt");
		const file2 = path.join(tempDir, "newest.txt");

		fs.writeFileSync(file1, "old");
		fs.writeFileSync(file2, "new");

		const now = new Date();
		const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

		fs.utimesSync(file1, hourAgo, hourAgo);
		fs.utimesSync(file2, now, now);

		const scriptPath = path.join(scriptsDir, "generate-timeline.mjs");
		const stdout = execSync(`node "${scriptPath}" "${tempDir}"`, { encoding: "utf8" });

		assert.match(stdout, /Scanning directory:/);
		assert.match(stdout, /\| Date\/Time \| Action \| File Path \| Size \(Bytes\) \|/);
		assert.match(stdout, /\|---\|---\|---\|---\|/);
		assert.match(stdout, /oldest\.txt/);
		assert.match(stdout, /newest\.txt/);

		const oldestIdx = stdout.indexOf("oldest.txt");
		const newestIdx = stdout.indexOf("newest.txt");
		assert.ok(oldestIdx !== -1 && newestIdx !== -1, "Both files should be present in the timeline output");
		assert.ok(oldestIdx < newestIdx, "oldest.txt events should be listed before newest.txt events");
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test("analyze-sqlite.mjs: lists tables and record counts by default", () => {
	const tempDir = createTempDir();
	try {
		const dbPath = path.join(tempDir, "test.db");
		const db = new DatabaseSync(dbPath);
		db.exec(`
			CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
			CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);
			INSERT INTO users (name) VALUES ('Alice'), ('Bob');
			INSERT INTO posts (title) VALUES ('Post 1');
		`);
		db.close();

		const scriptPath = path.join(scriptsDir, "analyze-sqlite.mjs");
		const stdout = execSync(`node "${scriptPath}" "${dbPath}"`, { encoding: "utf8" });

		assert.match(stdout, /Tables and record counts:/);
		assert.match(stdout, /- users: 2 records/);
		assert.match(stdout, /- posts: 1 records/);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test("analyze-sqlite.mjs: prints table schema when --schema option is specified", () => {
	const tempDir = createTempDir();
	try {
		const dbPath = path.join(tempDir, "test.db");
		const db = new DatabaseSync(dbPath);
		db.exec(`
			CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
		`);
		db.close();

		const scriptPath = path.join(scriptsDir, "analyze-sqlite.mjs");
		const stdout = execSync(`node "${scriptPath}" "${dbPath}" --schema users`, { encoding: "utf8" });

		assert.match(stdout, /CREATE TABLE users/);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test("analyze-sqlite.mjs: searches text columns when --search option is specified", () => {
	const tempDir = createTempDir();
	try {
		const dbPath = path.join(tempDir, "test.db");
		const db = new DatabaseSync(dbPath);
		db.exec(`
			CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, bio TEXT);
			INSERT INTO users (name, bio) VALUES ('Alice', 'Forensic expert');
			INSERT INTO users (name, bio) VALUES ('Bob', 'Regular developer');
		`);
		db.close();

		const scriptPath = path.join(scriptsDir, "analyze-sqlite.mjs");
		
		const stdoutMatch = execSync(`node "${scriptPath}" "${dbPath}" --search Forensic`, { encoding: "utf8" });
		assert.match(stdoutMatch, /Table: users \(1 matches\)/);
		assert.match(stdoutMatch, /"name":"Alice"/);
		assert.match(stdoutMatch, /"bio":"Forensic expert"/);

		const stdoutNoMatch = execSync(`node "${scriptPath}" "${dbPath}" --search Charlie`, { encoding: "utf8" });
		assert.match(stdoutNoMatch, /No records matching 'Charlie' found in any text columns\./);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

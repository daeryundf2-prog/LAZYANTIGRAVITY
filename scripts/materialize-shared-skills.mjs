import { rm, cp, symlink, lstat } from "node:fs/promises";
import { resolve } from "node:path";

const targetDir = resolve("shared-skills");
const sourceDir = resolve("src/packages/shared-skills");

async function isSymlink(path) {
	try {
		const stat = await lstat(path);
		return stat.isSymbolicLink();
	} catch {
		return false;
	}
}

async function isDirectory(path) {
	try {
		const stat = await lstat(path);
		return stat.isDirectory() && !stat.isSymbolicLink();
	} catch {
		return false;
	}
}

async function run() {
	const mode = process.argv[2];

	if (mode === "--pack") {
		if (await isSymlink(targetDir)) {
			console.warn(`[materialize-shared-skills] Removing symlink: ${targetDir}`);
			await rm(targetDir);
			console.warn(`[materialize-shared-skills] Copying physical directory from ${sourceDir} to ${targetDir}`);
			await cp(sourceDir, targetDir, { recursive: true });
		} else {
			console.warn(`[materialize-shared-skills] ${targetDir} is already a physical directory or does not exist as symlink.`);
		}
	} else if (mode === "--restore") {
		if (await isDirectory(targetDir)) {
			console.warn(`[materialize-shared-skills] Removing physical directory: ${targetDir}`);
			await rm(targetDir, { recursive: true, force: true });
			console.warn(`[materialize-shared-skills] Recreating symlink pointing to src/packages/shared-skills`);
			await symlink("src/packages/shared-skills", targetDir);
		} else {
			console.warn(`[materialize-shared-skills] ${targetDir} is not a physical directory. Skipping restore.`);
		}
	} else {
		console.error("Invalid arguments. Use --pack or --restore.");
		process.exit(1);
	}
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});

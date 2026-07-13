import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { join } from "node:path";

function walk(root, relative = "") {
	if (!existsSync(root)) return [[relative, "missing"]];
	const stat = lstatSync(root);
	if (stat.isSymbolicLink()) return [[relative, `link:${readlinkSync(root)}`]];
	if (stat.isFile()) return [[relative, createHash("sha256").update(readFileSync(root)).digest("hex")]];
	if (!stat.isDirectory()) return [[relative, `special:${stat.mode}`]];
	const rows = [[relative, "directory"]];
	for (const name of readdirSync(root).sort()) rows.push(...walk(join(root, name), relative ? `${relative}/${name}` : name));
	return rows;
}

export function inventoryRoots(roots) {
	return Object.fromEntries([...roots].sort().map((root) => [root, createHash("sha256").update(JSON.stringify(walk(root))).digest("hex")]));
}

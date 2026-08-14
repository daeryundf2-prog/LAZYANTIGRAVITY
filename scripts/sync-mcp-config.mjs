import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function run() {
	const source = join(root, "mcp_config.json");
	const target = join(root, ".mcp.json");
	const content = await readFile(source, "utf8");
	await writeFile(target, content, "utf8");
	console.warn(`[sync-mcp-config] Synchronized mcp_config.json -> .mcp.json`);
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});

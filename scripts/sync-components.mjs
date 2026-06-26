import { cp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const components = [
	"comment-checker",
	"git-bash",
	"rules",
	"lsp",
	"telemetry",
	"start-work-continuation",
	"ulw-loop",
	"ultrawork"
];

const root = join(fileURLToPath(import.meta.url), "..", "..");
const sourceBase = join(root, "src", "packages", "omo-codex", "plugin", "components");
const targetBase = join(root, "components");

async function sync() {
	for (const comp of components) {
		const src = join(sourceBase, comp);
		const dst = join(targetBase, comp);

		console.log(`Syncing ${comp}...`);

		// Clean target folder (except node_modules)
		let existingEntries = [];
		try {
			existingEntries = await readdir(dst);
		} catch {}

		for (const entry of existingEntries) {
			if (entry === "node_modules") continue;
			await rm(join(dst, entry), { recursive: true, force: true });
		}

		// Copy from source to destination (except node_modules)
		const sourceEntries = await readdir(src);
		for (const entry of sourceEntries) {
			if (entry === "node_modules") continue;
			await cp(join(src, entry), join(dst, entry), { recursive: true });
		}
	}
	console.log("Component sync complete!");
}

sync().catch(console.error);

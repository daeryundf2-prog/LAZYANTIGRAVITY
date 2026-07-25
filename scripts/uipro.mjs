import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, "..");

// Path to the python search engine inside the materialized skills directory
const searchPyPath = join(pluginRoot, "skills", "frontend-ui-ux", "references", "ui-ux-db", "scripts", "search.py");

if (!existsSync(searchPyPath)) {
  console.error(`Error: search.py not found at ${searchPyPath}`);
  console.error("Please run 'npm run build' first to materialize the design database.");
  process.exit(1);
}

// Forward all command line arguments
const args = process.argv.slice(2);

const result = spawnSync("python3", [searchPyPath, ...args], {
  cwd: dirname(searchPyPath),
  stdio: "inherit",
});

process.exit(result.status ?? 0);

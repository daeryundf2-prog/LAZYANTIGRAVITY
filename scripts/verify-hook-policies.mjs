import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function walkHooks(value, path = "hooks") {
	const violations = [];
	if (Array.isArray(value)) {
		value.forEach((item, index) => violations.push(...walkHooks(item, `${path}[${index}]`)));
		return violations;
	}
	if (!value || typeof value !== "object") return violations;
	const record = value;
	if (record.failurePolicy === "FAIL_OPEN" || (typeof record.command === "string" && /hook-runner\.mjs\s+FAIL_OPEN\b/.test(record.command))) {
		const command = typeof record.command === "string" ? record.command : "";
		if (!/(telemetry|awt-guard|ulw-readiness)/i.test(command)) violations.push(`${path}: FAIL_OPEN is restricted to telemetry and guard hooks`);
	}
	for (const [key, child] of Object.entries(record)) violations.push(...walkHooks(child, `${path}.${key}`));
	return violations;
}

export async function verifyHookPolicies(path = join(root, "hooks.json")) {
	const paths = path === join(root, "hooks.json") ? [path, join(root, "hooks", "hooks.json")] : [path];
	const violations = [];
	for (const manifestPath of paths) {
		const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
		violations.push(...walkHooks(manifest, manifestPath));
	}
	if (violations.length > 0) throw new Error(violations.join("\n"));
	return true;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).pathname === new URL(import.meta.url).pathname) {
	verifyHookPolicies().then(() => process.stdout.write("Hook policy check passed\n")).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

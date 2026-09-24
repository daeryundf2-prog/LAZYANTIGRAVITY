// gen-sbom.mjs — package-lock.json에서 CycloneDX 1.5 SBOM을 생성한다.
// 외부 의존성 없이 lockfile의 해석된 버전·integrity 해시를 그대로 옮긴다.
//
//   node scripts/gen-sbom.mjs [--output sbom.cdx.json]

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
let output = null;
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--output" && args[i + 1]) output = args[++i];
	else throw new Error("Usage: gen-sbom.mjs [--output PATH]");
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));

function purlEncode(name) {
	// purl 스펙: 스코프 구분자 / 인코딩 — @scope/name → %40scope/name이 아니라 @scope/name
	return name.replace(/^@/, "%40");
}

const INTEGRITY_ALG = { "sha512-": "SHA-512", "sha384-": "SHA-384", "sha256-": "SHA-256", "sha1-": "SHA-1" };

const components = [];
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
	if (path === "") continue; // 루트는 metadata.component로 간다
	const isWorkspace = !path.startsWith("node_modules/") && !path.includes("/node_modules/");
	const name = entry.name ?? path.split("node_modules/").pop() ?? path;
	const version = entry.version ?? "0.0.0";
	const purl = `pkg:npm/${purlEncode(name)}@${version}`;
	const component = {
		type: "library",
		"bom-ref": purl,
		name,
		version,
		purl,
		scope: entry.dev ? "optional" : "required",
	};
	if (isWorkspace) {
		component.properties = [{ name: "lazyantigravity:workspace", value: path }];
	}
	if (typeof entry.integrity === "string") {
		for (const [prefix, alg] of Object.entries(INTEGRITY_ALG)) {
			if (entry.integrity.startsWith(prefix)) {
				component.hashes = [{ alg, content: entry.integrity.slice(prefix.length) }];
				break;
			}
		}
	}
	if (entry.license) {
		component.licenses = [{ license: { name: String(entry.license) } }];
	}
	components.push(component);
}
components.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const bom = {
	bomFormat: "CycloneDX",
	specVersion: "1.5",
	serialNumber: `urn:uuid:${randomUUID()}`,
	version: 1,
	metadata: {
		timestamp: new Date().toISOString(),
		component: {
			type: "application",
			"bom-ref": `pkg:npm/${purlEncode(pkg.name)}@${pkg.version}`,
			name: pkg.name,
			version: pkg.version,
			purl: `pkg:npm/${purlEncode(pkg.name)}@${pkg.version}`,
		},
	},
	components,
};

const json = `${JSON.stringify(bom, null, 2)}\n`;
if (output) {
	writeFileSync(output, json);
	console.error(`SBOM written: ${output} (${components.length} components, spec ${bom.specVersion})`);
} else {
	process.stdout.write(json);
}

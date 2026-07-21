import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const subjectRoot = resolve(process.env.LAZYANTIGRAVITY_PLUGIN_ROOT ?? repositoryRoot);

const CONTRACTS = [
	["contracts/antigravity/plugin.schema.json", "5385f0b27bd8ebda4eb122feeb24f9b5d4164879c3bcd0f857e1ffd6d34c7afb"],
	["contracts/antigravity/ide-2.0-plugins.md", "b655c9466658a2472ddb3b73a7b32eb08c5db271fd6944117600cfbb482cbe23"],
	["contracts/antigravity/cli-plugins.md", "d05a56a4636f3e14dcf44c2c207f2f4708e1e6a8e23d9d09c7d9ad5d948a6e75"],
];

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function fail(assertionId, detail) {
	throw new Error(`[${assertionId}] ${detail}`);
}

function parseJson(bytes, assertionId, label) {
	try {
		return JSON.parse(bytes.toString("utf8"));
	} catch {
		fail(assertionId, `${label} is not valid JSON`);
	}
}

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertPinnedHash(path, bytes, expectedHash) {
	const actualHash = sha256(bytes);
	if (actualHash !== expectedHash) {
		fail("manifest.contract-hashes", `${path} expected ${expectedHash}, received ${actualHash}`);
	}
}

function assertSchemaShape(schema) {
	assert.equal(schema.type, "object", "[manifest.schema-properties] schema type");
	assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), ["description", "name"], "[manifest.schema-properties] properties");
	assert.deepEqual(schema.required, ["name"], "[manifest.schema-properties] required");
	assert.equal(schema.additionalProperties, false, "[manifest.schema-properties] additionalProperties");
}

function assertRawConformance(rawManifest, schema) {
	const manifest = parseJson(rawManifest, "manifest.raw-conformance", "plugin.json");
	if (!isRecord(manifest)) fail("manifest.raw-conformance", "plugin.json must be an object");
	const allowed = new Set(Object.keys(schema.properties));
	const extras = Object.keys(manifest).filter((key) => !allowed.has(key));
	if (extras.length > 0) fail("manifest.raw-conformance", `additional properties: ${extras.join(", ")}`);
	for (const key of schema.required) {
		if (!Object.hasOwn(manifest, key)) fail("manifest.raw-conformance", `missing required property: ${key}`);
	}
	for (const [key, value] of Object.entries(manifest)) {
		const property = schema.properties[key];
		if (property.type === "string" && typeof value !== "string") fail("manifest.raw-conformance", `${key} must be a string`);
		if (typeof property.pattern === "string" && !new RegExp(property.pattern).test(value)) {
			fail("manifest.raw-conformance", `${key} does not match ${property.pattern}`);
		}
	}
	return manifest;
}

function assertPackageIdentity(manifest, packageJson) {
	assert.equal(packageJson.name, manifest.name, "[manifest.package-identity] name");
	assert.equal(packageJson.description, manifest.description, "[manifest.package-identity] description");
	assert.equal(packageJson.version, "0.2.2", "[manifest.package-identity] version");
	assert.equal(packageJson.engines?.node, ">=20.17", "[manifest.package-identity] engines.node");
	assert.equal(packageJson.license, "MIT", "[manifest.package-identity] license");
	assert.deepEqual(
		{ author: packageJson.author, developerName: packageJson.interface?.developerName },
		{ author: { name: "shin" }, developerName: "shin" },
		"[manifest.package-identity] project attribution",
	);
	assert.equal(
		packageJson.interface?.longDescription,
		"LazyAntigravity exposes the local OMO Rules, LSP, Ultrawork, and ulw-loop components as one plugin namespace.",
		"[manifest.package-identity] active capability description",
	);
	assert.ok(Array.isArray(packageJson.keywords) && packageJson.keywords.includes("antigravity"), "[manifest.package-identity] keywords");
	assert.equal(packageJson.interface?.displayName, "LazyAntigravity", "[manifest.package-identity] interface");
}

function sourceLine(source, lineNumber) {
	return source.replaceAll("\r\n", "\n").split("\n")[lineNumber - 1] ?? "";
}

function assertLineContains(source, path, lineNumber, expected, assertionId) {
	assert.match(sourceLine(source, lineNumber), expected, `[${assertionId}] ${path}:${lineNumber}`);
}

async function readSubject(relativePath) {
	return readFile(join(subjectRoot, relativePath));
}

test("[manifest.contract-hashes] #given pinned contracts #when hashed #then every byte matches", async () => {
	for (const [path, expectedHash] of CONTRACTS) assertPinnedHash(path, await readSubject(path), expectedHash);
});

test("[manifest.schema-properties] #given the pinned schema #when inspected #then only name and description are allowed", async () => {
	assertSchemaShape(parseJson(await readSubject(CONTRACTS[0][0]), "manifest.schema-properties", CONTRACTS[0][0]));
});

test("[manifest.docs-schema-example] #given the pinned CLI docs #when source lines are inspected #then the schema contradiction is preserved", async () => {
	const cli = (await readSubject(CONTRACTS[2][0])).toString("utf8");
	for (const line of [54, 70, 73, 80]) assertLineContains(cli, CONTRACTS[2][0], line, /\$schema/, "manifest.docs-schema-example");
});

test("[manifest.documented-layouts] #given pinned IDE and CLI docs #when layout lines are inspected #then all four roots are explicit", async () => {
	const ide = (await readSubject(CONTRACTS[1][0])).toString("utf8");
	const cli = (await readSubject(CONTRACTS[2][0])).toString("utf8");
	assertLineContains(ide, CONTRACTS[1][0], 67, /\.agents\/plugins\/.*_agents\/plugins\//, "manifest.documented-layouts");
	assertLineContains(ide, CONTRACTS[1][0], 68, /~\/\.gemini\/config\/plugins\//, "manifest.documented-layouts");
	assertLineContains(cli, CONTRACTS[2][0], 30, /~\/\.gemini\/antigravity-cli\/plugins\/<plugin_name>\//, "manifest.documented-layouts");
});

test("[manifest.raw-conformance] #given raw plugin bytes #when validated unchanged #then the pinned schema accepts them", async () => {
	const schema = parseJson(await readSubject(CONTRACTS[0][0]), "manifest.schema-properties", CONTRACTS[0][0]);
	const manifest = assertRawConformance(await readSubject("plugin.json"), schema);
	assert.deepEqual(Object.keys(manifest).sort(), ["description", "name"], "[manifest.raw-conformance] exact raw keys");
});

test("[manifest.package-identity] #given package metadata #when compared #then identity and release metadata agree", async () => {
	const schema = parseJson(await readSubject(CONTRACTS[0][0]), "manifest.schema-properties", CONTRACTS[0][0]);
	const manifest = assertRawConformance(await readSubject("plugin.json"), schema);
	const packageJson = parseJson(await readSubject("package.json"), "manifest.package-identity", "package.json");
	assertPackageIdentity(manifest, packageJson);
});

test("[manifest.adversarial-fixtures] #given drift fixtures #when checked #then exact assertion IDs reject them", async () => {
	const schema = parseJson(await readSubject(CONTRACTS[0][0]), "manifest.schema-properties", CONTRACTS[0][0]);
	for (const extra of ["$schema", "version"]) {
		assert.throws(
			() => assertRawConformance(Buffer.from(JSON.stringify({ name: "lazyantigravity", [extra]: "bad" })), schema),
			/\[manifest\.raw-conformance\]/,
		);
	}
	assert.throws(
		() => assertPinnedHash(CONTRACTS[0][0], Buffer.from("changed"), CONTRACTS[0][1]),
		/\[manifest\.contract-hashes\]/,
	);
	assert.throws(
		() =>
			assertPackageIdentity(
				{ name: "lazyantigravity", description: "same" },
				{ name: "lazyantigravity", description: "same", version: "0.2.3" },
			),
		/\[manifest\.package-identity\]/,
	);
});

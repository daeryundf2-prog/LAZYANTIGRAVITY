import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { UlwLoopError } from "./types.js";

export const TRUSTED_EVIDENCE_MANIFEST_KIND = "ulw-loop.evidence-capture.v1";
export const TRUSTED_EVIDENCE_MANIFEST_VERSION = 1;

export type TrustedEvidenceManifest = {
	readonly version: 1;
	readonly kind: typeof TRUSTED_EVIDENCE_MANIFEST_KIND;
	readonly command: readonly string[];
	readonly cwd: string;
	readonly exitCode: number;
	readonly exitSignal: string | null;
	readonly startedAt: string;
	readonly endedAt: string;
	readonly durationMs: number;
	readonly artifactPath: string;
	readonly artifactSha256: string;
	readonly nonce: string;
	readonly captureTool: "omo-ulw-loop capture-evidence";
};

export function fileSha256Hex(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function invalidManifest(message: string): never {
	throw new UlwLoopError(message, "ULW_LOOP_EVIDENCE_MANIFEST_INVALID");
}

function recordOf(value: unknown): Record<string, unknown> {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
	return invalidManifest("Trusted evidence manifest must be a JSON object.");
}

function stringField(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	if (typeof value === "string" && value.trim().length > 0) return value;
	return invalidManifest(`Trusted evidence manifest field ${key} must be a non-empty string.`);
}

function nullableStringField(record: Record<string, unknown>, key: string): string | null {
	const value = record[key];
	if (value === null) return null;
	if (typeof value === "string" && value.trim().length > 0) return value;
	return invalidManifest(`Trusted evidence manifest field ${key} must be a non-empty string or null.`);
}

function numberField(record: Record<string, unknown>, key: string): number {
	const value = record[key];
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
	return invalidManifest(`Trusted evidence manifest field ${key} must be a non-negative number.`);
}

function commandField(record: Record<string, unknown>): readonly string[] {
	const value = record["command"];
	if (!Array.isArray(value) || value.length === 0) {
		return invalidManifest("Trusted evidence manifest field command must be a non-empty string array.");
	}
	for (const part of value) {
		if (typeof part !== "string" || part.trim().length === 0) {
			return invalidManifest("Trusted evidence manifest field command must contain only non-empty strings.");
		}
	}
	return value;
}

export function parseTrustedEvidenceManifest(raw: string): TrustedEvidenceManifest {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new UlwLoopError(
			`Trusted evidence manifest is invalid JSON: ${message}`,
			"ULW_LOOP_EVIDENCE_MANIFEST_INVALID",
			{
				cause: error,
			},
		);
	}
	const record = recordOf(parsed);
	if (record["version"] !== TRUSTED_EVIDENCE_MANIFEST_VERSION) {
		return invalidManifest("Trusted evidence manifest version must be 1.");
	}
	if (record["kind"] !== TRUSTED_EVIDENCE_MANIFEST_KIND) {
		return invalidManifest(`Trusted evidence manifest kind must be ${TRUSTED_EVIDENCE_MANIFEST_KIND}.`);
	}
	const captureTool = stringField(record, "captureTool");
	if (captureTool !== "omo-ulw-loop capture-evidence") {
		return invalidManifest("Trusted evidence manifest captureTool must be omo-ulw-loop capture-evidence.");
	}
	return {
		version: TRUSTED_EVIDENCE_MANIFEST_VERSION,
		kind: TRUSTED_EVIDENCE_MANIFEST_KIND,
		command: commandField(record),
		cwd: stringField(record, "cwd"),
		exitCode: numberField(record, "exitCode"),
		exitSignal: nullableStringField(record, "exitSignal"),
		startedAt: stringField(record, "startedAt"),
		endedAt: stringField(record, "endedAt"),
		durationMs: numberField(record, "durationMs"),
		artifactPath: stringField(record, "artifactPath"),
		artifactSha256: stringField(record, "artifactSha256"),
		nonce: stringField(record, "nonce"),
		captureTool: "omo-ulw-loop capture-evidence",
	};
}

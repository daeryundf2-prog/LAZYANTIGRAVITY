#!/usr/bin/env node
/**
 * check_contract_drift.mjs — contracts/ 벤더 파일이 PIN.json 해시와 일치하는지 검사.
 * 수동 편집 드리프트 탐지용. exit 1 = drift.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pinPath = path.join(root, "contracts", "PIN.json");

if (!fs.existsSync(pinPath)) {
	console.error("[contract-drift] PIN.json 없음 — contracts가 벤더링되지 않음");
	process.exit(1);
}

const pin = JSON.parse(fs.readFileSync(pinPath, "utf8"));
let drift = 0;
for (const [name, want] of Object.entries(pin.sha256 ?? {})) {
	const f = path.join(root, "contracts", name);
	if (!fs.existsSync(f)) {
		console.error(`[contract-drift] MISSING contracts/${name}`);
		drift++;
		continue;
	}
	const got = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
	if (got !== want) {
		console.error(`[contract-drift] DRIFT contracts/${name}: ${got.slice(0, 16)}… != pin ${want.slice(0, 16)}…`);
		drift++;
	}
}
if (drift === 0) {
	console.log(`[contract-drift] OK — ${Object.keys(pin.sha256 ?? {}).length} files match pin ${pin.upstream_commit}`);
}
process.exit(drift === 0 ? 0 : 1);

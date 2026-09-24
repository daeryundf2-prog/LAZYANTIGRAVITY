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

// 체크아웃 시 CRLF 변환이 PIN 해시를 깨지 못하게 contracts/는 -text여야 한다.
const attrPath = path.join(root, ".gitattributes");
const attrOk = fs.existsSync(attrPath)
	&& fs.readFileSync(attrPath, "utf8").split(/\r?\n/).some((line) => {
		const l = line.trim();
		return !l.startsWith("#") && /^contracts?\/\*\*?\s/.test(l) && l.includes("-text");
	});
if (!attrOk) {
	console.error("[contract-drift] .gitattributes에 `contracts/** -text` 규칙 없음 — Windows 체크아웃에서 CRLF 드리프트가 재발합니다");
	process.exit(1);
}

const pin = JSON.parse(fs.readFileSync(pinPath, "utf8"));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

let drift = 0;
for (const [name, want] of Object.entries(pin.sha256 ?? {})) {
	const f = path.join(root, "contracts", name);
	if (!fs.existsSync(f)) {
		console.error(`[contract-drift] MISSING contracts/${name}`);
		drift++;
		continue;
	}
	const bytes = fs.readFileSync(f);
	const got = sha256(bytes);
	if (got !== want) {
		const lfStripped = sha256(Buffer.from(bytes.toString("binary").replace(/\r\n/g, "\n"), "binary"));
		const hint = lfStripped === want
			? " — 진단: CRLF 줄바꿈 변환 감지. `git checkout -- contracts/`로 LF 바이트를 복원하세요"
			: "";
		console.error(`[contract-drift] DRIFT contracts/${name}: ${got.slice(0, 16)}… != pin ${want.slice(0, 16)}…${hint}`);
		drift++;
	}
}
if (drift === 0) {
	console.log(`[contract-drift] OK — ${Object.keys(pin.sha256 ?? {}).length} files match pin ${pin.upstream_commit}`);
}
process.exit(drift === 0 ? 0 : 1);

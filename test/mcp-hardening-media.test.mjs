import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runBoundedBinary } from "../media-mcp/src/process-runner.mjs";

// fileURLToPath 필수 — Windows에서 URL.pathname은 /C:/... 형태라 경로가 깨진다
const server = fileURLToPath(new URL("../media-mcp/dist/cli.js", import.meta.url));
function fixture() {
	const dir = mkdtempSync(join(tmpdir(), "mcp-hardening-media-"));
	const binary = join(dir, "synthetic-media");
	writeFileSync(binary, `#!${process.execPath}\nconst fs=require("node:fs"); const a=process.argv.slice(2); if(a.includes("--version") || a.includes("-version") || a.includes("--help")){console.log("synthetic 1.0");process.exit(0);} const mode=process.env.SYNTHETIC_MODE; if(mode!=="missing"){ const out=a.includes("-otxt") ? a[a.indexOf("-of")+1]+".txt" : a.includes("-l") ? a[1]+".txt" : a.at(-1); fs.writeFileSync(out,mode==="empty"?"":"synthetic transcript"); } process.exit(mode==="partial"?2:0);\n`);
	chmodSync(binary, 0o700);
	writeFileSync(join(dir, "input.wav"), "synthetic input");
	writeFileSync(join(dir, "model.bin"), "synthetic model");
	return { dir, binary };
}
function call(f, name, args, mode = "complete") {
	const child = spawnSync(process.execPath, [server, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
		cwd: f.dir, encoding: "utf8", timeout: 10000,
		env: { ...process.env, LAZYANTIGRAVITY_WORKSPACE_ROOT: f.dir, LAZYANTIGRAVITY_OFFLINE: "1", LAZYANTIGRAVITY_TESSERACT_BIN: f.binary, LAZYANTIGRAVITY_FFMPEG_BIN: f.binary, LAZYANTIGRAVITY_WHISPER_BIN: f.binary, SYNTHETIC_MODE: mode },
	});
	assert.equal(child.status, 0, child.stderr);
	const rpc = JSON.parse(child.stdout);
	assert.ok(rpc.result, child.stdout);
	return JSON.parse(rpc.result.content[0].text);
}

test("media OCR receipt records actual source/artifact hashes and exit status", { skip: process.platform === "win32" && "synthetic shebang binary requires POSIX exec" }, () => {
	for (const mode of ["complete", "partial", "missing", "empty"]) {
		const f = fixture();
		const result = call(f, "media_ocr", { input: "input.wav", case_id: "synthetic-case", evidence_id: "synthetic-evidence" }, mode);
		assert.equal(result.status, mode === "missing" || mode === "empty" ? "failed" : mode);
		assert.equal(result.ok, mode === "complete" || mode === "partial" ? mode === "complete" : false);
		const receipt = result.processing_receipt;
		assert.equal(receipt.schema_version, "1.0");
		assert.equal(receipt.evidence_id, "synthetic-evidence");
		assert.equal(receipt.case_id, "synthetic-case");
		assert.equal(receipt.review.status, "pending");
		assert.equal(receipt.source.sha256, createHash("sha256").update("synthetic input").digest("hex"));
		assert.equal(receipt.exit_code, mode === "partial" ? 2 : 0);
		if (mode === "partial") assert.ok(receipt.artifacts.length > 0);
		assert.match(receipt.started_at, /Z$/);
		assert.match(receipt.finished_at, /Z$/);
		for (const artifact of receipt.artifacts) assert.equal(artifact.sha256, createHash("sha256").update(readFileSync(artifact.path)).digest("hex"));
	}
});

test("media whisper uses the same measured failure contract", { skip: process.platform === "win32" && "synthetic shebang binary requires POSIX exec" }, () => {
	const f = fixture();
	const result = call(f, "media_transcribe", { input: "input.wav", model: "model.bin" });
	assert.equal(result.ok, true);
	assert.equal(result.status, "complete");
	assert.equal(result.processing_receipt.exit_code, 0);
	assert.equal(result.text, "synthetic transcript");
});

test("media subprocess runner stays nonblocking and enforces bounded queue", async () => {
	let timerRan = false;
	setTimeout(() => { timerRan = true; }, 10);
	const jobs = Array.from({ length: 12 }, () => runBoundedBinary(process.execPath, ["-e", "setTimeout(()=>process.stdout.write('synthetic'), 50)"], 2000));
	const results = await Promise.all(jobs);
	assert.equal(timerRan, true);
	assert.equal(results.filter((r) => r.error === "Media subprocess queue full").length, 2);
	assert.equal(results.filter((r) => r.ok).length, 10);
	const timed = await runBoundedBinary(process.execPath, ["-e", "setTimeout(()=>{},1000)"], 20);
	assert.equal(timed.ok, false);
	assert.match(timed.error, /timed out/);
	const capped = await runBoundedBinary(process.execPath, ["-e", "process.stdout.write('synthetic')"], 2000, { maxStdout: 4 });
	assert.equal(capped.ok, false);
	assert.match(capped.error, /byte limit/);
});

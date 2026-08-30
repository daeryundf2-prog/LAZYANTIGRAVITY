import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVER = join(ROOT, "media-mcp", "dist", "cli.js");

function binaryAvailable(kind) {
	const spec = { ffmpeg: "-version", ffprobe: "-version", tesseract: "--version", ytdlp: "--version" }[kind];
	if (!spec) return false;
	const override = process.env[`LAZYANTIGRAVITY_${kind.toUpperCase()}_BIN`];
	return spawnSync(override || kind, [spec], { encoding: "utf8", timeout: 15000 }).status === 0;
}

function callTool(name, args, cwd) {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
		encoding: "utf8",
		timeout: 120000,
		cwd,
	});
	assert.equal(res.status, 0, res.stderr);
	const output = JSON.parse(res.stdout);
	assert.ok(output.result, JSON.stringify(output));
	return JSON.parse(output.result.content[0].text);
}

function withWorkspace(fn) {
	const dir = mkdtempSync(join(tmpdir(), "media-mcp-"));
	try {
		fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("media-mcp exposes the five media tools", () => {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
		encoding: "utf8",
		timeout: 15000,
	});
	assert.equal(res.status, 0);
	const tools = JSON.parse(res.stdout).result.tools.map((t) => t.name);
	assert.deepEqual(tools, ["media_probe", "media_frames", "media_ocr", "media_transcribe", "media_youtube"]);
});

test("media tools reject paths outside the workspace", () => {
	withWorkspace((dir) => {
		const probe = callTool("media_probe", { input: "/etc/hosts" }, dir);
		assert.equal(probe.ok, false);
		assert.match(probe.error, /workspace-relative/);
		const ocr = callTool("media_ocr", { input: "~/secret.png" }, dir);
		assert.equal(ocr.ok, false);
	});
});

test("media_transcribe degrades honestly without the whisper binary or model", () => {
	withWorkspace((dir) => {
		mkdirSync(join(dir, "audio"), { recursive: true });
		const res = callTool("media_transcribe", { input: "audio/clip.mp4" }, dir);
		assert.equal(res.ok, false);
		if (!binaryAvailable("whisper")) {
			assert.match(res.error, /NOT INSTALLED/);
			assert.ok(res.installHint, "install hint expected");
		}
	});
});

test("media_youtube is gated behind the network opt-in", () => {
	withWorkspace((dir) => {
		const res = callTool("media_youtube", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }, dir);
		assert.equal(res.ok, false);
		assert.match(res.error, /LAZYANTIGRAVITY_MEDIA_NETWORK=1/);
	});
});

test("media_probe works end-to-end when ffmpeg is available", () => {
	if (!binaryAvailable("ffmpeg")) return; // CI without ffmpeg: skip silently
	withWorkspace((dir) => {
		const gen = spawnSync("ffmpeg", [
			"-y", "-f", "lavfi", "-i", "testsrc=duration=2:s=320x240",
			"-pix_fmt", "yuv420p", join(dir, "clip.mp4"), "-loglevel", "error",
		], { encoding: "utf8", timeout: 60000 });
		assert.equal(gen.status, 0, gen.stderr);
		const probe = callTool("media_probe", { input: "clip.mp4" }, dir);
		assert.equal(probe.ok, true);
		assert.equal(probe.streams[0].codec, "h264");
	});
});

test("media_frames extracts and restores nothing outside the workspace", () => {
	if (!binaryAvailable("ffmpeg")) return;
	withWorkspace((dir) => {
		const gen = spawnSync("ffmpeg", [
			"-y", "-f", "lavfi", "-i", "testsrc=duration=3:s=320x240",
			"-pix_fmt", "yuv420p", join(dir, "clip.mp4"), "-loglevel", "error",
		], { encoding: "utf8", timeout: 60000 });
		assert.equal(gen.status, 0, gen.stderr);
		const frames = callTool("media_frames", { input: "clip.mp4", intervalSec: 1, maxFrames: 5 }, dir);
		assert.equal(frames.ok, true);
		assert.ok(frames.totalFrames >= 2);
		for (const frame of frames.frames) {
			assert.ok(!frame.includes("/etc"), "frames must live inside the workspace");
			assert.ok(existsSync(frame));
		}
	});
});

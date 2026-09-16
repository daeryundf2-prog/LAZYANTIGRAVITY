import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVER = join(ROOT, "media-mcp", "dist", "cli.js");

function binaryAvailable(kind) {
	const spec = {
		ffmpeg: ["-version"],
		ffprobe: ["-version"],
		tesseract: ["--version"],
		whisper: ["--help"],
		ytdlp: ["--version"],
	}[kind];
	if (!spec) return false;
	const override = process.env[`LAZYANTIGRAVITY_${kind.toUpperCase()}_BIN`];
	const candidates = override ? [override] : (kind === "whisper" ? ["whisper-cli", "whisper-cpp", "whisper"] : [kind]);
	for (const bin of candidates) {
		const res = spawnSync(bin, spec, { encoding: "utf8", timeout: 15000, input: "" });
		if (res.status === 0) return true;
	}
	return false;
}

function callTool(name, args, cwd, extraEnv) {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
		encoding: "utf8",
		timeout: 120000,
		cwd,
		env: { ...process.env, ...extraEnv },
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

test("media-mcp exposes the media tools", () => {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
		encoding: "utf8",
		timeout: 15000,
	});
	assert.equal(res.status, 0);
	const tools = JSON.parse(res.stdout).result.tools.map((t) => t.name);
	assert.deepEqual(tools, [
		"media_probe", "media_frames", "media_ocr", "media_transcribe",
		"media_transcribe_start", "media_transcribe_status",
		"media_cleanup", "media_youtube",
	]);
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
		writeFileSync(join(dir, "audio", "clip.mp4"), "fake audio content");
		const res = callTool("media_transcribe", { input: "audio/clip.mp4" }, dir);
		assert.equal(res.ok, false);
		if (!binaryAvailable("whisper")) {
			assert.match(res.error, /NOT INSTALLED/);
			assert.ok(res.installHint, "install hint expected");
		} else {
			assert.match(res.error, /whisper model file not found/);
		}
	});
});

test("media_transcribe_start degrades honestly and status reports unknown jobs", () => {
	withWorkspace((dir) => {
		mkdirSync(join(dir, "audio"), { recursive: true });
		writeFileSync(join(dir, "audio", "clip.mp4"), "fake audio content");
		const res = callTool("media_transcribe_start", { input: "audio/clip.mp4" }, dir);
		assert.equal(res.ok, false);
		if (!binaryAvailable("whisper")) {
			assert.match(res.error, /NOT INSTALLED/);
		} else {
			assert.match(res.error, /whisper model file not found/);
		}
		const st = callTool("media_transcribe_status", { jobId: "job-1-abc" }, dir);
		assert.equal(st.ok, false);
		assert.match(st.error, /no such job/);
		const bad = callTool("media_transcribe_status", { jobId: "../../etc" }, dir);
		assert.equal(bad.ok, false);
	});
});

test("media_youtube is gated behind the network opt-in", () => {
	withWorkspace((dir) => {
		const res = callTool("media_youtube", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }, dir);
		assert.equal(res.ok, false);
		assert.match(res.error, /LAZYANTIGRAVITY_MEDIA_NETWORK=1/);
	});
});

test("media_transcribe backend=gemini without the STT gate falls back to whisper", () => {
	withWorkspace((dir) => {
		const res = callTool("media_transcribe", { input: "clip.wav", backend: "gemini" }, dir, {
			LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT: "",
		});
		if (res.ok) {
			assert.equal(res.backend, "whisper");
			assert.equal(res.requestedBackend, "gemini");
			assert.match(res.fallbackReason, /LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT=1/);
		} else {
			assert.match(res.error, /LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT=1/);
		}
	});
});

test("media_transcribe backend=gemini without an API key falls back to whisper", () => {
	withWorkspace((dir) => {
		const res = callTool("media_transcribe", { input: "clip.wav", backend: "gemini" }, dir, {
			LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT: "1",
			GEMINI_API_KEY: "",
			GOOGLE_API_KEY: "",
		});
		if (res.ok) {
			assert.equal(res.backend, "whisper");
			assert.match(res.fallbackReason, /GEMINI_API_KEY/);
		} else {
			assert.match(res.error, /GEMINI_API_KEY/);
		}
	});
});

test("media_transcribe backend=gemini rejects incompatible option combos before egress", () => {
	if (!binaryAvailable("ffmpeg") || !binaryAvailable("ffprobe")) return;
	withWorkspace((dir) => {
		const gen = spawnSync("ffmpeg", [
			"-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
			join(dir, "clip.wav"), "-loglevel", "error",
		], { encoding: "utf8", timeout: 60000 });
		assert.equal(gen.status, 0, gen.stderr);
		const env = { LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT: "1", GEMINI_API_KEY: "test-key-not-used" };
		const vocab = callTool("media_transcribe", {
			input: "clip.wav", backend: "gemini", confirmNotClientData: true, diarization: true, customVocabulary: ["foo"],
		}, dir, env);
		assert.equal(vocab.ok, false);
		assert.match(vocab.error, /customVocabulary/);
		const smart = callTool("media_transcribe", {
			input: "clip.wav", backend: "gemini", confirmNotClientData: true, mode: "smart", wordTimestamps: true,
		}, dir, env);
		assert.equal(smart.ok, false);
		assert.match(smart.error, /mode=smart/);
	});
});

test("media_transcribe backend=gemini without client-data confirmation falls back to whisper", () => {
	if (!binaryAvailable("ffmpeg") || !binaryAvailable("ffprobe")) return;
	withWorkspace((dir) => {
		const gen = spawnSync("ffmpeg", [
			"-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
			join(dir, "clip.wav"), "-loglevel", "error",
		], { encoding: "utf8", timeout: 60000 });
		assert.equal(gen.status, 0, gen.stderr);
		const env = { LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT: "1", GEMINI_API_KEY: "test-key-not-used" };
		const res = callTool("media_transcribe", { input: "clip.wav", backend: "gemini" }, dir, env);
		if (res.ok) {
			assert.equal(res.backend, "whisper");
			assert.match(res.fallbackReason, /confirmation/);
		} else {
			assert.match(res.error, /client-data confirmation/);
		}
	});
});

test("media_transcribe backend=gemini never uploads local-only dirs, falls back to whisper", () => {
	if (!binaryAvailable("ffmpeg") || !binaryAvailable("ffprobe")) return;
	withWorkspace((dir) => {
		mkdirSync(join(dir, "evidence"), { recursive: true });
		const gen = spawnSync("ffmpeg", [
			"-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
			join(dir, "evidence", "clip.wav"), "-loglevel", "error",
		], { encoding: "utf8", timeout: 60000 });
		assert.equal(gen.status, 0, gen.stderr);
		const res = callTool("media_transcribe", {
			input: "evidence/clip.wav", backend: "gemini", confirmNotClientData: true,
		}, dir, {
			LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT: "1",
			GEMINI_API_KEY: "test-key-not-used",
			LAZYANTIGRAVITY_MEDIA_LOCAL_ONLY_DIRS: "evidence,cases",
		});
		if (res.ok) {
			assert.equal(res.backend, "whisper");
			assert.match(res.fallbackReason, /local-only/);
		} else {
			assert.match(res.error, /local-only/);
		}
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

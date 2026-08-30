#!/usr/bin/env node
// Media MCP server: audio/video/image analysis through local binaries
// (ffmpeg/ffprobe/tesseract/whisper.cpp) plus an explicitly opt-in YouTube
// fetcher (yt-dlp). Everything is workspace-confined; no network egress
// unless the YouTube gate is enabled.
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

// Startup guard (same contract as the other bundled servers).
const pluginRootEnv = process.env["PLUGIN_ROOT"];
if (pluginRootEnv) {
	const cwd = resolve(process.cwd());
	const root = resolve(pluginRootEnv);
	if (cwd === root || cwd.startsWith(root + sep)) {
		process.stderr.write(
			`[media-mcp] WARNING: cwd is inside PLUGIN_ROOT (${pluginRootEnv}); media tools would operate on the plugin tree, not the user's workspace. Set the server "cwd" to the user workspace in mcp_config.json, or set LAZYANTIGRAVITY_WORKSPACE_ROOT.\n`,
		);
	}
}

const MAX_INPUT_BYTES = 1024 * 1024 * 1024; // 1 GB
const MAX_OUTPUT_CHARS = 200_000;
const MAX_FRAMES = 60;
const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com", "youtu.be", "m.youtube.com", "music.youtube.com"]);

function getWorkspaceRoot() {
	return resolve(process.env["LAZYANTIGRAVITY_WORKSPACE_ROOT"] || process.cwd());
}

function isInsideRoot(candidate, root) {
	const withSep = candidate.endsWith(sep) ? candidate : candidate + sep;
	return withSep.startsWith(root.endsWith(sep) ? root : root + sep);
}

function textResult(payload, isError = false) {
	return {
		content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
		...(isError ? { isError: true } : {}),
	};
}

// ---------------------------------------------------------------------------
// Binary availability: every tool degrades to an honest "not installed"
// answer with an install hint instead of a confusing spawn failure.
// ---------------------------------------------------------------------------
const BINARY_SPECS = {
	ffmpeg: { candidates: ["ffmpeg"], versionArg: "-version", hint: "brew install ffmpeg  |  apt install ffmpeg" },
	ffprobe: { candidates: ["ffprobe"], versionArg: "-version", hint: "brew install ffmpeg  |  apt install ffmpeg" },
	tesseract: { candidates: ["tesseract"], versionArg: "--version", hint: "brew install tesseract tesseract-lang  |  apt install tesseract tesseract-ocr-kor" },
	whisper: { candidates: ["whisper-cli", "whisper-cpp", "whisper"], versionArg: "--help", hint: "build whisper.cpp (github.com/ggml-org/whisper.cpp) or brew install whisper-cpp; set LAZYANTIGRAVITY_WHISPER_BIN if the binary has a custom name" },
	ytdlp: { candidates: ["yt-dlp"], versionArg: "--version", hint: "brew install yt-dlp  |  pip install yt-dlp" },
};
const binaryCache = new Map();

function findBinary(kind) {
	if (binaryCache.has(kind)) return binaryCache.get(kind);
	const spec = BINARY_SPECS[kind];
	if (!spec) return null;
	const override = process.env[`LAZYANTIGRAVITY_${kind.toUpperCase()}_BIN`];
	const candidates = override ? [override] : spec.candidates;
	let found = null;
	for (const candidate of candidates) {
		const res = spawnSync(candidate, [spec.versionArg], { encoding: "utf8", timeout: 15000 });
		if (res.status === 0) {
			found = candidate;
			break;
		}
	}
	binaryCache.set(kind, found);
	return found;
}

function missingBinaryResult(kind) {
	const spec = BINARY_SPECS[kind];
	return textResult(
		{
			ok: false,
			toolAvailable: false,
			error: `Required binary '${kind}' NOT INSTALLED on this machine.`,
			installHint: spec.hint,
		},
		true,
	);
}

// ---------------------------------------------------------------------------
// Workspace confinement shared by every tool.
// ---------------------------------------------------------------------------
function confineInputPath(rawPath) {
	if (typeof rawPath !== "string" || rawPath.length === 0) {
		return { ok: false, error: "input path must be a non-empty string." };
	}
	if (rawPath.startsWith("~") || isAbsolute(rawPath) || /^[A-Za-z]:[\\/]/.test(rawPath)) {
		return { ok: false, error: `input '${rawPath}' must be a workspace-relative path (absolute and ~ paths are rejected).` };
	}
	const root = getWorkspaceRoot();
	const candidate = resolve(root, rawPath);
	if (!isInsideRoot(candidate, root)) {
		return { ok: false, error: `input '${rawPath}' resolves outside the workspace root (${root}).` };
	}
	if (!existsSync(candidate)) {
		return { ok: false, error: `input '${rawPath}' does not exist in the workspace.` };
	}
	if (statSync(candidate).size > MAX_INPUT_BYTES) {
		return { ok: false, error: `input '${rawPath}' exceeds the ${MAX_INPUT_BYTES / (1024 * 1024)} MB limit.` };
	}
	return { ok: true, path: candidate };
}

function mediaWorkDir(prefix) {
	const dir = join(getWorkspaceRoot(), ".lazyantigravity", "media", `${prefix}-${Date.now()}`);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	return dir;
}

function truncate(text, max = MAX_OUTPUT_CHARS) {
	if (typeof text !== "string" || text.length <= max) return text;
	return `${text.slice(0, max)}\n[output truncated at ${max} chars]`;
}

function runBinary(binary, args, timeoutMs) {
	const res = spawnSync(binary, args, { encoding: "utf8", timeout: timeoutMs, shell: false });
	if (res.error) {
		return { ok: false, error: res.error.message };
	}
	return { ok: res.status === 0, status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
async function mediaProbe(args) {
	const missing = findBinary("ffprobe") === null;
	if (missing) return missingBinaryResult("ffprobe");
	const confined = confineInputPath(args.input);
	if (!confined.ok) return textResult({ ok: false, error: confined.error }, true);
	const res = runBinary(findBinary("ffprobe"), ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", confined.path], 30000);
	if (!res.ok) {
		return textResult({ ok: false, error: truncate(res.stderr || res.stdout || "ffprobe failed") }, true);
	}
	let parsed = {};
	try {
		parsed = JSON.parse(res.stdout);
	} catch {
		return textResult({ ok: false, error: "ffprobe returned unparseable output" }, true);
	}
	return textResult({
		ok: true,
		input: args.input,
		format: parsed.format
			? {
					durationSeconds: Number(parsed.format.duration ?? 0),
					sizeBytes: Number(parsed.format.size ?? 0),
					formatName: parsed.format.format_name,
					bitRate: Number(parsed.format.bit_rate ?? 0),
				}
			: null,
		streams: (parsed.streams ?? []).map((stream) => ({
			type: stream.codec_type,
			codec: stream.codec_name,
			...(stream.width ? { width: stream.width, height: stream.height } : {}),
			...(stream.sample_rate ? { sampleRate: stream.sample_rate } : {}),
		})),
	});
}

async function mediaFrames(args) {
	if (findBinary("ffmpeg") === null) return missingBinaryResult("ffmpeg");
	const confined = confineInputPath(args.input);
	if (!confined.ok) return textResult({ ok: false, error: confined.error }, true);
	const intervalSec = Number(args.intervalSec) > 0 ? Number(args.intervalSec) : 5;
	const maxFrames = Math.min(Math.max(Number(args.maxFrames) || 10, 1), MAX_FRAMES);
	const outDir = mediaWorkDir("frames");
	const pattern = join(outDir, "frame-%03d.jpg");
	const res = runBinary(
		findBinary("ffmpeg"),
		["-y", "-i", confined.path, "-vf", `fps=1/${intervalSec}`, "-frames:v", String(maxFrames), "-q:v", "3", pattern],
		Number(args.timeoutSec) > 0 ? Math.min(Number(args.timeoutSec), 900) * 1000 : 300000,
	);
	const frames = readdirSync(outDir).filter((f) => f.endsWith(".jpg")).sort();
	if (frames.length === 0) {
		return textResult({ ok: false, error: truncate(`no frames extracted: ${res.stderr || res.stdout || "unknown error"}`) }, true);
	}
	return textResult({
		ok: true,
		outDir,
		intervalSec,
		frames: frames.map((f) => join(outDir, f)),
		totalFrames: frames.length,
		note: "Open the frame images with the host's native vision to analyze content.",
	});
}

async function mediaOcr(args) {
	if (findBinary("tesseract") === null) return missingBinaryResult("tesseract");
	const confined = confineInputPath(args.input);
	if (!confined.ok) return textResult({ ok: false, error: confined.error }, true);
	const lang = typeof args.lang === "string" && args.lang.trim() ? args.lang.trim() : "kor+eng";
	const outDir = mediaWorkDir("ocr");
	const outBase = join(outDir, "ocr");
	const res = runBinary(findBinary("tesseract"), [confined.path, outBase, "-l", lang], 180000);
	const textPath = `${outBase}.txt`;
	if (!existsSync(textPath)) {
		return textResult({ ok: false, error: truncate(`tesseract failed: ${res.stderr || res.stdout || "no output"}`) }, true);
	}
	const text = readFileSync(textPath, "utf8").trim();
	return textResult({ ok: true, input: args.input, lang, textPath, text: truncate(text), chars: text.length });
}

function resolveWhisperModel(args) {
	if (typeof args.model === "string" && args.model.trim().length > 0) return args.model.trim();
	if (process.env["LAZYANTIGRAVITY_WHISPER_MODEL"]) return process.env["LAZYANTIGRAVITY_WHISPER_MODEL"];
	return null;
}

async function mediaTranscribe(args) {
	if (findBinary("whisper") === null) return missingBinaryResult("whisper");
	if (findBinary("ffmpeg") === null) return missingBinaryResult("ffmpeg");
	const confined = confineInputPath(args.input);
	if (!confined.ok) return textResult({ ok: false, error: confined.error }, true);
	const model = resolveWhisperModel(args);
	if (!model || !existsSync(model)) {
		return textResult(
			{
				ok: false,
				error: "whisper model file not found. Pass model=<path to ggml-*.bin> or set LAZYANTIGRAVITY_WHISPER_MODEL.",
				hint: "Download a ggml model from huggingface.co/ggerganov/whisper.cpp (e.g. ggml-base.bin).",
			},
			true,
		);
	}
	const workDir = mediaWorkDir("transcribe");
	const wavPath = join(workDir, "audio-16k.wav");
	const conv = runBinary(findBinary("ffmpeg"), ["-y", "-i", confined.path, "-vn", "-ar", "16000", "-ac", "1", wavPath], 600000);
	if (!conv.ok) {
		return textResult({ ok: false, error: truncate(`ffmpeg audio extraction failed: ${conv.stderr || conv.stdout}`) }, true);
	}
	const outBase = join(workDir, "transcript");
	const timeoutMs = Number(args.timeoutSec) > 0 ? Math.min(Number(args.timeoutSec), 3600) * 1000 : 3600000;
	const res = runBinary(findBinary("whisper"), ["-m", model, "-f", wavPath, "-otxt", "-of", outBase], timeoutMs);
	const textPath = `${outBase}.txt`;
	if (!existsSync(textPath)) {
		return textResult({ ok: false, error: truncate(`whisper failed: ${res.stderr || res.stdout || "no output"}`) }, true);
	}
	const text = readFileSync(textPath, "utf8").trim();
	return textResult({ ok: true, input: args.input, model, textPath, text: truncate(text), chars: text.length });
}

function isAllowedYouTubeUrl(rawUrl) {
	try {
		const url = new URL(String(rawUrl));
		return (url.protocol === "https:" || url.protocol === "http:") && YOUTUBE_HOSTS.has(url.hostname);
	} catch {
		return false;
	}
}

async function mediaYoutube(args) {
	if (process.env["LAZYANTIGRAVITY_MEDIA_NETWORK"] !== "1") {
		return textResult(
			{
				ok: false,
				error:
					"media_youtube performs network egress and requires the LAZYANTIGRAVITY_MEDIA_NETWORK=1 " +
					"environment opt-in (set it in mcp_config.json env for this server).",
			},
			true,
		);
	}
	if (findBinary("ytdlp") === null) return missingBinaryResult("ytdlp");
	const rawUrl = String(args.url ?? "");
	if (!isAllowedYouTubeUrl(rawUrl)) {
		return textResult({ ok: false, error: "url must be an https YouTube URL (youtube.com / youtu.be)." }, true);
	}
	const subaction = args.subaction === "audio" || args.subaction === "subtitles" ? args.subaction : "metadata";
	const ytdlp = findBinary("ytdlp");
	const outDir = mediaWorkDir(`yt-${subaction}`);

	if (subaction === "metadata") {
		const res = runBinary(ytdlp, ["--dump-single-json", "--no-warnings", rawUrl], 120000);
		if (!res.ok) return textResult({ ok: false, error: truncate(res.stderr || "yt-dlp failed") }, true);
		let meta = {};
		try {
			const full = JSON.parse(res.stdout);
			meta = {
				title: full.title,
				id: full.id,
				durationSeconds: full.duration,
				uploader: full.uploader,
				live: full.is_live,
			};
		} catch {
			return textResult({ ok: false, error: "yt-dlp returned unparseable metadata" }, true);
		}
		return textResult({ ok: true, subaction, meta });
	}

	if (subaction === "subtitles") {
		const lang = typeof args.lang === "string" && args.lang.trim() ? args.lang.trim() : "ko,en";
		const res = runBinary(
			ytdlp,
			["--skip-download", "--write-auto-sub", "--write-sub", "--sub-lang", lang, "--sub-format", "vtt", "-o", join(outDir, "%(title)s.%(ext)s"), "--no-warnings", rawUrl],
			300000,
		);
		const files = readdirSync(outDir).filter((f) => f.endsWith(".vtt")).map((f) => join(outDir, f));
		if (files.length === 0) {
			return textResult({ ok: false, error: truncate(`no subtitles found (${res.stderr || res.stdout || "none available"}). Try media_transcribe on the audio instead.`) }, true);
		}
		return textResult({ ok: true, subaction, subtitleFiles: files, note: "Prefer subtitles over STT when they exist." });
	}

	// audio
	const res = runBinary(ytdlp, ["-x", "--audio-format", "m4a", "-o", join(outDir, "%(title)s.%(ext)s"), "--no-warnings", rawUrl], 900000);
	const files = readdirSync(outDir).filter((f) => !f.endsWith(".part")).map((f) => join(outDir, f));
	if (files.length === 0) {
		return textResult({ ok: false, error: truncate(`audio download failed: ${res.stderr || "unknown"}`) }, true);
	}
	return textResult({ ok: true, subaction, files, nextStep: "Run media_transcribe on the audio file." });
}

const TOOLS = [
	{
		name: "media_probe",
		description: "Inspect an audio/video/image file with ffprobe: duration, streams, codecs, dimensions. Read-only; always run this first.",
		inputSchema: {
			type: "object",
			properties: { input: { type: "string", description: "Workspace-relative media path" } },
			required: ["input"]
		}
	},
	{
		name: "media_frames",
		description: "Extract frames from a video with ffmpeg at a fixed interval into .lazyantigravity/media/. Analyze the returned images with the host's native vision.",
		inputSchema: {
			type: "object",
			properties: {
				input: { type: "string", description: "Workspace-relative video path" },
				intervalSec: { type: "number", description: "Seconds between frames (default 5)" },
				maxFrames: { type: "number", description: `Maximum frames (default 10, cap ${MAX_FRAMES})` },
				timeoutSec: { type: "number", description: "ffmpeg timeout (default 300)" }
			},
			required: ["input"]
		}
	},
	{
		name: "media_ocr",
		description: "Extract text from an image with tesseract (default lang kor+eng).",
		inputSchema: {
			type: "object",
			properties: {
				input: { type: "string", description: "Workspace-relative image path" },
				lang: { type: "string", description: "Tesseract languages (default kor+eng)" }
			},
			required: ["input"]
		}
	},
	{
		name: "media_transcribe",
		description: "Transcribe audio/video with whisper.cpp (ffmpeg converts to 16 kHz mono first). Requires a ggml model path.",
		inputSchema: {
			type: "object",
			properties: {
				input: { type: "string", description: "Workspace-relative audio/video path" },
				model: { type: "string", description: "Path to a ggml-*.bin whisper model" },
				lang: { type: "string", description: "Spoken language hint" },
				timeoutSec: { type: "number", description: "whisper timeout (default 3600)" }
			},
			required: ["input"]
		}
	},
	{
		name: "media_youtube",
		description: "YouTube via yt-dlp: metadata, subtitles (prefer over STT), or audio download. Requires LAZYANTIGRAVITY_MEDIA_NETWORK=1 opt-in.",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string", description: "YouTube URL" },
				subaction: { type: "string", enum: ["metadata", "subtitles", "audio"] },
				lang: { type: "string", description: "Subtitle languages (default ko,en)" }
			},
			required: ["url"]
		}
	}
];

const TOOL_HANDLERS = {
	media_probe: mediaProbe,
	media_frames: mediaFrames,
	media_ocr: mediaOcr,
	media_transcribe: mediaTranscribe,
	media_youtube: mediaYoutube,
};

async function handleJsonRpc(message) {
	if (!message || typeof message !== "object") return null;
	const { id, method, params } = message;
	if (method === "initialize") {
		return {
			jsonrpc: "2.0",
			id,
			result: {
				protocolVersion: "2024-11-05",
				capabilities: { tools: {} },
				serverInfo: { name: "media-mcp", version: "0.1.0" }
			}
		};
	}
	if (method === "notifications/initialized") return null;
	if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
	if (method === "tools/call") {
		const name = params?.name;
		const handler = TOOL_HANDLERS[name];
		if (!handler) {
			return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unsupported tool: ${name}` } };
		}
		const result = await handler(params?.arguments ?? {});
		return { jsonrpc: "2.0", id, result };
	}
	return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

async function runMcpServer() {
	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
	rl.on("line", async (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		try {
			const req = JSON.parse(trimmed);
			const res = await handleJsonRpc(req);
			if (res) process.stdout.write(`${JSON.stringify(res)}\n`);
		} catch {
			process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
		}
	});
}

function main() {
	const argv = process.argv.slice(2);
	if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
		console.log("Usage: media-mcp <mcp> [options]");
		return 0;
	}
	if (argv[0] === "mcp") {
		runMcpServer();
		return 0;
	}
	console.log("[media-mcp] Standalone media CLI initialized.");
	return 0;
}

main();

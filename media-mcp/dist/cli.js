#!/usr/bin/env node
// Media MCP server: audio/video/image analysis through local binaries
// (ffmpeg/ffprobe/tesseract/whisper.cpp) plus two explicitly opt-in egress
// paths: a YouTube fetcher (yt-dlp, LAZYANTIGRAVITY_MEDIA_NETWORK=1) and a
// Gemini 3.5 Transcribe STT backend (LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT=1).
// Everything is workspace-confined; no network egress unless a gate is on.
import { createInterface } from "node:readline";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

const SELF_PATH = fileURLToPath(import.meta.url);
const MAX_INPUT_BYTES = 1024 * 1024 * 1024; // 1 GB
const MAX_OUTPUT_CHARS = 200_000;
const MAX_FRAMES = 60;
const JOB_TIMEOUT_MS = 24 * 60 * 60 * 1000; // async whisper jobs may exceed 1h
const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com", "youtu.be", "m.youtube.com", "music.youtube.com"]);
const GEMINI_STT_MODEL = "gemini-3.5-transcribe";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_INLINE_LIMIT = 18 * 1024 * 1024; // stay under the ~20 MB request cap
const GEMINI_MAX_SECONDS = 3600; // unary audio limit per request
const GEMINI_ANNOTATED_MAX_SECONDS = 1800; // 30 min when diarization/word timestamps are on

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
	if (args.backend === "gemini") return transcribeGemini(args);
	const check = transcribeValidation(args);
	if ("content" in check) return check;
	const workDir = mediaWorkDir("transcribe");
	const wavPath = join(workDir, "audio-16k.wav");
	const conv = runBinary(findBinary("ffmpeg"), ["-y", "-i", check.confined.path, "-vn", "-ar", "16000", "-ac", "1", wavPath], 600000);
	if (!conv.ok) {
		return textResult({ ok: false, error: truncate(`ffmpeg audio extraction failed: ${conv.stderr || conv.stdout}`) }, true);
	}
	const outBase = join(workDir, "transcript");
	const timeoutMs = Number(args.timeoutSec) > 0 ? Math.min(Number(args.timeoutSec), 3600) * 1000 : 3600000;
	const res = runBinary(findBinary("whisper"), ["-m", check.model, "-f", wavPath, "-otxt", "-of", outBase], timeoutMs);
	const textPath = `${outBase}.txt`;
	if (!existsSync(textPath)) {
		return textResult({ ok: false, error: truncate(`whisper failed: ${res.stderr || res.stdout || "no output"}`) }, true);
	}
	const text = readFileSync(textPath, "utf8").trim();
	return textResult({ ok: true, input: args.input, model: check.model, textPath, text: truncate(text), chars: text.length });
}

// ---------------------------------------------------------------------------
// Gemini 3.5 Transcribe backend (opt-in network egress). Unlike the YouTube
// gate this path UPLOADS workspace audio to Google's API — a higher consent
// class than downloading — so it sits behind its own env var and refuses
// unless LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT=1. Never use it on evidence
// audio covered by the local-only handling policy.
// ---------------------------------------------------------------------------
function checkExternalSttGate() {
	if (process.env["LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT"] !== "1") {
		return {
			ok: false,
			error:
				"backend=gemini uploads audio to the Gemini API (network egress). " +
				"For evidence audio governed by local-only handling, use the default whisper backend instead. " +
				"To opt in for non-evidence audio, set LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT=1 in this server's env.",
		};
	}
	const apiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];
	if (!apiKey) {
		return { ok: false, error: "backend=gemini requires GEMINI_API_KEY (or GOOGLE_API_KEY) in the server env." };
	}
	return { ok: true, apiKey };
}

function probeDurationSeconds(path) {
	const res = runBinary(findBinary("ffprobe"), ["-v", "quiet", "-print_format", "json", "-show_format", path], 30000);
	if (!res.ok) return null;
	try {
		return Number(JSON.parse(res.stdout)?.format?.duration ?? 0) || null;
	} catch {
		return null;
	}
}

// Encode for upload: opus first (small), mp3 fallback, wav last resort.
function extractAudioForUpload(inputPath, workDir) {
	const ffmpeg = findBinary("ffmpeg");
	const attempts = [
		{ file: "upload.ogg", mime: "audio/ogg", args: ["-vn", "-ar", "16000", "-ac", "1", "-c:a", "libopus", "-b:a", "32k"] },
		{ file: "upload.mp3", mime: "audio/mpeg", args: ["-vn", "-ar", "16000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k"] },
		{ file: "upload.wav", mime: "audio/wav", args: ["-vn", "-ar", "16000", "-ac", "1"] },
	];
	for (const attempt of attempts) {
		const out = join(workDir, attempt.file);
		const res = runBinary(ffmpeg, ["-y", "-i", inputPath, ...attempt.args, out], 600000);
		if (res.ok && existsSync(out) && statSync(out).size > 0) {
			return { path: out, mimeType: attempt.mime };
		}
		if (existsSync(out)) rmSync(out);
	}
	return null;
}

// Small files go inline as base64; larger ones use the Files API resumable
// upload. Returns { audioPart, remoteFileName } — remoteFileName is set when
// the file must be deleted server-side afterwards.
async function geminiUploadAudio(filePath, mimeType, apiKey) {
	const size = statSync(filePath).size;
	if (size <= GEMINI_INLINE_LIMIT) {
		return {
			audioPart: { inlineData: { mimeType, data: readFileSync(filePath).toString("base64") } },
			remoteFileName: null,
		};
	}
	const start = await fetch(`${GEMINI_API_BASE}/upload/v1beta/files?key=${apiKey}`, {
		method: "POST",
		headers: {
			"X-Goog-Upload-Protocol": "resumable",
			"X-Goog-Upload-Command": "start",
			"X-Goog-Upload-Header-Content-Length": String(size),
			"X-Goog-Upload-Header-Content-Type": mimeType,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ file: { display_name: filePath.split(sep).pop() } }),
	});
	if (!start.ok) {
		return { error: `Files API upload start failed: HTTP ${start.status} ${truncate(await start.text(), 2000)}` };
	}
	const uploadUrl = start.headers.get("x-goog-upload-url");
	if (!uploadUrl) return { error: "Files API did not return a resumable upload URL." };
	const up = await fetch(uploadUrl, {
		method: "POST",
		headers: {
			"Content-Length": String(size),
			"X-Goog-Upload-Offset": "0",
			"X-Goog-Upload-Command": "upload, finalize",
		},
		body: readFileSync(filePath),
	});
	if (!up.ok) {
		return { error: `Files API upload failed: HTTP ${up.status} ${truncate(await up.text(), 2000)}` };
	}
	const info = await up.json();
	const file = info?.file;
	if (!file?.uri || !file?.name) return { error: `Files API returned an unexpected response: ${truncate(JSON.stringify(info), 2000)}` };
	// Uploaded files must reach ACTIVE before generateContent accepts them.
	for (let i = 0; i < 30; i++) {
		const st = await fetch(`${GEMINI_API_BASE}/v1beta/${file.name}?key=${apiKey}`);
		if (st.ok) {
			const meta = await st.json();
			if (meta.state === "ACTIVE") break;
			if (meta.state === "FAILED") return { error: "Files API marked the uploaded audio as FAILED." };
		}
		await new Promise((r) => setTimeout(r, 2000));
	}
	return { audioPart: { fileData: { fileUri: file.uri, mimeType } }, remoteFileName: file.name };
}

async function geminiDeleteFile(remoteFileName, apiKey) {
	try {
		await fetch(`${GEMINI_API_BASE}/v1beta/${remoteFileName}?key=${apiKey}`, { method: "DELETE" });
	} catch {
		/* remote cleanup is best-effort */
	}
}

// Merge word-level annotations into speaker turns: "[spk_1] word word ...".
function formatGeminiTranscript(parts) {
	let plain = "";
	const words = [];
	for (const part of parts) {
		if (typeof part.text === "string") plain += part.text;
		const tr = part.audioTranscription;
		if (!tr) continue;
		for (const w of tr.words ?? []) {
			words.push({ word: w.word ?? "", speaker: tr.speakerLabel ?? "", start: w.startOffset ?? "", end: w.endOffset ?? "" });
		}
	}
	if (words.length === 0) return { text: plain.trim(), turns: [], wordCount: 0 };
	const turns = [];
	for (const w of words) {
		const last = turns[turns.length - 1];
		if (last && last.speaker === w.speaker) {
			last.text += ` ${w.word}`;
			last.end = w.end;
		} else {
			turns.push({ speaker: w.speaker, start: w.start, end: w.end, text: w.word });
		}
	}
	const formatted = turns
		.map((t) => `${t.speaker ? `[${t.speaker}] ` : ""}${t.start ? `(${t.start} -> ${t.end}) ` : ""}${t.text}`)
		.join("\n");
	return { text: formatted, turns, wordCount: words.length, plainText: plain.trim() };
}

async function transcribeGemini(args) {
	const gate = checkExternalSttGate();
	if (!gate.ok) return textResult({ ok: false, error: gate.error }, true);
	const apiKey = gate.apiKey;
	if (findBinary("ffmpeg") === null) return missingBinaryResult("ffmpeg");
	if (findBinary("ffprobe") === null) return missingBinaryResult("ffprobe");
	const confined = confineInputPath(args.input);
	if (!confined.ok) return textResult({ ok: false, error: confined.error }, true);

	const diarization = args.diarization === true;
	const wordTimestamps = args.wordTimestamps === true;
	const mode = args.mode === "smart" ? "SMART" : "VERBATIM";
	const customVocabulary = Array.isArray(args.customVocabulary) ? args.customVocabulary.filter((t) => typeof t === "string" && t.trim()) : [];
	const languageCodes = Array.isArray(args.languageCodes) ? args.languageCodes.filter((t) => typeof t === "string" && t.trim()) : [];
	if (customVocabulary.length > 0 && (diarization || wordTimestamps)) {
		return textResult({ ok: false, error: "Gemini API rejects customVocabulary combined with diarization or wordTimestamps." }, true);
	}
	if (mode === "SMART" && (diarization || wordTimestamps)) {
		return textResult({ ok: false, error: "mode=smart is incompatible with diarization/wordTimestamps; use verbatim." }, true);
	}
	const duration = probeDurationSeconds(confined.path);
	const limit = diarization || wordTimestamps ? GEMINI_ANNOTATED_MAX_SECONDS : GEMINI_MAX_SECONDS;
	if (duration !== null && duration > limit) {
		return textResult(
			{
				ok: false,
				error: `input duration ${Math.round(duration)}s exceeds the ${limit}s per-request limit` +
					(diarization || wordTimestamps ? " when diarization/wordTimestamps are enabled" : "") +
					". Split the audio and transcribe the parts.",
			},
			true,
		);
	}

	const workDir = mediaWorkDir("transcribe-gemini");
	const audio = extractAudioForUpload(confined.path, workDir);
	if (!audio) {
		return textResult({ ok: false, error: "ffmpeg could not produce an uploadable audio track (opus/mp3/wav all failed)." }, true);
	}
	let upload;
	try {
		upload = await geminiUploadAudio(audio.path, audio.mimeType, apiKey);
	} catch (e) {
		return textResult({ ok: false, error: `upload failed: ${e?.message ?? e}` }, true);
	}
	if (upload.error) return textResult({ ok: false, error: upload.error }, true);

	const audioTranscriptionConfig = {};
	if (diarization) audioTranscriptionConfig.diarization = true;
	if (wordTimestamps) audioTranscriptionConfig.wordTimestamp = true;
	if (mode === "SMART") audioTranscriptionConfig.mode = "SMART";
	if (languageCodes.length > 0) audioTranscriptionConfig.languageCodes = languageCodes;
	if (customVocabulary.length > 0) audioTranscriptionConfig.customVocabulary = customVocabulary;

	let resp;
	try {
		resp = await fetch(`${GEMINI_API_BASE}/v1beta/models/${GEMINI_STT_MODEL}:generateContent`, {
			method: "POST",
			headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
			body: JSON.stringify({
				contents: [{ parts: [upload.audioPart] }],
				generationConfig: { audioTranscriptionConfig },
			}),
		});
	} catch (e) {
		if (upload.remoteFileName) await geminiDeleteFile(upload.remoteFileName, apiKey);
		return textResult({ ok: false, error: `generateContent request failed: ${e?.message ?? e}` }, true);
	}
	if (upload.remoteFileName) await geminiDeleteFile(upload.remoteFileName, apiKey);
	if (!resp.ok) {
		return textResult({ ok: false, error: `Gemini API error: HTTP ${resp.status} ${truncate(await resp.text(), 2000)}` }, true);
	}
	const json = await resp.json();
	const parts = json?.candidates?.[0]?.content?.parts ?? [];
	const { text, turns, wordCount, plainText } = formatGeminiTranscript(parts);
	const finalText = text || plainText;
	if (!finalText) {
		return textResult({ ok: false, error: `Gemini returned no transcript: ${truncate(JSON.stringify(json), 2000)}` }, true);
	}
	const textPath = join(workDir, "transcript.txt");
	writeFileSync(textPath, finalText, "utf8");
	return textResult({
		ok: true,
		backend: "gemini",
		model: GEMINI_STT_MODEL,
		input: args.input,
		mode,
		diarization,
		wordTimestamps,
		textPath,
		text: truncate(finalText),
		chars: finalText.length,
		...(turns.length > 0 ? { speakerTurns: turns.length, wordAnnotations: wordCount } : {}),
		note: "Audio was uploaded to the Gemini API. Default mode is verbatim (disfluencies preserved); mode=smart strips fillers and is not suitable for evidence records.",
	});
}

// ---------------------------------------------------------------------------
// Async transcription jobs: media_transcribe is synchronous and the tool call
// blocks until whisper exits — unusable for hour-long evidence audio. The
// async pair spawns a detached copy of this same file (`node cli.mjs job
// <jobDir>`) which writes status.json under .lazyantigravity/media/<jobId>/ as
// it moves through extract → transcribe → done|failed, so the MCP server and
// the host tool call return immediately. status polling reads that file, so
// jobs also survive an MCP server restart.
// ---------------------------------------------------------------------------
function mediaJobsDir() {
	return join(getWorkspaceRoot(), ".lazyantigravity", "media");
}

function transcribeValidation(args) {
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
	return { confined, model };
}

async function mediaTranscribeStart(args) {
	const check = transcribeValidation(args);
	if ("content" in check) return check; // an error textResult
	const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const jobDir = join(mediaJobsDir(), jobId);
	mkdirSync(jobDir, { recursive: true, mode: 0o700 });
	writeFileSync(
		join(jobDir, "status.json"),
		JSON.stringify(
			{
				jobId,
				input: args.input,
				model: check.model,
				status: "running",
				phase: "extract",
				createdAt: new Date().toISOString(),
			},
			null,
			2,
		),
	);
	const child = spawn(process.execPath, [SELF_PATH, "job", jobDir], { detached: true, stdio: "ignore" });
	child.unref();
	return textResult({
		ok: true,
		jobId,
		jobDir,
		note: "Long-running transcription started in background. Poll with media_transcribe_status {jobId}.",
	});
}

async function mediaTranscribeStatus(args) {
	const jobId = String(args.jobId ?? "");
	if (!/^job-[A-Za-z0-9-]+$/.test(jobId)) {
		return textResult({ ok: false, error: "jobId must be the id returned by media_transcribe_start (job-<ts>-<suffix>)." }, true);
	}
	const jobDir = join(mediaJobsDir(), jobId);
	const statusPath = join(jobDir, "status.json");
	if (!existsSync(statusPath)) {
		return textResult({ ok: false, error: `no such job: ${jobId} (may have been removed by media_cleanup).` }, true);
	}
	let st = {};
	try {
		st = JSON.parse(readFileSync(statusPath, "utf8"));
	} catch {
		return textResult({ ok: false, error: `job ${jobId} status file is unreadable.` }, true);
	}
	const out = { ok: true, jobId, status: st.status, phase: st.phase, createdAt: st.createdAt, updatedAt: st.updatedAt };
	if (st.status === "done" && typeof st.textPath === "string" && existsSync(st.textPath)) {
		const text = readFileSync(st.textPath, "utf8").trim();
		out.textPath = st.textPath;
		out.text = truncate(text);
		out.chars = text.length;
	}
	if (st.status === "failed") {
		out.error = truncate(st.error || "unknown job failure");
	}
	return textResult(out, st.status === "failed");
}

// Detached job runner entry: `node cli.mjs job <jobDir>`. Runs the same
// ffmpeg→whisper pipeline as mediaTranscribe but reports progress into
// status.json instead of a tool result.
function runTranscribeJob(jobDir) {
	const resolvedDir = resolve(jobDir);
	if (!isInsideRoot(resolvedDir, mediaJobsDir())) {
		process.stderr.write("[media-mcp] job dir outside media root; refusing.\n");
		return;
	}
	const statusPath = join(resolvedDir, "status.json");
	const update = (patch) => {
		let cur = {};
		try {
			cur = JSON.parse(readFileSync(statusPath, "utf8"));
		} catch {
			/* keep previous fields on parse hiccup */
		}
		writeFileSync(statusPath, JSON.stringify({ ...cur, ...patch, updatedAt: new Date().toISOString() }, null, 2));
	};
	try {
		const st = JSON.parse(readFileSync(statusPath, "utf8"));
		// status.json은 워크스페이스 내 사용자가 쓸 수 있는 파일이다 — 잡 러너는
		// 시작할 때의 confinement 결과를 신뢰하지 않고 입력 경로를 재검증한다.
		const confined = confineInputPath(st.input);
		if (!confined.ok) {
			update({ status: "failed", error: `input confinement failed: ${confined.error}` });
			return;
		}
		const inputPath = confined.path;
		const wavPath = join(resolvedDir, "audio-16k.wav");
		update({ phase: "extract" });
		const conv = runBinary(findBinary("ffmpeg"), ["-y", "-i", inputPath, "-vn", "-ar", "16000", "-ac", "1", wavPath], 600000);
		if (!conv.ok) {
			update({ status: "failed", error: truncate(`ffmpeg audio extraction failed: ${conv.stderr || conv.stdout}`, 20000) });
			return;
		}
		update({ phase: "transcribe" });
		const outBase = join(resolvedDir, "transcript");
		const res = runBinary(findBinary("whisper"), ["-m", st.model, "-f", wavPath, "-otxt", "-of", outBase], JOB_TIMEOUT_MS);
		const textPath = `${outBase}.txt`;
		if (!existsSync(textPath)) {
			update({ status: "failed", error: truncate(`whisper failed: ${res.stderr || res.stdout || "no output"}`, 20000) });
			return;
		}
		update({ status: "done", textPath });
	} catch (e) {
		update({ status: "failed", error: String(e && e.message ? e.message : e) });
	}
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

function dirStats(dir) {
	let bytes = 0;
	let files = 0;
	const walk = (d) => {
		for (const entry of readdirSync(d, { withFileTypes: true })) {
			const full = join(d, entry.name);
			if (entry.isDirectory()) walk(full);
			else {
				bytes += statSync(full).size;
				files += 1;
			}
		}
	};
	walk(dir);
	return { bytes, files };
}

function removeDir(dir) {
	rmSync(dir, { recursive: true, force: true });
}

// Removes .lazyantigravity/media/<prefix>-<ts> work dirs: everything older
// than keepDays, then oldest-first until the total fits within maxMb.
async function mediaCleanup(args) {
	const mediaDir = join(getWorkspaceRoot(), ".lazyantigravity", "media");
	if (!existsSync(mediaDir)) {
		return textResult({ ok: true, deleted: [], freedBytes: 0, note: "no media directory yet." });
	}
	const keepDays = Number(args.keepDays) > 0 ? Number(args.keepDays) : 14;
	const maxMb = Number(args.maxMb) > 0 ? Number(args.maxMb) : 500;
	const cutoff = Date.now() - keepDays * 86400000;
	const entries = readdirSync(mediaDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => {
			const full = join(mediaDir, e.name);
			return { name: e.name, path: full, mtime: statSync(full).mtimeMs, ...dirStats(full) };
		})
		.sort((a, b) => a.mtime - b.mtime);

	const deleted = [];
	let freedBytes = 0;
	for (const entry of entries) {
		if (entry.mtime < cutoff) {
			removeDir(entry.path);
			freedBytes += entry.bytes;
			deleted.push({ dir: entry.name, reason: `older than ${keepDays}d`, freedBytes: entry.bytes });
		}
	}
	let remaining = entries.filter((e) => existsSync(e.path)).reduce((sum, e) => sum + dirStats(e.path).bytes, 0);
	const cap = maxMb * 1024 * 1024;
	for (const entry of entries) {
		if (remaining <= cap) break;
		if (!existsSync(entry.path)) continue;
		const size = dirStats(entry.path).bytes;
		removeDir(entry.path);
		remaining -= size;
		freedBytes += size;
		deleted.push({ dir: entry.name, reason: `capacity over ${maxMb} MB`, freedBytes: size });
	}
	return textResult({
		ok: true,
		keepDays,
		maxMb,
		deleted,
		totalDeleted: deleted.length,
		freedBytes,
		remainingBytes: remaining,
	});
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
		description:
			"Transcribe audio/video. backend=whisper (default) runs whisper.cpp locally and needs a ggml model path. " +
			"backend=gemini uploads the audio to Gemini 3.5 Transcribe — requires LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT=1 and " +
			"GEMINI_API_KEY; do not use on local-only evidence audio.",
		inputSchema: {
			type: "object",
			properties: {
				input: { type: "string", description: "Workspace-relative audio/video path" },
				backend: { type: "string", enum: ["whisper", "gemini"], description: "whisper (local, default) or gemini (cloud, opt-in egress)" },
				model: { type: "string", description: "whisper backend: path to a ggml-*.bin model" },
				lang: { type: "string", description: "whisper backend: spoken language hint" },
				timeoutSec: { type: "number", description: "whisper backend: timeout (default 3600)" },
				diarization: { type: "boolean", description: "gemini backend: speaker diarization (up to 8 speakers; 30-min audio limit)" },
				wordTimestamps: { type: "boolean", description: "gemini backend: word-level timestamps (30-min audio limit)" },
				languageCodes: { type: "array", items: { type: "string" }, description: "gemini backend: BCP-47 hints e.g. [\"ko-KR\"]; omit for auto-detect" },
				customVocabulary: { type: "array", items: { type: "string" }, description: "gemini backend: up to 1000 bias terms; incompatible with diarization/wordTimestamps" },
				mode: { type: "string", enum: ["verbatim", "smart"], description: "gemini backend: verbatim (default, preserves disfluencies) or smart (removes fillers — not for evidence)" }
			},
			required: ["input"]
		}
	},
	{
		name: "media_transcribe_start",
		description: "Start a background whisper.cpp transcription job and return a jobId immediately. Use for long audio/video; poll with media_transcribe_status.",
		inputSchema: {
			type: "object",
			properties: {
				input: { type: "string", description: "Workspace-relative audio/video path" },
				model: { type: "string", description: "Path to a ggml-*.bin whisper model" },
				lang: { type: "string", description: "Spoken language hint" }
			},
			required: ["input"]
		}
	},
	{
		name: "media_transcribe_status",
		description: "Poll a background transcription job started by media_transcribe_start. Returns running/done/failed plus the transcript when done.",
		inputSchema: {
			type: "object",
			properties: { jobId: { type: "string", description: "Job id returned by media_transcribe_start" } },
			required: ["jobId"]
		}
	},
	{
		name: "media_cleanup",
		description: "Remove old work dirs under .lazyantigravity/media/ (age and capacity based). Run this periodically during heavy media work.",
		inputSchema: {
			type: "object",
			properties: {
				keepDays: { type: "number", description: "Delete work dirs older than this many days (default 14)" },
				maxMb: { type: "number", description: "Cap the media directory total size in MB (default 500)" }
			}
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
	media_transcribe_start: mediaTranscribeStart,
	media_transcribe_status: mediaTranscribeStatus,
	media_youtube: mediaYoutube,
	media_cleanup: mediaCleanup,
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
				serverInfo: { name: "media-mcp", version: "0.2.0" }
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
	if (argv[0] === "job" && argv[1]) {
		runTranscribeJob(argv[1]);
		return 0;
	}
	console.log("[media-mcp] Standalone media CLI initialized.");
	return 0;
}

main();

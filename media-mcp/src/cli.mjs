#!/usr/bin/env node
// Media MCP server: audio/video/image analysis through local binaries
// (ffmpeg/ffprobe/tesseract/whisper.cpp) plus two explicitly opt-in egress
// paths: a YouTube fetcher (yt-dlp, LAZYANTIGRAVITY_MEDIA_NETWORK=1) and a
// Gemini 3.5 Transcribe STT backend (LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT=1).
// Everything is workspace-confined; no network egress unless a gate is on.
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { confinePath, getWorkspaceRoot, isInsideRoot, canonicalPath } from "../../workspace-mcp/dist/path-policy.js";
import { runBoundedBinary } from "./process-runner.js";
import { hashFile, unknownReceipt, finalizeReceipt } from "./receipt.js";
import { cleanupMedia } from "./cleanup.js";
const processingContext = new AsyncLocalStorage();
const activeDirs = new Set();
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
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
const GEMINI_STT_MODEL = process.env["LAZYANTIGRAVITY_GEMINI_STT_MODEL"] || "gemini-3.5-transcribe";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_INLINE_LIMIT = 18 * 1024 * 1024; // stay under the ~20 MB request cap
const GEMINI_MAX_SECONDS = 3600; // unary audio limit per request
const GEMINI_ANNOTATED_MAX_SECONDS = 1800; // 30 min when diarization/word timestamps are on

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
		// stdin must be closed: whisper-cli blocks reading stdin when the
		// pipe stays open, which made detection time out on a valid binary.
		const res = spawnSync(candidate, [spec.versionArg], { encoding: "utf8", timeout: 15000, input: "" });
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
	try {
		const path = confinePath(rawPath, { evidence: true, kind: "file" });
		if (statSync(path).size > MAX_INPUT_BYTES) throw new Error("Input exceeds size limit");
		return { ok: true, path };
	} catch (error) {
		if (/workspace-relative/.test(error.message)) return { ok: false, error: error.message };
		return { ok: false, error: `input '${rawPath}' does not exist in the workspace.` };
	}
}

function mediaWorkDir(prefix) {
	const dir = confinePath(join(getWorkspaceRoot(), ".lazyantigravity", "media", `${prefix}-${randomUUID()}`), { allowMissing: true });
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	activeDirs.add(dir);
	processingContext.getStore()?.dirs.push(dir);
	writeFileSync(join(dir, ".active"), "");
	return dir;
}

function truncate(text, max = MAX_OUTPUT_CHARS) {
	if (typeof text !== "string" || text.length <= max) return text;
	return `${text.slice(0, max)}\n[output truncated at ${max} chars]`;
}

async function runBinary(binary, args, timeoutMs) {
	const result = await runBoundedBinary(binary, args, timeoutMs);
	const context = processingContext.getStore();
	if (context) context.runs.push({ ...result, binary });
	return result;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
async function mediaProbe(args) {
	const confined = confineInputPath(args.input);
	if (!confined.ok) return textResult({ ok: false, error: confined.error }, true);
	if (findBinary("ffprobe") === null) return missingBinaryResult("ffprobe");
	const res = await runBinary(findBinary("ffprobe"), ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", confined.path], 30000);
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
	const confined = confineInputPath(args.input);
	if (!confined.ok) return textResult({ ok: false, error: confined.error }, true);
	if (findBinary("ffmpeg") === null) return missingBinaryResult("ffmpeg");
	const intervalSec = Number(args.intervalSec) > 0 ? Number(args.intervalSec) : 5;
	const maxFrames = Math.min(Math.max(Number(args.maxFrames) || 10, 1), MAX_FRAMES);
	const outDir = mediaWorkDir("frames");
	const pattern = join(outDir, "frame-%03d.jpg");
	const res = await runBinary(
		findBinary("ffmpeg"),
		["-y", "-i", confined.path, "-vf", `fps=1/${intervalSec}`, "-frames:v", String(maxFrames), "-q:v", "3", pattern],
		Number(args.timeoutSec) > 0 ? Math.min(Number(args.timeoutSec), 900) * 1000 : 300000,
	);
	const frames = readdirSync(outDir).filter((f) => f.endsWith(".jpg")).sort();
	if (frames.length === 0) {
		return textResult({ ok: false, error: truncate(`no frames extracted: ${res.stderr || res.stdout || "unknown error"}`) }, true);
	}
	const framePaths = frames.map((f) => join(outDir, f));
	if (!res.ok) {
		return textResult({ ok: false, partial: true, outDir, intervalSec, frames: framePaths, totalFrames: frames.length, error: truncate(`ffmpeg exited ${res.status}: ${res.stderr || res.stdout || "partial frames"}`) }, true);
	}
	return textResult({
		ok: true,
		outDir,
		intervalSec,
		frames: framePaths,
		totalFrames: frames.length,
		note: "Open the frame images with the host's native vision to analyze content.",
	});
}

async function mediaOcr(args) {
	const confined = confineInputPath(args.input);
	if (!confined.ok) return textResult({ ok: false, error: confined.error }, true);
	if (findBinary("tesseract") === null) return missingBinaryResult("tesseract");
	const lang = typeof args.lang === "string" && args.lang.trim() ? args.lang.trim() : "kor+eng";
	const outDir = mediaWorkDir("ocr");
	const outBase = join(outDir, "ocr");
	const res = await runBinary(findBinary("tesseract"), [confined.path, outBase, "-l", lang], 180000);
	const textPath = `${outBase}.txt`;
	if (res.ok && existsSync(textPath) && statSync(textPath).size > 0) {
		const text = readFileSync(textPath, "utf8").trim();
		return textResult({ ok: true, input: args.input, lang, textPath, text: truncate(text), chars: text.length });
	}
	if (existsSync(textPath) && statSync(textPath).size > 0) {
		const text = readFileSync(textPath, "utf8").trim();
		return textResult({ ok: false, partial: true, input: args.input, lang, textPath, text: truncate(text), chars: text.length, error: truncate(`tesseract exited ${res.status}: ${res.stderr || res.stdout || "partial output"}`) }, true);
	}
	return textResult({ ok: false, error: truncate(`tesseract failed: ${res.stderr || res.stdout || "no output"}`) }, true);
}

function resolveWhisperModel(args) {
	if (typeof args.model === "string" && args.model.trim().length > 0) return args.model.trim();
	if (process.env["LAZYANTIGRAVITY_WHISPER_MODEL"]) return process.env["LAZYANTIGRAVITY_WHISPER_MODEL"];
	return null;
}

async function mediaTranscribe(args) {
	// backend=gemini requested but not fully permitted -> fall back to the
	// local whisper backend instead of failing. Denied egress never blocks
	// transcription; it just stays on the machine.
	if (args.backend === "gemini") {
		const comboError = geminiComboError(args);
		if (comboError) return textResult({ ok: false, error: comboError }, true);
		const denial = geminiDenialReason(args);
		if (denial === null) return transcribeGemini(args);
		const check = transcribeValidation(args);
		if ("content" in check) {
			const inner = JSON.parse(check.content[0].text);
			return textResult(
				{ ok: false, error: `gemini backend not permitted (${denial}); whisper fallback unavailable: ${inner.error}`, installHint: inner.installHint },
				true,
			);
		}
		return whisperTranscribe(args, check, denial);
	}
	const check = transcribeValidation(args);
	if ("content" in check) return check;
	return whisperTranscribe(args, check, null);
}

async function whisperTranscribe(args, check, fallbackReason) {
	const workDir = check.workDir || mediaWorkDir("transcribe");
	const wavPath = join(workDir, "audio-16k.wav");
	const conv = await runBinary(findBinary("ffmpeg"), ["-y", "-i", check.confined.path, "-vn", "-ar", "16000", "-ac", "1", wavPath], 600000);
	if (!conv.ok) {
		return textResult({ ok: false, error: truncate(`ffmpeg audio extraction failed: ${conv.stderr || conv.stdout}`) }, true);
	}
	const outBase = join(workDir, "transcript");
	const timeoutMs = Number(args.timeoutSec) > 0 ? Math.min(Number(args.timeoutSec), 3600) * 1000 : 3600000;
	const lang = typeof args.lang === "string" && args.lang.trim() ? args.lang.trim() : "auto";
	const res = await runBinary(findBinary("whisper"), ["-m", check.model, "-f", wavPath, "-l", lang, "-otxt", "-of", outBase], timeoutMs);
	const textPath = `${outBase}.txt`;
	if (res.ok && existsSync(textPath) && statSync(textPath).size > 0) {
		const text = readFileSync(textPath, "utf8").trim();
		const payload = { ok: true, backend: "whisper", input: args.input, model: check.model, textPath, text: truncate(text), chars: text.length };
		if (fallbackReason) {
			payload.requestedBackend = "gemini";
			payload.fallbackReason = fallbackReason;
			payload.note = "Ran locally via whisper because the gemini backend was not permitted for this call.";
		}
		return textResult(payload);
	}
	if (existsSync(textPath) && statSync(textPath).size > 0) {
		const text = readFileSync(textPath, "utf8").trim();
		return textResult({ ok: false, partial: true, backend: "whisper", input: args.input, model: check.model, textPath, text: truncate(text), chars: text.length, error: truncate(`whisper exited ${res.status}: ${res.stderr || res.stdout || "partial output"}`) }, true);
	}
	return textResult({ ok: false, error: truncate(`whisper failed: ${res.stderr || res.stdout || "no output"}`) }, true);
}

// ---------------------------------------------------------------------------
// Gemini 3.5 Transcribe backend (opt-in network egress). Unlike the YouTube
// gate this path UPLOADS workspace audio to Google's API — a higher consent
// class than downloading — so it sits behind its own env var and refuses
// unless LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT=1. Never use it on evidence
// audio covered by the local-only handling policy.
// ---------------------------------------------------------------------------
function checkExternalSttGate() {
	if (process.env.LAZYANTIGRAVITY_OFFLINE === "1") return { ok: false, error: "LAZYANTIGRAVITY_OFFLINE=1 overrides cloud opt-ins" };
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

// Workspace subdirs that must never leave the machine, even when the
// external-STT gate is on. Comma-separated, e.g. "evidence,cases".
function localOnlyDirHit(confinedPath) {
	const raw = process.env["LAZYANTIGRAVITY_MEDIA_LOCAL_ONLY_DIRS"];
	if (!raw) return null;
	const root = getWorkspaceRoot();
	for (const d of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
		const dir = resolve(root, d);
		if (confinedPath === dir || isInsideRoot(confinedPath, dir)) return d;
	}
	return null;
}

async function probeDurationSeconds(path) {
	const res = await runBinary(findBinary("ffprobe"), ["-v", "quiet", "-print_format", "json", "-show_format", path], 30000);
	if (!res.ok) return null;
	try {
		return Number(JSON.parse(res.stdout)?.format?.duration ?? 0) || null;
	} catch {
		return null;
	}
}

// Encode for upload: opus first (small), mp3 fallback, wav last resort.
async function extractAudioForUpload(inputPath, workDir) {
	const ffmpeg = findBinary("ffmpeg");
	const attempts = [
		{ file: "upload.ogg", mime: "audio/ogg", args: ["-vn", "-ar", "16000", "-ac", "1", "-c:a", "libopus", "-b:a", "32k"] },
		{ file: "upload.mp3", mime: "audio/mpeg", args: ["-vn", "-ar", "16000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k"] },
		{ file: "upload.wav", mime: "audio/wav", args: ["-vn", "-ar", "16000", "-ac", "1"] },
	];
	for (const attempt of attempts) {
		const out = join(workDir, attempt.file);
		const res = await runBinary(ffmpeg, ["-y", "-i", inputPath, ...attempt.args, out], 600000);
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

// Returns null when the gemini backend is fully permitted, otherwise a
// human-readable denial reason used for the whisper fallback.
function geminiComboError(args) {
	const diarization = args.diarization === true;
	const wordTimestamps = args.wordTimestamps === true;
	const mode = args.mode === "smart" ? "SMART" : "VERBATIM";
	const customVocabulary = Array.isArray(args.customVocabulary) ? args.customVocabulary.filter((t) => typeof t === "string" && t.trim()) : [];
	if (customVocabulary.length > 0 && (diarization || wordTimestamps)) {
		return "Gemini API rejects customVocabulary combined with diarization or wordTimestamps.";
	}
	if (mode === "SMART" && (diarization || wordTimestamps)) {
		return "mode=smart is incompatible with diarization/wordTimestamps; use verbatim.";
	}
	return null;
}

function geminiDenialReason(args) {
	const reasons = [];
	if (process.env.LAZYANTIGRAVITY_OFFLINE === "1") reasons.push("LAZYANTIGRAVITY_OFFLINE=1 overrides cloud opt-ins");
	if (process.env["LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT"] !== "1") {
		reasons.push("LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT=1 is not set");
	}
	if (!process.env["GEMINI_API_KEY"] && !process.env["GOOGLE_API_KEY"]) {
		reasons.push("GEMINI_API_KEY/GOOGLE_API_KEY is not set");
	}
	if (reasons.length === 0 || existsSync(resolve(getWorkspaceRoot(), String(args.input ?? "")))) {
		const confined = confineInputPath(args.input);
		if (!confined.ok) {
			if (reasons.length === 0) return confined.error;
		} else {
			const blockedDir = localOnlyDirHit(confined.path);
			if (blockedDir) reasons.push(`input is inside local-only dir '${blockedDir}'`);
		}
	}
	if (args.confirmNotClientData !== true) reasons.push("client-data confirmation was not provided");
	return reasons.length > 0 ? reasons.join("; ") : null;
}

async function transcribeGemini(args) {
	const gate = checkExternalSttGate();
	if (!gate.ok) return textResult({ ok: false, error: gate.error }, true);
	const apiKey = gate.apiKey;
	if (findBinary("ffmpeg") === null) return missingBinaryResult("ffmpeg");
	if (findBinary("ffprobe") === null) return missingBinaryResult("ffprobe");
	const confined = confineInputPath(args.input);
	if (!confined.ok) return textResult({ ok: false, error: confined.error }, true);
	const blockedDir = localOnlyDirHit(confined.path);
	if (blockedDir) {
		return textResult(
			{
				ok: false,
				error: `input is inside '${blockedDir}', which LAZYANTIGRAVITY_MEDIA_LOCAL_ONLY_DIRS marks as local-only. ` +
					"The gemini backend cannot upload it — use the whisper backend.",
			},
			true,
		);
	}
	if (args.confirmNotClientData !== true) {
		return textResult(
			{
				ok: false,
				error:
					"backend=gemini uploads this audio to Google's API. Ask the user to confirm the file contains " +
					"no client or confidential information, then retry with confirmNotClientData=true. " +
					"If it does contain client data, use the local whisper backend instead.",
			},
			true,
		);
	}

	const diarization = args.diarization === true;
	const wordTimestamps = args.wordTimestamps === true;
	const mode = args.mode === "smart" ? "SMART" : "VERBATIM";
	const customVocabulary = Array.isArray(args.customVocabulary) ? args.customVocabulary.filter((t) => typeof t === "string" && t.trim()) : [];
	const languageCodes = Array.isArray(args.languageCodes) ? args.languageCodes.filter((t) => typeof t === "string" && t.trim()) : [];
	const duration = await probeDurationSeconds(confined.path);
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
	const audio = await extractAudioForUpload(confined.path, workDir);
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
	return confinePath(join(getWorkspaceRoot(), ".lazyantigravity", "media"), { allowMissing: true });
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
				lang: typeof args.lang === "string" && args.lang.trim() ? args.lang.trim() : "auto",
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
	const receipt = st.processing_receipt || unknownReceipt(st.input, {});
	const out = { ok: st.status !== "failed", jobId, status: receipt.status === "not_measured" ? "not_measured" : st.status, phase: st.phase, createdAt: st.createdAt, updatedAt: st.updatedAt, processing_receipt: receipt };
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
async function runTranscribeJob(jobDir) {
	const resolvedDir = confinePath(jobDir, { kind: "directory" });
	if (!isInsideRoot(resolvedDir, mediaJobsDir()) || resolvedDir === mediaJobsDir()) throw new Error("Job directory outside media jobs root");
	const statusPath = confinePath(join(resolvedDir, "status.json"));
	const st = JSON.parse(readFileSync(statusPath, "utf8"));
	const context = { name: "media_transcribe", args: st.parameters || { input: st.input, model: st.model, lang: st.lang }, startedAt: new Date().toISOString(), runs: [], dirs: [], source: null };
	await processingContext.run(context, async () => {
		let payload;
		try {
			context.source = await hashFile(st.input);
			const check = transcribeValidation(context.args);
			const result = "content" in check ? check : await whisperTranscribe(context.args, { ...check, workDir: resolvedDir }, null);
			payload = JSON.parse(result.content[0].text);
		} catch (error) { payload = { ok: false, error: error.message }; }
		const processing_receipt = await finalizeReceipt(context, payload);
		writeFileSync(confinePath(statusPath), JSON.stringify({ ...st, ...payload, processing_receipt, status: processing_receipt.status, phase: "finished", updatedAt: processing_receipt.finished_at }, null, 2));
	});
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
	if (process.env.LAZYANTIGRAVITY_OFFLINE === "1") return textResult({ ok: false, error: "LAZYANTIGRAVITY_OFFLINE=1 overrides all network opt-ins including LAZYANTIGRAVITY_MEDIA_NETWORK=1." }, true);
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
		const res = await runBinary(ytdlp, ["--dump-single-json", "--no-warnings", rawUrl], 120000);
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
		const res = await runBinary(
			ytdlp,
			["--skip-download", "--write-auto-sub", "--write-sub", "--sub-lang", lang, "--sub-format", "vtt", "-o", join(outDir, "%(title)s.%(ext)s"), "--no-warnings", rawUrl],
			300000,
		);
		const files = readdirSync(outDir).filter((f) => f.endsWith(".vtt")).map((f) => join(outDir, f));
		if (files.length === 0) {
			return textResult({ ok: false, error: truncate(`no subtitles found (${res.stderr || res.stdout || "none available"}). Try media_transcribe on the audio instead.`) }, true);
		}
		if (!res.ok) {
			return textResult({ ok: false, partial: true, subaction, subtitleFiles: files, error: truncate(`yt-dlp exited ${res.status}: ${res.stderr || res.stdout || "partial subtitles"}`) }, true);
		}
		return textResult({ ok: true, subaction, subtitleFiles: files, note: "Prefer subtitles over STT when they exist." });
	}

	// audio
	const res = await runBinary(ytdlp, ["-x", "--audio-format", "m4a", "-o", join(outDir, "%(title)s.%(ext)s"), "--no-warnings", rawUrl], 900000);
	const files = readdirSync(outDir).filter((f) => !f.endsWith(".part")).map((f) => join(outDir, f));
	if (files.length === 0) {
		return textResult({ ok: false, error: truncate(`audio download failed: ${res.stderr || "unknown"}`) }, true);
	}
	if (!res.ok) {
		return textResult({ ok: false, partial: true, subaction, files, error: truncate(`yt-dlp exited ${res.status}: ${res.stderr || res.stdout || "partial download"}`) }, true);
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
	const result = cleanupMedia(args, activeDirs);
	return textResult(result, !result.ok);
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
			"backend=gemini uploads the audio to Gemini Transcribe — requires LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT=1, " +
			"GEMINI_API_KEY, and confirmNotClientData=true after asking the user. When gemini is not permitted " +
			"(gate off, no key, local-only dir, or no confirmation) it automatically falls back to local whisper " +
			"instead of failing, so prefer backend=gemini and let the tool decide.",
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
				mode: { type: "string", enum: ["verbatim", "smart"], description: "gemini backend: verbatim (default, preserves disfluencies) or smart (removes fillers — not for evidence)" },
				confirmNotClientData: { type: "boolean", description: "gemini backend: REQUIRED — ask the user first, then set true only if the audio contains no client/confidential information" }
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
		description: "Preview removal of old unprotected work dirs under .lazyantigravity/media/ (age and capacity based). dryRun defaults to true; actual deletion requires confirmDelete=true. Active jobs, pinned/retained evidence and allowed evidence roots are protected.",
		inputSchema: {
			type: "object",
			properties: {
				keepDays: { type: "number", description: "Propose work dirs older than this many days for deletion (default 14)" },
				maxMb: { type: "number", description: "Cap the unprotected media directory total size in MB (default 500)" },
				dryRun: { type: "boolean", default: true, description: "Preview proposed deletions without deleting (default true)" },
				confirmDelete: { type: "boolean", description: "REQUIRED true to delete after reviewing a dry-run" }
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
		const args = params?.arguments ?? {};
		const context = { name, args, startedAt: new Date().toISOString(), runs: [], dirs: [], source: null };
		const result = await processingContext.run(context, async () => {
			let response;
			try {
				if (args.input) {
					try { context.source = await hashFile(args.input); }
					catch { context.source = null; }
				}
				response = await handler(args);
			} catch (error) { response = textResult({ ok: false, error: error.message }, true); }
			const payload = JSON.parse(response.content[0].text);
			if (name !== "media_cleanup" && name !== "media_transcribe_status" && !payload.processing_receipt) {
				payload.processing_receipt = await finalizeReceipt(context, payload);
				if (name !== "media_transcribe_start") {
					payload.status = payload.processing_receipt.status;
					payload.ok = payload.status === "complete";
				}
			}
			for (const dir of context.dirs) {
				activeDirs.delete(dir);
				writeFileSync(confinePath(join(dir, ".active")), "finished");
				if (payload.processing_receipt) writeFileSync(confinePath(join(dir, "processing-receipt.json"), { allowMissing: true }), JSON.stringify(payload.processing_receipt));
			}
			return textResult(payload, payload.ok === false);
		});
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

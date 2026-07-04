#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");

const inputFile = process.argv[2];
if (!inputFile) {
	console.error("Usage: node stt-preprocess.mjs <path_to_audio_or_video>");
	process.exit(1);
}

const inputPath = resolve(root, inputFile);
if (!existsSync(inputPath)) {
	console.error(`File not found: ${inputPath}`);
	process.exit(1);
}

console.log("=== STT Audio Preprocessing Pipeline ===");

// 1. Verify FFmpeg installation
try {
	execSync("ffmpeg -version", { stdio: "ignore" });
} catch {
	console.error("Error: FFmpeg is not installed or not found in system PATH.");
	console.error("Please install FFmpeg to run loudness normalization preprocessing.");
	process.exit(1);
}

// 2. Prepare output directory & paths
const outDir = join(root, ".omo", "stt-temp");
try {
	mkdirSync(outDir, { recursive: true });
} catch {}

const fileBaseName = basename(inputFile).replace(/\.[^/.]+$/, "");
const outputPath = join(outDir, `${fileBaseName}_preprocessed.wav`);

// 3. Assemble FFmpeg loudness normalization (loudnorm) & resampling command
// -af "loudnorm=I=-16:TP=-1.5:LRA=11": Broadcaster-standard audio leveling
// -aresample=16000: Downsample to Whisper's native 16kHz
// -ac 1: Convert to single audio channel (Mono)
const ffmpegCmd = `ffmpeg -y -i "${inputPath}" -af "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=16000" -ac 1 "${outputPath}"`;

try {
	console.log(`Input:  ${inputPath}`);
	console.log(`Filter: loudnorm, 16kHz, Mono`);
	console.log(`> Running FFmpeg audio leveling...`);
	
	execSync(ffmpegCmd, {
		cwd: root,
		shell: process.platform === "win32",
		stdio: "inherit"
	});

	console.log(`=== Preprocessing Success! ===`);
	console.log(`Preprocessed Waveform saved to: .omo/stt-temp/${fileBaseName}_preprocessed.wav`);
	process.exit(0);
} catch (error) {
	console.error("FFmpeg preprocessing failed:", error.message);
	process.exit(1);
}

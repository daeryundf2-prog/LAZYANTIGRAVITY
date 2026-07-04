#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");

const audioFile = process.argv[2];
if (!audioFile) {
	console.error("Usage: node stt-diarize-gemini.mjs <relative_path_to_audio>");
	process.exit(1);
}

const audioPath = resolve(root, audioFile);
if (!existsSync(audioPath)) {
	console.error(`File not found: ${audioPath}`);
	process.exit(1);
}

// Ensure API key is configured
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
	console.error("Error: GEMINI_API_KEY environment variable is not set.");
	console.error("Please export GEMINI_API_KEY=<your_key> to run Route B.");
	process.exit(1);
}

async function run() {
	console.log(`=== Route B: Gemini Multimodal STT & Diarization ===`);
	console.log(`Reading audio file and converting to base64...`);
	
	try {
		const audioBuffer = readFileSync(audioPath);
		const base64Data = audioBuffer.toString("base64");
		
		let promptText = "Please transcribe the conversation in this audio file. Group by speakers and output exactly in the following format:\n[MM:SS - MM:SS] (Speaker Name/Label): Transcription text\n\nIdentify the different speakers based on voice tone and dynamics. If they speak a mix of Korean and foreign languages (e.g. Italian/English), translate the foreign phrases naturally to Korean or output them phonetically if appropriate. Keep strict timeline sync.";

		// Extract metadata context if it exists
		const baseDir = dirname(audioPath);
		const baseName = basename(audioPath, ".wav").replace("_preprocessed", "");
		
		let metadataPath = null;
		const candidates = [
			join(baseDir, `${baseName}.info.json`),
			join(baseDir, `${baseName}.json`),
			join(root, ".omo", "stt-temp", `${baseName}.info.json`),
			join(root, ".omo", "stt-temp", `${baseName}.json`),
			join(root, ".omo", "stt-temp", "video_info.json")
		];
		
		for (const candidate of candidates) {
			if (existsSync(candidate)) {
				metadataPath = candidate;
				break;
			}
		}
		
		if (metadataPath) {
			try {
				const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
				const title = metadata.title || "";
				const uploader = metadata.uploader || metadata.channel || "";
				const description = metadata.description || "";
				
				console.log(`Found video metadata: "${title}" by ${uploader}`);
				
				promptText += `\n\nContext Metadata for this audio:
- Title: "${title}"
- Channel/Uploader: "${uploader}"
- Description summary: "${description.substring(0, 500)}"

Please use this metadata context to identify the actual speaker names (e.g., if the video features specific K-pop group members or YouTubers, label their names correctly) and accurately transcribe specialized terminology, slang, brand names, or title keywords. Correct any phonetic misrecognitions to match this context (e.g., standardizing spelling of show names, webtoons, or referenced K-pop concepts).`;
			} catch (e) {
				console.warn(`Failed to parse metadata file: ${e.message}`);
			}
		}

		console.log("Calling Gemini API (gemini-2.5-flash) with audio payload...");
		
		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				contents: [
					{
						parts: [
							{
								inlineData: {
									mimeType: "audio/wav",
									data: base64Data
								}
							},
							{
								text: promptText
							}
						]
					}
				]
			})
		});
		
		if (!response.ok) {
			const errText = await response.text();
			throw new Error(`Gemini API HTTP Error (${response.status}): ${errText}`);
		}
		
		const result = await response.json();
		const transcription = result.candidates?.[0]?.content?.parts?.[0]?.text;
		
		if (!transcription) {
			throw new Error("No text response returned from Gemini.");
		}

		console.log("\n=== Result: Gemini Diarization Transcript ===");
		console.log(transcription);
		
	} catch (error) {
		console.error("Gemini API Pipeline failed:", error.message);
		process.exit(1);
	}
}

run();

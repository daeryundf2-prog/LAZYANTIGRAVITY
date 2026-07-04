#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
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
								text: "Please transcribe the conversation in this audio file. Group by speakers and output exactly in the following format:\n[MM:SS - MM:SS] (Speaker Name/Label): Transcription text\n\nIdentify the different speakers based on voice tone and dynamics. If they speak a mix of Korean and foreign languages (e.g. Italian/English), translate the foreign phrases naturally to Korean or output them phonetically if appropriate. Keep strict timeline sync."
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

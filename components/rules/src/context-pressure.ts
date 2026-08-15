import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";

const CONTEXT_PRESSURE_MARKERS = [
	"context compacted",
	"context_length_exceeded",
	"skill descriptions were shortened",
	"context_too_large",
	"codex ran out of room in the model's context window",
	"your input exceeds the context window",
	"long threads and multiple compactions",
] as const;

export function hasContextPressureMarker(text: string): boolean {
	const normalizedText = text.toLowerCase();
	return CONTEXT_PRESSURE_MARKERS.some((marker) => normalizedText.includes(marker));
}

export function transcriptHasContextPressureMarker(transcriptPath: string | null | undefined): boolean {
	if (transcriptPath === undefined || transcriptPath === null || !existsSync(transcriptPath)) return false;
	try {
		const stat = statSync(transcriptPath);
		const maxBytes = 512 * 1024;
		if (stat.size <= maxBytes) {
			return hasContextPressureMarker(readFileSync(transcriptPath, "utf8"));
		}
		const fd = openSync(transcriptPath, "r");
		try {
			const buffer = Buffer.alloc(maxBytes);
			readSync(fd, buffer, 0, maxBytes, stat.size - maxBytes);
			return hasContextPressureMarker(buffer.toString("utf8"));
		} finally {
			closeSync(fd);
		}
	} catch {
		return false;
	}
}

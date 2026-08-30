import { URL } from "node:url";

const TWO_PART_CCTLDS = new Set([
	"co.uk",
	"ac.uk",
	"org.uk",
	"gov.uk",
	"co.kr",
	"go.kr",
	"or.kr",
	"ne.kr",
	"re.kr",
	"com.au",
	"net.au",
	"org.au",
	"co.jp",
	"ne.jp",
	"ac.jp",
	"com.cn",
	"org.cn",
	"gov.cn",
]);

export interface RawParsedTableRow {
	readonly [column: string]: string;
}

export function extractRegistrableDomain(hostname: string): string {
	const clean = hostname.toLowerCase().replace(/^www\./, "");
	const parts = clean.split(".");
	if (parts.length <= 2) return clean;
	const last2 = parts.slice(-2).join(".");
	if (TWO_PART_CCTLDS.has(last2) && parts.length >= 3) {
		return parts.slice(-3).join(".");
	}
	return parts.slice(-2).join(".");
}

export function extractUrls(text: string): string[] {
	const urls: string[] = [];
	const regex = /https?:\/\/[^\s)\]><",]+/gi;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		urls.push(match[0]);
	}
	return urls;
}

export function extractUniqueDomains(text: string): string[] {
	const urls = extractUrls(text);
	const domains = new Set<string>();
	for (const urlStr of urls) {
		try {
			const parsed = new URL(urlStr);
			if (parsed.hostname) {
				domains.add(extractRegistrableDomain(parsed.hostname));
			}
		} catch {
			// ignore malformed URL tokens
		}
	}
	return [...domains];
}

export function parseMarkdownTable(markdown: string): RawParsedTableRow[] {
	const lines = markdown
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.startsWith("|") && l.endsWith("|"));

	if (lines.length < 2) return [];

	const headerLine = lines[0];
	if (!headerLine) return [];
	const headers = headerLine
		.slice(1, -1)
		.split("|")
		.map((h) => h.trim().toLowerCase());

	const rows: RawParsedTableRow[] = [];
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		if (!line || /^\|[\s\-:|]+\|$/.test(line)) continue; // delimiter row
		const cells = line.slice(1, -1).split("|").map((c) => c.trim());
		const row: Record<string, string> = {};
		for (let j = 0; j < headers.length; j++) {
			const header = headers[j];
			if (header) {
				row[header] = cells[j] ?? "";
			}
		}
		rows.push(row);
	}
	return rows;
}

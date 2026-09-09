import { describe, expect, it } from "vitest";
import { sanitizeEvidenceUrls } from "../src/evidence-verifier.js";

describe("URL Credential and Token Masking (insane-search v0.16.1~v0.16.3)", () => {
	it("#given URL with Basic Auth credentials #when sanitizeEvidenceUrls runs #then masks password with ***", () => {
		const raw = "curl -u admin:secret123 https://user:supersecret@api.example.com/data";
		const sanitized = sanitizeEvidenceUrls(raw);
		expect(sanitized).toBe("curl -u admin:secret123 https://user:***@api.example.com/data");
		expect(sanitized).not.toContain("supersecret");
	});

	it("#given URL with query token or api key #when sanitizeEvidenceUrls runs #then masks query secret with ***", () => {
		const raw = "GET https://api.github.com/repos?token=ghp_secretToken12345&other=1";
		const sanitized = sanitizeEvidenceUrls(raw);
		expect(sanitized).toBe("GET https://api.github.com/repos?token=***&other=1");
		expect(sanitized).not.toContain("ghp_secretToken12345");
	});

	it("#given command with multiple secrets #when sanitizeEvidenceUrls runs #then masks all matching parameters", () => {
		const raw = "fetch('https://admin:pass456@host.org/api?key=myKey&secret=mySecret')";
		const sanitized = sanitizeEvidenceUrls(raw);
		expect(sanitized).toBe("fetch('https://admin:***@host.org/api?key=***&secret=***')");
		expect(sanitized).not.toContain("pass456");
		expect(sanitized).not.toContain("myKey");
		expect(sanitized).not.toContain("mySecret");
	});
});

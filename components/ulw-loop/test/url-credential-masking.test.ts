import { describe, expect, it } from "vitest";
import { sanitizeEvidenceUrls } from "../src/evidence-verifier.js";

describe("URL Credential and Token Masking", () => {
	it("#given URL with Basic Auth credentials #when sanitizeEvidenceUrls runs #then masks password with ***", () => {
		const raw = "curl -u admin:secret123 https://user:supersecret@api.example.com/data";
		const sanitized = sanitizeEvidenceUrls(raw);
		expect(sanitized).toBe("curl -u admin:secret123 https://user:***@api.example.com/data");
		expect(sanitized).not.toContain("supersecret");
	});

	it("#given URL with password containing @ symbol #when sanitizeEvidenceUrls runs #then masks entire password", () => {
		const raw = "curl https://user:p@ssw@rd123@api.example.com/data";
		const sanitized = sanitizeEvidenceUrls(raw);
		expect(sanitized).toBe("curl https://user:***@api.example.com/data");
		expect(sanitized).not.toContain("p@ssw@rd123");
	});

	it("#given URL with compound query tokens and keys #when sanitizeEvidenceUrls runs #then masks all secret keys", () => {
		const raw = "GET https://api.github.com/repos?client_secret=secret123&api_token=tok456&session_token=ses789&auth=xyz";
		const sanitized = sanitizeEvidenceUrls(raw);
		expect(sanitized).toBe("GET https://api.github.com/repos?client_secret=***&api_token=***&session_token=***&auth=***");
		expect(sanitized).not.toContain("secret123");
		expect(sanitized).not.toContain("tok456");
		expect(sanitized).not.toContain("ses789");
		expect(sanitized).not.toContain("xyz");
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

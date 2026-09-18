import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export interface FactReview {
	reviewer: string;
	reviewedAt: string;
	decision: "approved" | "rejected";
	evidence: { file: string; sha256: string };
}

export interface FactMetadata {
	source?: string;
	review?: FactReview;
}

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function validateFactReview(value: unknown, content: string, factsPath: string): FactReview {
	try {
		const review = record(value);
		const evidence = record(review["evidence"]);
		const reviewer = review["reviewer"];
		const reviewedAt = review["reviewedAt"];
		const decision = review["decision"];
		const file = evidence["file"];
		const sha256 = evidence["sha256"];
		if (typeof reviewer !== "string" || !reviewer.trim() || typeof reviewedAt !== "string" ||
			!Number.isFinite(Date.parse(reviewedAt)) || Date.parse(reviewedAt) > Date.now() ||
			(decision !== "approved" && decision !== "rejected") || typeof file !== "string" || !file.trim() ||
			isAbsolute(file) || typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error();
		const root = realpathSync(dirname(factsPath));
		const path = realpathSync(resolve(root, file));
		const rel = relative(root, path);
		if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error();
		const stat = statSync(path);
		if (!stat.isFile() || stat.size > 65536) throw new Error();
		const raw = readFileSync(path);
		if (createHash("sha256").update(raw).digest("hex") !== sha256) throw new Error();
		const receipt = record(JSON.parse(raw.toString("utf8")));
		if (receipt["reviewer"] !== reviewer || receipt["reviewedAt"] !== reviewedAt || receipt["decision"] !== decision ||
			receipt["contentSha256"] !== createHash("sha256").update(content.trim()).digest("hex")) throw new Error();
		return { reviewer, reviewedAt, decision, evidence: { file, sha256 } };
	} catch {
		throw new Error("Fact review requires a matching local reviewer receipt bound to the content, reviewer, date, and decision");
	}
}

export function factMetadata(value: unknown, content: string, factsPath: string, strict = false): FactMetadata {
	const input = record(value);
	const metadata: FactMetadata = {};
	if (typeof input["source"] === "string" && input["source"].trim()) metadata.source = input["source"].trim();
	if (input["review"] !== undefined) {
		try {
			metadata.review = validateFactReview(input["review"], content, factsPath);
		} catch (error) {
			if (strict) throw error;
		}
	}
	return metadata;
}

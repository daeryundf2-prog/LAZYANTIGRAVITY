import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { confinePath } from "../../workspace-mcp/dist/path-policy.js";

export async function hashFile(raw) {
	const path = confinePath(raw, { evidence: true, kind: "file" });
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return { path, sha256: hash.digest("hex") };
}

export function unknownReceipt(input, parameters = {}) {
	return {
		schema_version: "1.0", case_id: parameters.case_id ?? null, evidence_id: parameters.evidence_id || "unknown",
		status: "not_measured", source: { path: typeof input === "string" ? input : "", sha256: null }, artifacts: [],
		tool: { name: "unknown", version: "unknown" }, parameters, started_at: null, finished_at: null, exit_code: null,
		warnings: [], limitations: ["Historical job: timing, exit code, tool version and original hashes were not recorded"],
		review: { status: "pending", reviewer: null, reviewed_at: null },
	};
}

export async function finalizeReceipt(context, payload) {
	const artifacts = [];
	const warnings = [];
	const paths = [...(payload.frames || []), ...(payload.files || []), ...(payload.subtitleFiles || []), ...(payload.textPath ? [payload.textPath] : [])];
	for (const path of paths) {
		try { artifacts.push(await hashFile(path)); } catch { warnings.push("Artifact missing or unreadable; hash not measured"); }
	}
	const failedRun = context.runs.find((run) => !run.ok);
	for (const run of context.runs) if (!run.ok) warnings.push(run.error || `Child exited ${run.status}`);
	let source = { path: context.args.input || "", sha256: null };
	if (context.source) {
		source = context.source;
		try { if ((await hashFile(source.path)).sha256 !== source.sha256) warnings.push("Source changed during processing"); }
		catch { warnings.push("Source unavailable after processing"); }
	}
	let status = payload.ok && !failedRun && warnings.length === 0 ? "complete" : artifacts.length ? "partial" : "failed";
	if (payload.status === "running") status = "not_measured";
	if (!source.sha256 && status === "complete") { status = "partial"; warnings.push("Source hash not measured"); }
	const tool = context.runs.at(-1);
	const parameters = { ...context.args };
	if (parameters.model) {
		try { parameters.model_sha256 = (await hashFile(parameters.model)).sha256; }
		catch { parameters.model_sha256 = null; }
	}
	return {
		schema_version: "1.0", case_id: context.args.case_id ?? null, evidence_id: context.args.evidence_id || randomUUID(), status, source, artifacts,
		tool: { name: tool?.binary || context.name, version: tool?.version || "unknown" }, parameters,
		started_at: context.startedAt, finished_at: new Date().toISOString(), exit_code: failedRun?.status ?? tool?.status ?? null,
		warnings, limitations: ["Hashes identify bytes, not evidentiary authenticity; human review is pending", "Completion does not certify transcription accuracy or complete media coverage", "Locally writable record, not an independent or third-party attestation", ...(!tool?.version ? ["Tool version not measured"] : [])],
		review: { status: "pending", reviewer: null, reviewed_at: null },
	};
}

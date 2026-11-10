// Fingerprint-bound evidence: a proof is only valid for the exact worktree content it checked.
// Source note: adapted from hypercore (MIT, (c) 2026 alpoxdev) skills/hyper-loop/rules/evidence-binding.md
// at 2d305cbf5db72e337189aa584b363bb9ced2d9bc; rewritten in Node (no bash/jq) so it runs on Windows.
// Overlap note: components/session-tree/src/snapshot.ts also hashes the worktree, but it creates a commit and
// a ref per call; this module is read-only and keeps the same state-directory exclusions.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

// Same state directories snapshot.ts excludes: appending to the ledger must not stale earlier rows.
export const EXCLUDED_DIRS = [".lazyantigravity", ".lazycodex", ".omo"];
const excludeSpecs = EXCLUDED_DIRS.map((dir) => `:(exclude)${dir}`);

function git(args, cwd, { allowFail = false } = {}) {
	const res = spawnSync("git", args, { cwd, maxBuffer: 1 << 28 });
	if (res.status !== 0) {
		if (allowFail) return null;
		throw new Error(`git ${args.join(" ")} failed: ${res.stderr.toString().trim()}`);
	}
	return res.stdout;
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

function hashUntracked(cwd, relPath) {
	const full = join(cwd, relPath);
	const st = lstatSync(full);
	if (st.isSymbolicLink()) return sha256(`symlink:${readlinkSync(full)}`);
	return st.isFile() ? sha256(readFileSync(full)) : sha256("non-file");
}

export function fingerprint(cwd = process.cwd()) {
	const treeOut = git(["rev-parse", "HEAD^{tree}"], cwd, { allowFail: true });
	const tree = treeOut ? treeOut.toString().trim() : "none";
	const diff = git(["diff", "--binary", "HEAD", "--", ".", ...excludeSpecs], cwd, { allowFail: true }) ?? Buffer.alloc(0);
	const listed = git(["ls-files", "--others", "--exclude-standard", "-z", "--", ".", ...excludeSpecs], cwd);
	const untracked = listed.toString().split("\0").filter(Boolean).sort();
	const lines = untracked.map((path) => `${hashUntracked(cwd, path)}\t${path}\n`).join("");
	return { tree, diff_sha256: sha256(Buffer.concat([diff, Buffer.from(lines)])), untracked, excluded: EXCLUDED_DIRS };
}

export function parseLedger(text) {
	return text.split(/\r?\n/).filter((line) => line.trim() !== "").map((line, index) => {
		try {
			return JSON.parse(line);
		} catch {
			throw new Error(`ledger line ${index + 1} is not valid JSON`);
		}
	});
}

function artifactsReady(row, cwd) {
	const artifacts = Array.isArray(row.artifacts) ? row.artifacts : [];
	return artifacts.every((artifact) => {
		try {
			return statSync(isAbsolute(artifact) ? artifact : join(cwd, artifact)).size > 0;
		} catch {
			return false;
		}
	});
}

// Last evidence row per criterion wins; only `pass` counts as proof.
export function classifyLedger(rows, current, { criteria = [], cwd = process.cwd() } = {}) {
	const last = new Map();
	for (const row of rows) {
		if (row.event === "evidence" && typeof row.criterion_id === "string") last.set(row.criterion_id, row);
	}
	const ids = [...new Set([...criteria, ...last.keys()])];
	const results = ids.map((id) => {
		const row = last.get(id);
		if (!row) return { criterion_id: id, state: "missing" };
		if (row.verdict !== "pass") return { criterion_id: id, state: "failing", verdict: row.verdict };
		if (row.tree !== current.tree || row.diff_sha256 !== current.diff_sha256) return { criterion_id: id, state: "stale" };
		if (!artifactsReady(row, cwd)) return { criterion_id: id, state: "missing-evidence-file" };
		return { criterion_id: id, state: "pass" };
	});
	return { ok: results.every((r) => r.state === "pass"), results };
}

export function makeRow({ criterion, verdict, command, evidence, artifacts = [] }, current) {
	if (!["pass", "fail", "blocked"].includes(verdict)) throw new Error("--verdict must be pass, fail, or blocked");
	if (!criterion || !command || !evidence) throw new Error("--criterion, --command, and --evidence are required");
	return {
		event: "evidence",
		criterion_id: criterion,
		verdict,
		tree: current.tree,
		diff_sha256: current.diff_sha256,
		command,
		evidence,
		artifacts,
		recorded_at: new Date().toISOString(),
	};
}

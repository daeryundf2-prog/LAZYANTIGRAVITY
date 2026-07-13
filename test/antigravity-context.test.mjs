import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { TOTAL_CONTEXT_LIMIT_BYTES } from "../scripts/antigravity-hooks/context.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const entrypoint = join(root, "scripts", "antigravity-hook.mjs");
const cliMigrationContract = join(root, "contracts", "antigravity", "cli-migration.md");
const expectedCliMigrationHash = "504f690d7dc27368d45e446301dd84a6718e58d5ebf5c6a8f286d8a0d076d999";

test("[todo7.context.empty] #given no OMO state #when PreInvocation runs #then no context is injected", () => {
	const repo = tempRepo();

	const result = runPreInvocation(repo);

	assert.equal(result.status, 0);
	assert.equal(result.stderr, "");
	assert.equal(result.stdout, "{}\n");
});

test("[todo7.context.active-loop] #given brief and schema-valid goals #when PreInvocation runs #then one provenance-labelled bounded ephemeralMessage is injected", () => {
	const repo = tempRepo();
	writeOmoState(repo, {
		brief: "Ship Todo 7 with only allowlisted OMO state.\napi_key=sk-todo7-secret-value",
		goals: planJson("G001", "Collect bounded context"),
	});
	writeFileSync(join(repo, "AGENTS.md"), "MUST_NOT_APPEAR", "utf8");
	writeFileSync(join(repo, "GEMINI.md"), "MUST_NOT_APPEAR", "utf8");
	mkdirSync(join(repo, ".agents"), { recursive: true });
	writeFileSync(join(repo, ".agents", "rules"), "MUST_NOT_APPEAR", "utf8");

	const result = runPreInvocation(repo);
	const message = injectedMessage(result);

	assert.equal(result.status, 0);
	assert.equal(result.stderr, "");
	assert(Buffer.byteLength(message, "utf8") <= TOTAL_CONTEXT_LIMIT_BYTES);
	assert.match(message, /<lazyantigravity-omo-context>/);
	assert.match(message, /\[source kind=brief path=.omo\/ulw-loop\/brief.md/);
	assert.match(message, /\[source kind=goals path=.omo\/ulw-loop\/goals.json/);
	assert.match(message, /Collect bounded context/);
	assert.match(message, /\[REDACTED_SECRET\]/);
	assert.doesNotMatch(message, /MUST_NOT_APPEAR|sk-todo7-secret-value|AGENTS\.md|GEMINI\.md|\.agents\/rules/);
});

test("[todo7.context.malformed-goals] #given invalid goals JSON #when PreInvocation runs #then it fails closed without repaired JSON", () => {
	const repo = tempRepo();
	writeOmoState(repo, { brief: "valid brief", goals: "{\"version\":1,\"goals\":[" });

	const result = runPreInvocation(repo);

	assert.equal(result.status, 2);
	assert.equal(result.stdout, "");
	assert.match(result.stderr, /^ANTIGRAVITY_CONTEXT_GOALS_INVALID: /);
	assert.doesNotMatch(result.stderr, /\{\"version\"|valid brief/);
});

test("[todo7.context.oversized] #given oversized OMO state #when PreInvocation runs #then each source and total output are bounded", () => {
	const repo = tempRepo();
	writeOmoState(repo, {
		brief: `brief-${"a".repeat(10_000)}`,
		goals: planJson("G001", "oversized", "b".repeat(10_000)),
	});

	const result = runPreInvocation(repo);
	const message = injectedMessage(result);

	assert.equal(result.status, 0);
	assert(Buffer.byteLength(message, "utf8") <= TOTAL_CONTEXT_LIMIT_BYTES);
	assert.match(message, /\.\.\. \[truncated\]/);
	assert.doesNotMatch(message, /b{5000}/);
	assert.doesNotThrow(() => JSON.parse(sourceContent(message, "goals")));
});

test("[todo7.context.duplicate] #given duplicate workspace paths #when PreInvocation runs #then sources are deduplicated", () => {
	const repo = tempRepo();
	writeOmoState(repo, { brief: "dedupe brief", goals: planJson("G001", "dedupe goals") });

	const result = runPreInvocation(repo, [repo, repo]);
	const message = injectedMessage(result);

	assert.equal(result.status, 0);
	assert.equal(count(message, "[source kind=brief"), 1);
	assert.equal(count(message, "[source kind=goals"), 1);
});

test("[todo7.context.symlink-escape] #given OMO source symlink escapes workspace #when PreInvocation runs #then it is rejected", { skip: !canCreateJunction() }, () => {
	const repo = tempRepo();
	const outside = tempRepo();
	mkdirSync(join(outside, "ulw-loop"), { recursive: true });
	writeFileSync(join(outside, "ulw-loop", "brief.md"), "escaped brief", "utf8");
	symlinkSync(outside, join(repo, ".omo"), "junction");

	const result = runPreInvocation(repo);

	assert.equal(result.status, 2);
	assert.equal(result.stdout, "");
	assert.match(result.stderr, /^ANTIGRAVITY_CONTEXT_PATH_UNSAFE: /);
	assert.doesNotMatch(result.stderr, /escaped brief|AppData|Temp|lazyag-/);
});

test("[todo7.context.multi-workspace] #given multiple workspaces #when PreInvocation runs #then sources are ordered deterministically", () => {
	const repoB = tempRepo("lazyag-b-");
	const repoA = tempRepo("lazyag-a-");
	writeOmoState(repoB, { brief: "workspace-b", goals: planJson("G002", "second") });
	writeOmoState(repoA, { brief: "workspace-a", goals: planJson("G001", "first") });

	const result = runPreInvocation(repoB, [repoB, repoA]);
	const message = injectedMessage(result);

	assert.equal(result.status, 0);
	assert(message.indexOf("workspace-a") < message.indexOf("workspace-b"));
});

test("[todo7.context.secret-fixtures] #given common secret literals #when PreInvocation runs #then they are redacted from injected context", () => {
	const repo = tempRepo();
	writeOmoState(repo, {
		brief: "token=ghp_abcdefghijklmnopqrstuvwxyz\nBearer eyJhbGciOi.secret.payload\npassword: hunter2secret",
		goals: planJson("G001", "AIzaSySecretSecretSecret"),
	});

	const result = runPreInvocation(repo);
	const message = injectedMessage(result);

	assert.equal(result.status, 0);
	assert.doesNotMatch(message, /ghp_abcdefghijklmnopqrstuvwxyz|eyJhbGciOi\.secret\.payload|hunter2secret|AIzaSySecretSecretSecret/);
	assert.match(message, /\[REDACTED_SECRET\]/);
});

test("[todo7.contract.cli-migration-pin] #given vendored CLI migration contract #when hashed #then it matches the pinned document", () => {
	const hash = createHash("sha256").update(readFileSyncUtf8(cliMigrationContract)).digest("hex");

	assert.equal(hash, expectedCliMigrationHash);
	assert.match(readFileSyncUtf8(cliMigrationContract), /Migrating from Gemini CLI/);
	assert.match(readFileSyncUtf8(cliMigrationContract), /native plugins/);
});

function runPreInvocation(workspacePath, workspacePaths = [workspacePath]) {
	return spawnSync(process.execPath, [entrypoint, "PreInvocation"], {
		cwd: root,
		encoding: "utf8",
		input: JSON.stringify({
			invocationNum: 1,
			initialNumSteps: 2,
			conversationId: "todo7-context",
			workspacePaths,
			transcriptPath: join(workspacePath, "transcript.jsonl"),
			artifactDirectoryPath: join(workspacePath, ".antigravity"),
		}),
	});
}

function injectedMessage(result) {
	assert.equal(result.status, 0);
	assert.equal(result.stderr, "");
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(Object.keys(payload), ["injectSteps"]);
	assert.equal(payload.injectSteps.length, 1);
	assert.deepEqual(Object.keys(payload.injectSteps[0]), ["ephemeralMessage"]);
	return payload.injectSteps[0].ephemeralMessage;
}

function tempRepo(prefix = "lazyag-context-") {
	const repo = mkdtempSync(join(tmpdir(), prefix));
	mkdirSync(repo, { recursive: true });
	return repo;
}

function writeOmoState(repo, { brief, goals }) {
	const dir = join(repo, ".omo", "ulw-loop");
	mkdirSync(dir, { recursive: true });
	if (brief !== undefined) writeFileSync(join(dir, "brief.md"), brief, "utf8");
	if (goals !== undefined) writeFileSync(join(dir, "goals.json"), goals, "utf8");
}

function planJson(id, title, extra = "") {
	return `${JSON.stringify({
		version: 1,
		createdAt: "2026-07-11T00:00:00.000Z",
		updatedAt: "2026-07-11T00:00:00.000Z",
		briefPath: ".omo/ulw-loop/brief.md",
		goalsPath: ".omo/ulw-loop/goals.json",
		ledgerPath: ".omo/ulw-loop/ledger.jsonl",
		activeGoalId: id,
		goals: [
			{
				id,
				title,
				objective: `${title} ${extra}`,
				status: "in_progress",
				successCriteria: [],
			},
		],
	}, null, 2)}\n`;
}

function canCreateJunction() {
	const base = tempRepo("lazyag-symlink-probe-");
	const target = join(base, "target");
	const link = join(base, "link");
	try {
		mkdirSync(target, { recursive: true });
		symlinkSync(target, link, "junction");
		return true;
	} catch {
		return false;
	} finally {
		rmSync(base, { recursive: true, force: true });
	}
}

function count(text, needle) {
	return text.split(needle).length - 1;
}

function sourceContent(message, kind) {
	const pattern = new RegExp(`\\[source kind=${kind}[^\\n]*\\]\\n([\\s\\S]*?)\\n\\[/source\\]`);
	const match = pattern.exec(message);
	assert(match, `missing ${kind} source`);
	return match[1];
}

function readFileSyncUtf8(path) {
	return readFileSync(path, "utf8");
}

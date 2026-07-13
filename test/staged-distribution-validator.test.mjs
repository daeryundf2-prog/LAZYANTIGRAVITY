import assert from "node:assert/strict";
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyBundle } from "../scripts/staged-distribution/bundle.mjs";
import {
	countIncompleteProcessCleanups,
	terminateOwnedDaemons,
	validateStagedDistribution,
} from "../scripts/staged-distribution/validator.mjs";

const root = join(import.meta.dirname, "..");
const expectedSkills = [
	"ast-grep", "debugging", "frontend-ui-ux", "git-master", "init-deep",
	"lsp", "lsp-setup", "programming", "review-work", "rules", "start-work",
	"ulw", "ulw-loop", "ulw-plan", "visual-qa",
];
const expectedArtifacts = [
	"cleanup.json",
	"contracts/layouts.json",
	"hooks/processes.json",
	"mcp/processes.json",
	"mutations.json",
	"package/manifest.json",
	"reconstruction.json",
	"skills/catalog.json",
];

test("[todo15.validator.pid-reuse] a completed child is not an orphan when its PID has been reused", () => {
	assert.equal(countIncompleteProcessCleanups([{ pid: process.pid, cleanup: { exited: true } }]), 0);
	assert.equal(countIncompleteProcessCleanups([{ pid: process.pid, cleanup: { exited: false } }]), 1);
});

test("[todo15.validator.pid-reuse] creation-time mismatch performs zero daemon termination calls", async () => {
	const owner = Object.freeze({
		pid: 4242,
		commandLine: `"${process.execPath}" daemon.mjs`,
		created: "2026-07-13T00:00:00.000Z",
		executable: process.execPath.toLowerCase(),
	});
	const reused = Object.freeze({
		commandLine: owner.commandLine,
		created: "2026-07-13T00:00:01.000Z",
		executable: process.execPath,
	});
	let processKillCalls = 0;
	let taskkillCalls = 0;
	await assert.rejects(terminateOwnedDaemons([owner], {
		platform: "win32",
		processKill: () => { processKillCalls += 1; },
		readIdentity: () => reused,
		taskkill: () => { taskkillCalls += 1; return { status: 0 }; },
		wait: async () => {},
	}), /refusing to terminate unverified LSP daemon/);
	assert.equal(processKillCalls, 0);
	assert.equal(taskkillCalls, 0);
});

test("[todo15.validator.cleanup] matching daemon identity still permits normal TERM cleanup", async () => {
	const owner = Object.freeze({
		pid: 4242,
		commandLine: `"${process.execPath}" daemon.mjs`,
		created: "2026-07-13T00:00:00.000Z",
		executable: process.execPath.toLowerCase(),
	});
	let running = true;
	let processKillCalls = 0;
	let taskkillCalls = 0;
	await terminateOwnedDaemons([owner], {
		platform: "win32",
		processKill: () => { processKillCalls += 1; running = false; },
		readIdentity: () => running ? {
			commandLine: owner.commandLine,
			created: owner.created,
			executable: process.execPath,
		} : null,
		taskkill: () => { taskkillCalls += 1; return { status: 0 }; },
		wait: async () => {},
	});
	assert.equal(processKillCalls, 1);
	assert.equal(taskkillCalls, 0);
});

test("[todo15.validator.core] validates four real staged layouts and leaves only a closed durable bundle", { timeout: 120_000 }, async () => {
	const testRoot = mkdtempSync(join(tmpdir(), "todo15 validator core with spaces "));
	const artifactRoot = join(testRoot, "durable artifacts with spaces");
	try {
		const report = await validateStagedDistribution({
			subjectRoot: root,
			artifactRoot,
			nodePath: process.execPath,
		});

		assert.equal(Object.isFrozen(report), true);
		assert.equal(report.status, "passed");
		assert.deepEqual(report.layouts.map(({ id }) => id), [
			"ide-dot-workspace", "ide-underscore-workspace", "ide-global", "cli-global",
		]);
		assert.deepEqual(report.layouts.map(({ ruleStatus }) => ruleStatus), [
			"unverified", "unverified", "unverified", "not-applicable",
		]);
		assert.equal(new Set(report.layouts.map(({ layoutHash }) => layoutHash)).size, 1);
		assert.equal(new Set(report.layouts.map(({ fileCount }) => fileCount)).size, 1);
		assert.deepEqual(report.hookIds, ["PreInvocation", "Stop"]);
		assert.deepEqual(report.mcpIds, ["database", "git-bash", "lsp"]);
		assert.deepEqual(report.activeSkills, expectedSkills);
		assert.equal(report.activeSkillCount, 15);
		assert.deepEqual(report.experimentalIncluded, []);
		assert.equal(report.orphanCount, 0);
		assert.deepEqual(report.cleanup, {
			runtimeRootRemoved: true,
			ownedChildCount: 36,
			orphanCount: 0,
		});
		assert.equal(Object.hasOwn(report, "runtimeRoot"), false);

		const verified = verifyBundle(artifactRoot);
		assert.equal(report.bundle.verified, true);
		assert.equal(report.bundle.reconstructionValid, true);
		assert.equal(report.bundle.hash, verified.bundleHash);
		assert.equal(report.bundle.subjectFingerprint, verified.manifest.subjectFingerprint);
		assert.equal(report.bundle.logicalFingerprint, verified.manifest.logicalFingerprint);
		assert.deepEqual(Object.keys(verified.manifest.artifacts).sort(), expectedArtifacts);
		for (const family of expectedArtifacts) {
			assert.ok(verified.manifest.artifacts[family].bytes > 0, family);
		}

		const hooks = JSON.parse(readFileSync(join(artifactRoot, "hooks", "processes.json"), "utf8"));
		const mcp = JSON.parse(readFileSync(join(artifactRoot, "mcp", "processes.json"), "utf8"));
		const mutations = JSON.parse(readFileSync(join(artifactRoot, "mutations.json"), "utf8"));
		assert.equal(hooks.length, 8);
		assert.equal(mcp.length, 24);
		assert.deepEqual(new Set(mcp.map(({ protocolVersion }) => protocolVersion)), new Set(["2025-06-18", "2024-11-05"]));
		assert.deepEqual(mutations.map(({ id, observedFailure }) => ({ id, observedFailure })), [
			{ id: "malformed-bundle", observedFailure: true },
			{ id: "altered-bundle", observedFailure: true },
		]);

		const alteredRoot = join(testRoot, "altered caller copy");
		cpSync(artifactRoot, alteredRoot, { recursive: true });
		writeFileSync(join(alteredRoot, "reconstruction.json"), "{}\n");
		assert.throws(() => verifyBundle(alteredRoot), /hash/i);
		assert.equal(existsSync(artifactRoot), true);
		assert.equal(verifyBundle(artifactRoot).bundleHash, report.bundle.hash);
	} finally {
		rmSync(testRoot, { recursive: true, force: true });
	}
});

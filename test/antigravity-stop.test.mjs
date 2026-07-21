import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { runAntigravityStopContinuation } from "../scripts/antigravity-hooks/stop-continuation.mjs";

const CONVERSATION_ID = "todo9-conversation";
const SESSION_KEY = `antigravity:${CONVERSATION_ID}`;

test("[todo9.stop.strict-active-id-session] #given valid v2 Boulder state #when Stop arrives #then only active_work_id may own the Antigravity session", (t) => {
	const fixture = createFixture(t, {
		boulder: boulderState({
			activeWorkId: "work-a",
			works: {
				"work-a": workRecord({ workId: "work-a", sessionIds: [SESSION_KEY] }),
				"work-b": workRecord({ workId: "work-b", sessionIds: ["antigravity:other"] }),
			},
		}),
	});

	const first = runStop(fixture);

	assert.deepEqual(JSON.parse(first.stdout), { decision: "continue", reason: "lazyantigravity start-work continuation attempt 1/3" });
	assert.equal(first.clearState, false);
	assert.equal(readState(fixture).attempts, 1);
});

test("[todo9.stop.ambiguous-clears] #given zero or ambiguous workspace/record matches #when Stop arrives #then exact stop is emitted and state is cleared", (t) => {
	const missingActive = createFixture(t, {
		boulder: boulderState({
			activeWorkId: "",
			works: {
				"work-a": workRecord({ workId: "work-a", sessionIds: [SESSION_KEY] }),
			},
		}),
		previousState: { conversationId: CONVERSATION_ID, progressHash: "old", attempts: 2 },
	});
	assertStopAndCleared(runStop(missingActive), missingActive);

	const duplicateSession = createFixture(t, {
		boulder: boulderState({
			activeWorkId: "work-a",
			works: {
				"work-a": workRecord({ workId: "work-a", sessionIds: [SESSION_KEY] }),
				"work-b": workRecord({ workId: "work-b", sessionIds: [SESSION_KEY] }),
			},
		}),
		previousState: { conversationId: CONVERSATION_ID, progressHash: "old", attempts: 2 },
	});
	assertStopAndCleared(runStop(duplicateSession), duplicateSession);

	const otherWorkspace = createFixture(t, {
		boulder: boulderState({
			activeWorkId: "work-a",
			works: { "work-a": workRecord({ workId: "work-a", sessionIds: [SESSION_KEY] }) },
		}),
	});
	const twoWorkspaces = createFixture(t, {
		boulder: boulderState({
			activeWorkId: "work-a",
			works: { "work-a": workRecord({ workId: "work-a", sessionIds: [SESSION_KEY] }) },
		}),
		workspacePaths: [otherWorkspace.workspace, null],
		previousState: { conversationId: CONVERSATION_ID, progressHash: "old", attempts: 2 },
	});
	twoWorkspaces.workspacePaths[1] = twoWorkspaces.workspace;
	assertStopAndCleared(runStop(twoWorkspaces), twoWorkspaces);
});

test("[todo9.stop.plan-artifact-reparse-rejection] #given unsafe plan or artifact paths #when Stop arrives #then state is not followed or rewritten", (t) => {
	const outsidePlan = createFixture(t, {
		boulder: boulderState({
			activeWorkId: "work-a",
			works: { "work-a": workRecord({ workId: "work-a", activePlan: "../outside.md", sessionIds: [SESSION_KEY] }) },
		}),
	});
	assertStopAndCleared(runStop(outsidePlan), outsidePlan);

	const symlinkedState = createFixture(t, {
		boulder: boulderState({
			activeWorkId: "work-a",
			works: { "work-a": workRecord({ workId: "work-a", sessionIds: [SESSION_KEY] }) },
		}),
	});
	const linkTarget = join(symlinkedState.root, "outside-state.json");
	writeFileSync(linkTarget, "{}", "utf8");
	rmSync(symlinkedState.statePath, { force: true });
	try {
		symlinkSync(linkTarget, symlinkedState.statePath);
		const result = runStop(symlinkedState);
		assert.equal(result.stdout, '{"decision":"stop"}\n');
		assert.equal(readFileSync(linkTarget, "utf8"), "{}");
	} catch (error) {
		if (error?.code !== "EPERM") throw error;
		t.diagnostic("file symlink creation unavailable on this Windows host; proving artifact reparse rejection with a junction instead");
		const junctionTarget = join(symlinkedState.root, "artifact-target");
		const junctionPath = join(symlinkedState.root, "artifact-junction");
		mkdirSync(junctionTarget, { recursive: true });
		symlinkSync(junctionTarget, junctionPath, "junction");
		assert.equal(runStop({ ...symlinkedState, artifact: junctionPath }).stdout, '{"decision":"stop"}\n');
		assert.equal(readFileSync(linkTarget, "utf8"), "{}");
	}
});

test("[todo9.stop.atomic-counter] #given unchanged incomplete work #when Stop repeats #then attempts 1-3 continue and attempt 4 stops with cleared state", (t) => {
	const fixture = createFixture(t, {
		boulder: boulderState({
			activeWorkId: "work-a",
			works: { "work-a": workRecord({ workId: "work-a", sessionIds: [SESSION_KEY] }) },
		}),
	});

	const attempts = [runStop(fixture), runStop(fixture), runStop(fixture), runStop(fixture)];

	assert.deepEqual(attempts.map((result) => JSON.parse(result.stdout).decision), ["continue", "continue", "continue", "stop"]);
	assert.equal(readState(fixture), null);
	assert.equal(listArtifactTemps(fixture).length, 0);
});

test("[todo9.stop.progress-hash-fields] #given stable identity and checkbox progress #when top-level checkboxes change #then attempts reset; timestamp/log/evidence churn does not reset", (t) => {
	const fixture = createFixture(t, {
		boulder: boulderState({
			activeWorkId: "work-a",
			works: { "work-a": workRecord({ workId: "work-a", sessionIds: [SESSION_KEY] }) },
			updatedAt: "2026-07-11T00:00:00.000Z",
		}),
	});

	assert.equal(readAttempt(runStop(fixture), fixture), 1);
	mutateBoulder(fixture, { updatedAt: "2026-07-11T00:00:01.000Z", log: ["noise"], evidence: { changed: true } });
	assert.equal(readAttempt(runStop(fixture), fixture), 2);

	writePlan(fixture, ["- [x] First task", "- [ ] Second task"]);
	assert.equal(readAttempt(runStop(fixture), fixture), 1);
});

test("[todo9.stop.terminal-clear] #given terminal branches #when Stop arrives #then exact stop is emitted and persisted state is removed", (t) => {
	for (const terminalCase of [
		{ name: "not-idle", input: { fullyIdle: false } },
		{ name: "error", input: { terminationReason: "model_stop", error: "boom" } },
		{ name: "max-step", input: { terminationReason: "max_steps" } },
		{ name: "inactive", work: { status: "completed" } },
		{ name: "complete-plan", planLines: ["- [x] First task", "- [x] Second task"] },
	]) {
		const fixture = createFixture(t, {
			boulder: boulderState({
				activeWorkId: "work-a",
				works: {
					"work-a": workRecord({ workId: "work-a", status: terminalCase.work?.status ?? "active", sessionIds: [SESSION_KEY] }),
				},
			}),
			planLines: terminalCase.planLines,
			previousState: { conversationId: CONVERSATION_ID, progressHash: "old", attempts: 2 },
		});

		assertStopAndCleared(runStop(fixture, terminalCase.input), fixture, terminalCase.name);
	}
});

function createFixture(t, { boulder, planLines, workspacePaths, previousState } = {}) {
	const root = mkdtempSync(join(tmpdir(), "lazyantigravity-todo9-"));
	t.after(() => {
		rmSync(root, { recursive: true, force: true });
	});
	const workspace = join(root, "workspace");
	const artifact = join(root, "artifact");
	mkdirSync(join(workspace, ".omo", "plans"), { recursive: true });
	mkdirSync(artifact, { recursive: true });
	writePlan({ workspace }, planLines ?? ["- [ ] First task", "- [ ] Second task"]);
	writeFileSync(join(workspace, ".omo", "boulder.json"), `${JSON.stringify(boulder, null, 2)}\n`, "utf8");
	const statePath = join(artifact, "lazyantigravity-stop-state.json");
	if (previousState) writeFileSync(statePath, `${JSON.stringify(previousState)}\n`, "utf8");
	return { root, workspace, artifact, statePath, workspacePaths: workspacePaths ?? [workspace] };
}

function runStop(fixture, inputOverrides = {}) {
	return runAntigravityStopContinuation({
		conversationId: CONVERSATION_ID,
		workspacePaths: fixture.workspacePaths,
		artifactDirectoryPath: fixture.artifact,
		executionNum: 1,
		terminationReason: "model_stop",
		fullyIdle: true,
		...inputOverrides,
	});
}

function boulderState({ activeWorkId, works, updatedAt }) {
	return {
		schema_version: 2,
		active_work_id: activeWorkId,
		works,
		session_ids: [SESSION_KEY],
		active_plan: ".omo/plans/legacy-mirror.md",
		...(updatedAt === undefined ? {} : { updated_at: updatedAt }),
	};
}

function workRecord({ workId, activePlan = ".omo/plans/plan.md", status = "active", sessionIds }) {
	return {
		work_id: workId,
		active_plan: activePlan,
		plan_name: "plan",
		session_ids: sessionIds,
		status,
		worktree_path: null,
	};
}

function writePlan(fixture, lines) {
	writeFileSync(join(fixture.workspace, ".omo", "plans", "plan.md"), `${["# Plan", "", "## TODOs", ...lines].join("\n")}\n`, "utf8");
}

function mutateBoulder(fixture, changes) {
	const path = join(fixture.workspace, ".omo", "boulder.json");
	const state = JSON.parse(readFileSync(path, "utf8"));
	state.works[state.active_work_id] = { ...state.works[state.active_work_id], ...changes };
	writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function readAttempt(result, fixture) {
	assert.equal(JSON.parse(result.stdout).decision, "continue");
	return readState(fixture).attempts;
}

function readState(fixture) {
	try {
		return JSON.parse(readFileSync(fixture.statePath, "utf8"));
	} catch {
		return null;
	}
}

function assertStopAndCleared(result, fixture, label = "") {
	assert.equal(result.stdout, '{"decision":"stop"}\n', label);
	assert.equal(readState(fixture), null, label);
}

function listArtifactTemps(fixture) {
	return readdirSync(fixture.artifact).filter((entry) => entry.includes(".tmp-"));
}

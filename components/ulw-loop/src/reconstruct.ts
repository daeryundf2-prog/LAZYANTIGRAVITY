import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { computeLedgerHash, getRunDir, loadLeasePolicy } from "./control-plane.js";
import type { LedgerEvent, RunState, RunStateSchema } from "./control-plane-types.js";
import { stripSensitiveData } from "./sensitive-data-scrubber.js";

// Read events
export async function readRunEvents(repoRoot: string, runId: string): Promise<LedgerEvent[]> {
	const runDir = getRunDir(repoRoot, runId);
	const eventsFile = join(runDir, "events.jsonl");
	if (!existsSync(eventsFile)) {
		return [];
	}

	const content = await readFile(eventsFile, "utf8");
	const events: LedgerEvent[] = [];
	const lines = content.split("\n");
	for (const [i, line] of lines.entries()) {
		if (line.trim().length === 0) continue;
		try {
			events.push(JSON.parse(line) as LedgerEvent);
		} catch {
			// 깨진 줄을 조용히 버리면 체인 어긋남이 재구성 상태에는 티가 나지
			// 않는다. 건너뛰되 stderr로 눈에 보이게 남긴다(재구성은 계속 —
			// 무결성 판정은 verify-ledger가 담당).
			console.error(`[ulw-loop] warning: skipping corrupted ledger line ${i + 1} in ${eventsFile}`);
		}
	}
	return events;
}

// Reconstruct state from events
export async function reconstructStateFromEvents(
	repoRoot: string,
	runId: string,
	nowOverride?: Date,
): Promise<RunStateSchema> {
	const events = await readRunEvents(repoRoot, runId);
	const policy = await loadLeasePolicy(repoRoot);
	return stateFromEventsList(events, policy, repoRoot, runId, nowOverride || new Date());
}

// 이미 읽은 이벤트 목록으로 상태를 재구성한다 — append 경로가 전체 원장을
// 한 번만 읽고 재구성까지 같은 패스에서 끝내도록 분리했다.
export async function stateFromEventsList(
	events: LedgerEvent[],
	policy: Awaited<ReturnType<typeof loadLeasePolicy>>,
	repoRoot: string,
	runId: string,
	now: Date,
): Promise<RunStateSchema> {
	const runState: RunStateSchema = {
		runId,
		state: "created",
		updatedAt: now.toISOString(),
		agents: {},
	};

	for (const event of events) {
		mutateStateWithEvent(runState, event, policy.subagentLease);
	}
	return await finalizeState(runState, repoRoot, runId, now);
}

// 직전 상태에 이벤트 하나를 증분 적용한다 — append 핫패스용. 상태 기계는
// 이벤트별 순차 누적이므로 apply(1) == replay(all)이고, staleness 후처리와
// poller 복원은 매 재구성마다 전체 상태에 다시 적용되는 후처리라 증분 경로에서
//도 동일하게 돌린다. 캐시된 base를 오염시키지 않도록 clone해서 쓴다.
export async function applyEventToState(
	repoRoot: string,
	runId: string,
	base: RunStateSchema,
	event: LedgerEvent,
	nowOverride?: Date,
): Promise<RunStateSchema> {
	const policy = await loadLeasePolicy(repoRoot);
	const runState = structuredClone(base);
	mutateStateWithEvent(runState, event, policy.subagentLease);
	return await finalizeState(runState, repoRoot, runId, nowOverride || new Date());
}

function mutateStateWithEvent(
	runState: RunStateSchema,
	event: LedgerEvent,
	subConfig: { defaultLeaseMs: number; maxLeaseMs: number; staleGraceMs: number },
): void {
	const eventTime = new Date(event.timestamp);

	if (event.type === "run.created") runState.state = "created";
	else if (event.type === "run.state_changed") runState.state = event.state as RunState;
	else if (event.type === "parent.paused") runState.state = "paused";
	else if (event.type === "parent.hitl_required") {
		runState.state = "paused";
		runState.hitlReason = event.reason || event.hitlReason || "Human intervention required";
		if (event.hitlId) runState.activeHitlId = event.hitlId;
		else delete runState.activeHitlId;
	} else if (event.type === "parent.resumed") {
		// Do not lift an active human-intervention block on a resumed event that
		// does not reference the pending hitlId explicitly.
		if (runState.activeHitlId && event.hitlId !== runState.activeHitlId) {
			// Invalid or missing hitlId while HITL is active, ignore
		} else {
			if (event.resumeTargetState) {
				runState.state = event.resumeTargetState as RunState;
			} else if (event.previousState) {
				runState.state = event.previousState as RunState;
			} else {
				runState.state = (event.state as RunState) || "working";
			}
			delete runState.hitlReason;
			delete runState.activeHitlId;
		}
	} else if (event.type === "run.completed") {
		// HITL pending 상태에서 run.completed 직접 기록 금지 (무시 또는 저장)
		if (runState.activeHitlId) {
			// Ignore run.completed if HITL is active
		} else {
			runState.state = "completed";
		}
	} else if (event.type === "run.failed") runState.state = "failed";
	else if ((event.type as string) === "lineage.branch_created") {
		runState.state = (event.previousState as RunState) || "working";
	}

	if (event.agentId) {
		const agentId = event.agentId;
		if (!runState.agents[agentId]) {
			runState.agents[agentId] = {
				agentId,
				role: event.role || "",
				state: "pending",
				dispatchedAt: event.timestamp,
				leaseExpiresAt: new Date(eventTime.getTime() + subConfig.defaultLeaseMs).toISOString(),
			};
		}

		const agent = runState.agents[agentId];

		if (event.type === "agent.dispatched") {
			agent.state = "dispatched";
			agent.role = event.role || agent.role;
			agent.dispatchedAt = event.timestamp;
			agent.leaseExpiresAt = new Date(eventTime.getTime() + subConfig.defaultLeaseMs).toISOString();
		} else if (event.type === "agent.claimed") {
			agent.state = "claimed";
			agent.claimedAt = event.timestamp;
			agent.leaseExpiresAt = new Date(eventTime.getTime() + subConfig.defaultLeaseMs).toISOString();
		} else if (event.type === "agent.heartbeat") {
			if (["dispatched", "claimed", "running", "stale_candidate"].includes(agent.state)) agent.state = "running";
			agent.lastHeartbeat = event.timestamp;
			const nextLease = Math.min(
				eventTime.getTime() + subConfig.defaultLeaseMs,
				new Date(agent.dispatchedAt).getTime() + subConfig.maxLeaseMs,
			);
			agent.leaseExpiresAt = new Date(nextLease).toISOString();
		} else if (event.type === "agent.progress") {
			if (["dispatched", "claimed", "running", "stale_candidate"].includes(agent.state)) agent.state = "running";
			if (event.progress !== undefined) agent.lastProgress = event.progress;
			agent.lastProgressAt = event.timestamp;
			const nextLease = Math.min(
				eventTime.getTime() + subConfig.defaultLeaseMs + subConfig.staleGraceMs,
				new Date(agent.dispatchedAt).getTime() + subConfig.maxLeaseMs,
			);
			agent.leaseExpiresAt = new Date(nextLease).toISOString();
		} else if (event.type === "agent.completed_reported") {
			agent.state = "completed_reported";
			agent.result = event.result;
		} else if (event.type === "agent.failed_reported") {
			agent.state = "failed_reported";
			agent.result = event.result;
		} else if (event.type === "parent.acknowledged") {
			agent.state = "acknowledged";
		} else if (event.type === "parent.rejected") {
			agent.state = "orphaned";
		}
	}
}

// staleness 후처리 + poller 복원 — 전체 재구성과 증분 적용이 동일하게 거치는 마무리 패스.
async function finalizeState(
	runState: RunStateSchema,
	repoRoot: string,
	runId: string,
	now: Date,
): Promise<RunStateSchema> {
	// Post-processing: check for stale candidates based on lease expiration
	for (const agentId of Object.keys(runState.agents)) {
		const agent = runState.agents[agentId];
		if (!agent) continue;
		const isTerminal = ["completed_reported", "failed_reported", "acknowledged", "orphaned"].includes(agent.state);
		if (!isTerminal && now > new Date(agent.leaseExpiresAt)) {
			agent.state = "stale_candidate";
		}
	}

	// Restore active poller lease from state.json if it exists
	const runDir = getRunDir(repoRoot, runId);
	const stateFile = join(runDir, "state.json");
	if (existsSync(stateFile)) {
		try {
			const savedState = JSON.parse(await readFile(stateFile, "utf8")) as RunStateSchema;
			if (savedState.activePoller && now < new Date(savedState.activePoller.expiresAt)) {
				runState.activePoller = savedState.activePoller;
			}
		} catch {}
	}

	runState.updatedAt = now.toISOString();
	return runState;
}

// Reconstruct and save state.json
export async function reconstructAndSaveState(repoRoot: string, runId: string): Promise<RunStateSchema> {
	const state = await reconstructStateFromEvents(repoRoot, runId);
	const runDir = getRunDir(repoRoot, runId);
	if (!existsSync(runDir)) {
		await mkdir(runDir, { recursive: true });
	}
	await writeFile(join(runDir, "state.json"), JSON.stringify(stripSensitiveData(state), null, 2), "utf8");
	return state;
}

// Repair corrupted ledger file
export async function repairLedgerFile(
	repoRoot: string,
	runId: string,
): Promise<{ repairedCount: number; corruptedCount: number }> {
	const runDir = getRunDir(repoRoot, runId);
	const eventsFile = join(runDir, "events.jsonl");
	if (!existsSync(eventsFile)) {
		return { repairedCount: 0, corruptedCount: 0 };
	}

	const content = await readFile(eventsFile, "utf8");
	const validEvents: LedgerEvent[] = [];
	const lines = content.split("\n");
	let corruptedCount = 0;

	for (const line of lines) {
		if (line.trim().length === 0) continue;
		try {
			validEvents.push(JSON.parse(line) as LedgerEvent);
		} catch {
			corruptedCount++;
		}
	}

	if (corruptedCount > 0) {
		// Re-link the surviving events into a fresh hash chain: dropping lines
		// changes indices, so original prevHash/hash values are invalid and would
		// make verifyLedgerIntegrity fail afterwards.
		let prevHash = "0000000000000000000000000000000000000000000000000000000000000000";
		for (const event of validEvents) {
			const clean = stripSensitiveData({ ...event, prevHash });
			clean.hash = computeLedgerHash(clean);
			prevHash = clean.hash;
			Object.assign(event, clean);
		}
		const newContent = `${validEvents.map((e) => JSON.stringify(e)).join("\n")}\n`;
		await writeFile(eventsFile, newContent, "utf8");
		await reconstructAndSaveState(repoRoot, runId);
	}

	return { repairedCount: validEvents.length, corruptedCount };
}

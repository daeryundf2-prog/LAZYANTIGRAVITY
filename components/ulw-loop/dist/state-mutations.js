// Pure per-event state transitions, extracted from reconstruct.ts to honor
// the 250-LOC ceiling. Callers pass the lease policy in.
export function mutateStateWithEvent(runState, event, subConfig) {
    const eventTime = new Date(event.timestamp);
    if (event.type === "run.created")
        runState.state = "created";
    else if (event.type === "run.state_changed")
        runState.state = event.state;
    else if (event.type === "parent.paused")
        runState.state = "paused";
    else if (event.type === "parent.hitl_required") {
        runState.state = "paused";
        runState.hitlReason = event.reason || event.hitlReason || "Human intervention required";
        if (event.hitlId)
            runState.activeHitlId = event.hitlId;
        else
            delete runState.activeHitlId;
    }
    else if (event.type === "parent.resumed") {
        // Do not lift an active human-intervention block on a resumed event that
        // does not reference the pending hitlId explicitly.
        if (runState.activeHitlId && event.hitlId !== runState.activeHitlId) {
            // Invalid or missing hitlId while HITL is active, ignore
        }
        else {
            if (event.resumeTargetState) {
                runState.state = event.resumeTargetState;
            }
            else if (event.previousState) {
                runState.state = event.previousState;
            }
            else {
                runState.state = event.state || "working";
            }
            delete runState.hitlReason;
            delete runState.activeHitlId;
        }
    }
    else if (event.type === "run.completed") {
        // HITL pending 상태에서 run.completed 직접 기록 금지 (무시 또는 저장)
        if (runState.activeHitlId) {
            // Ignore run.completed if HITL is active
        }
        else {
            runState.state = "completed";
        }
    }
    else if (event.type === "run.failed")
        runState.state = "failed";
    else if (event.type === "lineage.branch_created") {
        runState.state = event.previousState || "working";
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
        }
        else if (event.type === "agent.claimed") {
            agent.state = "claimed";
            agent.claimedAt = event.timestamp;
            agent.leaseExpiresAt = new Date(eventTime.getTime() + subConfig.defaultLeaseMs).toISOString();
        }
        else if (event.type === "agent.heartbeat") {
            if (["dispatched", "claimed", "running", "stale_candidate"].includes(agent.state))
                agent.state = "running";
            agent.lastHeartbeat = event.timestamp;
            const nextLease = Math.min(eventTime.getTime() + subConfig.defaultLeaseMs, new Date(agent.dispatchedAt).getTime() + subConfig.maxLeaseMs);
            agent.leaseExpiresAt = new Date(nextLease).toISOString();
        }
        else if (event.type === "agent.progress") {
            if (["dispatched", "claimed", "running", "stale_candidate"].includes(agent.state))
                agent.state = "running";
            if (event.progress !== undefined)
                agent.lastProgress = event.progress;
            agent.lastProgressAt = event.timestamp;
            const nextLease = Math.min(eventTime.getTime() + subConfig.defaultLeaseMs + subConfig.staleGraceMs, new Date(agent.dispatchedAt).getTime() + subConfig.maxLeaseMs);
            agent.leaseExpiresAt = new Date(nextLease).toISOString();
        }
        else if (event.type === "agent.completed_reported") {
            agent.state = "completed_reported";
            agent.result = event.result;
        }
        else if (event.type === "agent.failed_reported") {
            agent.state = "failed_reported";
            agent.result = event.result;
        }
        else if (event.type === "parent.acknowledged") {
            agent.state = "acknowledged";
        }
        else if (event.type === "parent.rejected") {
            agent.state = "orphaned";
        }
    }
}

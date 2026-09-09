# LazyAntigravity Operations Runbook & Evidence Governance

## 1. Overview
This runbook provides operators and automated systems with standard operating procedures (SOP) for Evidence generation, Ground-Truth verification, and Human-In-The-Loop (HITL) resolution in LazyAntigravity workflows.

---

## 2. Standard Evidence JSON Format

When submitting work completion via `/ulw checkpoint`, `quality_gate`, or `omo active-learning evolve`, the evidence envelope must strictly adhere to the following schema:

```json
{
  "status": "verified",
  "summary": "Completed JWT token refresh rotation with 100% test pass",
  "workspaceRoot": ".",
  "readRanges": [
    { "file": "src/auth/token.ts", "startLine": 1, "endLine": 120 },
    { "file": "test/auth.test.ts", "startLine": 1, "endLine": 85 }
  ],
  "filesChanged": [
    "src/auth/token.ts"
  ],
  "fileChecksums": [
    { "file": "src/auth/token.ts", "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }
  ],
  "commandsRun": [
    "npm test"
  ],
  "commandAudits": [
    { "command": "npm test", "exitCode": 0, "outputSnippet": "All tests passed" }
  ],
  "executionBinding": {
    "requestId": "req-1",
    "runId": "default-run",
    "sessionId": "session-1",
    "toolCallId": "call-1",
    "startedAt": "2026-08-28T00:00:00.000Z",
    "finishedAt": "2026-08-28T00:01:00.000Z",
    "stdoutFingerprint": "<64-hex sha256 of stdout>",
    "stderrFingerprint": "<64-hex sha256 of stderr>",
    "exitCode": 0
  }
}
```

---

## 3. Ground-Truth Independent Audit Checks

The `evidence-verifier` automatically checks these invariants before allowing any goal completion or persistent memory storage:

1. **Physical File Existence**: Every path in `readRanges` and `fileChecksums` must exist in the workspace.
2. **Line Bounds Accuracy**: `startLine` and `endLine` must not exceed the actual physical line count of the target file.
3. **SHA-256 Checksum Match**: Disk contents are hashed in real-time and compared against `fileChecksums`.
4. **Command Execution Zero-Exit**: All recorded commands in `commandAudits` must have exit code `0`.
5. **Host Execution Binding**: `executionBinding` must reference the current run (`runId`) and carry `exitCode: 0`; without a binding, completion fails closed into `needs_user_decision`.
6. **Placeholder Rejection**: Evidence receipts (`.omo/evidence`, `.lazyantigravity`, `*.log|json|jsonl|txt|receipt`) that are 0 bytes or shorter than 40 substantive characters are rejected.
7. **Freshness (Stale Receipt Rejection)**: Evidence receipts whose `mtime` predates the current run start are rejected — re-serving a previous session's results as fresh work is blocked.
   - **Known limitation**: freshness compares filesystem `mtime` against the transcript birthtime. `touch` (or any copy that resets mtime) re-labels an old receipt as fresh. Treat freshness as a cheap tripwire, not a cryptographic guarantee; the substantive defenses are the 40-char minimum, SHA-256 checksums, and the run-bound `executionBinding`.
8. **Gate-Failure Lock**: any verification failure writes `.omo/ulw-loop/gate_failed.json`; subsequent quality gates hard-stop with `ULW_LOOP_GATE_LOCKED` until a passing ground-truth verification deletes the marker. `ulw-readiness` surfaces the lock as a HARD STOP status line.

---

## 4. Human-In-The-Loop (HITL) Resolution Protocol

When a workflow transitions to `needs_user_decision`:

### Step 1: Inspect Ledger Events
```bash
omo ulw-loop ledger --last 10
```

### Step 2: Resolve Root Blocker
- If consensus rework was exceeded (3 iterations), review conflicting reviewer claims.
- If ground-truth verification failed, ensure no files were deleted or lines fabricated.

### Step 3: Resume Execution
```bash
# Resume after resolving external blocker or approving policy override
omo ulw-loop resume --goal-id G001
```

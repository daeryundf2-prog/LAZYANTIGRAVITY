# Phase 2 + 3 — Hypothesis Formation & Parallel Investigation

One hypothesis is a hunch. Three hypotheses is a decision. Investigation is how you turn the decision into runtime evidence.

---

## Phase 2 — Hypothesis Formation (Minimum Three)

### Why three, not one

A single hypothesis creates confirmation bias: you'll read runtime state looking for evidence that confirms it and unconsciously discount contradictions. Three hypotheses force you to design queries that *distinguish* between them, which is the only way runtime evidence becomes decisive.

### Generate across orthogonal axes

If your three hypotheses are all variations of "the handler has a bug", you don't actually have three hypotheses. Span the space:

| Axis | Example framing |
|---|---|
| **User-code logic** | "The handler early-returns because condition X is unexpectedly true" |
| **Library/SDK behavior** | "The third-party client swallows the error and returns a stub" |
| **Environment/config** | "The env var is read at module-load time before it gets populated, so it's empty" |
| **Async/timing** | "The promise rejects (or goroutine panics) after the response is already sent" |
| **Silent side-effect** | "An earlier turn mutated shared state that the current turn inherits" |
| **Observability gap** | "The error is raised but suppressed before logging; it only exists as an unawaited rejection / ignored signal" |
| **Binary-level** (when applicable) | "The function we think is running is actually jumped over by a patched thunk / a different version loaded" |
| **Build-vs-runtime** | "The code we're reading is not the code that's running — stale build, wrong symlink, cached wheel, or dist/ ahead of src/" |

### For each hypothesis, write in the journal

1. **Claim** — one sentence.
2. **Distinguishing evidence** — the exact value or state that confirms or refutes it, AND where to read it (file:line, log source, breakpoint location, memory address).
3. **If true, the fix is** — two words. Forces you to think through fix cost before committing to the hunt.

### Collapse rule

If two hypotheses have identical distinguishing evidence, they aren't actually different — collapse them and find a real alternative. If you can't come up with a third distinct hypothesis, you don't understand the system well enough yet. Go read a little more code before investigating.

---

## Phase 3 — Parallel Investigation

### State freshness invariant

**A debug session's state is a snapshot with a lifetime, not a fact you can carry forward indefinitely.**
- Before any action that mutates the debuggee, re-observe the session's current state.
- This includes continue, step, side-effecting evaluation, setting or removing breakpoints, and termination.
- Record the current thread state and stop reason; those are the concrete tells for whether the old plan still applies.
- An observation from an earlier turn may already be stale when the next action is issued.
- Turns can be minutes apart while the debuggee runs at full speed, so this failure mode is normal, not exceptional.
- If the thread state or stop reason has moved, re-observe the new state and do not replay the old plan.
- Treat every mutation as conditional on the state you just observed, not on a remembered stop.

### Failure-to-recovery taxonomy

| Failure signature | Most likely cause | Next move |
|---|---|---|
| Adapter or debugger process failed to start | Wrong binary or missing installation | Verify the tool exists, then re-launch; do not retry blindly. |
| Breakpoint accepted but never bound or verified | Source path mismatch, optimized-out code, or missing debug symbols | Check the binary was built with symbols and that the debugger-resolved path matches your file. |
| Attach refused | Permissions, ptrace scope, SIP, or wrong PID | Fix the environment or target identity; a retry will not change it. |
| No stop event within the expected window | Process is running, the breakpoint is unreachable, or the wait was too short | Pause and inspect threads rather than waiting longer. |
| Session terminated unexpectedly | The debuggee crashed or exited | Capture the exit and crash evidence before restarting. |

Branch depending on what's available.

### Path A: Parallel investigation wave (default)

Launch one `invoke_subagent` call — one member per evidence source, hypotheses split across them. This is the right default whenever you have ≥3 hypotheses and any of them would take >10 minutes to investigate single-threaded.

**Wave spec** — one `invoke_subagent` call whose `Subagents` array carries these role briefs:

```json
{
  "Subagents": [
    {
      "TypeName": "self",
      "Role": "Runtime State Inspector",
      "Model": "flash",
      "Prompt": "You are the Runtime State Inspector. Your job: attach to the live process, hit breakpoints, read program state (variables, heap, goroutines, stack, registers depending on runtime), and report observed values verbatim. Never guess — if you don't see the value, say so. Report back with file:line / address references and captured values. Never edit source code. Never run git commands. If you need an instrumentation statement added (breakpoint(), debugger;, dbg!, etc.), say so in your reply — the Lead approves all edits."
    },
    {
      "TypeName": "self",
      "Role": "Log Archaeologist",
      "Model": "flash",
      "Prompt": "You are the Log Archaeologist. Your job: grep server logs, stderr streams, SDK-internal debug output (DEBUG env, RUST_LOG, GODEBUG, PYTHONASYNCIODEBUG), and correlate timestamps. Produce a timeline of events with latencies. Flag anything that looks like a silent catch, a swallowed rejection, a panic recovered-and-ignored, a success response that contains failure signals (HTTP 200 with empty body, stopReason=error, exit 0 with error-in-stdout). Never edit source code."
    },
    {
      "TypeName": "self",
      "Role": "Reproduction Engineer",
      "Model": "flash",
      "Prompt": "You are the Reproduction Engineer. Your job: build the smallest reliable repro — a curl command, a vitest/pytest/go test, a shell script, a Playwright script for browser bugs, a pwntools script for binary targets. It must reproduce on first try and be copy-pasteable by the Lead. Document exact input, expected output, observed output. Save repro artifacts under /tmp/ and report their paths so the Lead can journal them. If the bug is browser-based you MUST use Playwright CLI — do not simulate with curl."
    },
    {
      "TypeName": "self",
      "Role": "Trace Correlator",
      "Model": "flash",
      "Prompt": "You are the Trace Correlator. Your job: take findings from the other members (quoted in this prompt) and cross-link them. Build a causal chain from symptom to suspected cause. Identify missing evidence. Propose the next single most-decisive runtime query. Never edit source code; only reason across already-captured evidence. If hypotheses diverge sharply after correlation, say so explicitly — that is the signal for the Oracle Triple."
    }
  ]
}
```

**Assignment rule**: one hypothesis per subagent `Prompt`. Give each hypothesis to the member whose evidence source is most likely to confirm or refute it, and embed the full hypothesis list in every brief — Antigravity subagents cannot message each other mid-run, so each prompt carries the shared context. The Trace Correlator runs in the wave AFTER the evidence lanes return, with their findings quoted into its prompt.

**Lead responsibilities**:
- Maintain the journal (subagents do not write to it).
- Approve any source-code edits (including `debugger;` / `breakpoint()` / `dbg!` statements).
- Synthesize member replies into updated hypothesis statuses.
- Done-condition: every spawned subagent's result journaled before synthesis — members terminate on completion, so "done" is accounting for every result, not deleting a team.

**The wave does NOT include Oracle** — Oracle runs as a separate adversarial lane (`Model: "pro"`) in Phase 4 (see `04-oracle-triple.md`).

### Path B: Reduced parallelism

When the runtime rejects a large `Subagents` array or concurrency is constrained, fan out fewer `invoke_subagent` lanes — or investigate single-threaded yourself. Same rule: one hypothesis per lane.

```
invoke_subagent(
  Subagents=[
    {
      TypeName: "self",
      Role: "Runtime State Scout",
      Model: "flash",
      Prompt: "[CONTEXT: bug summary + which hypothesis you own + what state to look at]\nRuntime state investigation for hypothesis 1: ..."
    },
    {
      TypeName: "self",
      Role: "Log & Timing Scout",
      Model: "flash",
      Prompt: "Log/timing investigation for hypothesis 2: ..."
    },
    {
      TypeName: "self",
      Role: "Reproduction Minimizer",
      Model: "flash",
      Prompt: "Reproduction minimizer for hypothesis 3: ..."
    }
  ],
  toolAction: "Investigating hypotheses in parallel",
  toolSummary: "Parallel hypothesis investigation"
)
```

End your response, wait for completion notifications, then synthesize.

---

## Evidence capture discipline (both paths)

For every piece of runtime state captured, record in the journal:

```markdown
### <ISO timestamp> — <what you looked at>
- Source: <file:line | log source | curl command | breakpoint address>
- Value: `<verbatim>`
- Interpretation: <one line — why this matters>
- Refutes/Confirms: H<n>
```

**Verbatim values only. No paraphrasing.**

- `messages.length=0` is evidence.
- "messages seemed empty" is not evidence — it's a memory of an observation, and memory of observations is where debug sessions go to die.

If you find yourself about to paraphrase, stop, go back, and copy the raw value.

---

## Round completion

A "round" is complete when every hypothesis has either confirming or refuting evidence — or when you have exhausted the evidence sources available without a decisive result. If the round ends inconclusively, that counts as a failed round for the counter in the journal. See `04-oracle-triple.md` for what to do at 2 consecutive failed rounds.

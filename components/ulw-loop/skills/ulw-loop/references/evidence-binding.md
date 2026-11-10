# Evidence binding and the final verdict

Source: adapted from hypercore (MIT, (c) 2026 alpoxdev) `skills/hyper-loop/rules/evidence-binding.md` and `skills/hyper-mass/rules/run-and-recovery.md` at 2d305cbf5db72e337189aa584b363bb9ced2d9bc; see `NOTICE`.

A proof describes the exact content it checked. When the code changes afterwards, the old output proves nothing about the new code. Bind every criterion proof to the worktree fingerprint and refuse stale proofs.

## Fingerprint

`node "$PLUGIN_ROOT/scripts/lazyantigravity-evidence-map.mjs" --fingerprint` (read-only; prints JSON for the current directory's git worktree, or pass `--repo <dir>`):

| Field | Meaning |
| --- | --- |
| `tree` | `git rev-parse HEAD^{tree}`; a message-only commit does not invalidate a proof |
| `diff_sha256` | SHA-256 of `git diff --binary HEAD` plus one `<sha256>\t<path>` line per sorted untracked file; ignored files and `.omo/`, `.lazyantigravity/`, `.lazycodex/` are excluded so the ledger never stales itself |

The fingerprint does not cover files outside the repository, remote services, or whether the scenario was a good test.

## Record and check

Record one row per criterion proof, after the capture ran and its cleanup receipt exists. Rows live in `.omo/ulw-loop/evidence-binding.jsonl` next to the CLI state; they add the fingerprint and do not replace the `lazyantigravity ulw-loop` evidence calls.

```
node "$PLUGIN_ROOT/scripts/lazyantigravity-evidence-map.mjs" --record .omo/ulw-loop/evidence-binding.jsonl \
  --criterion C1 --verdict pass --command "<the command that was run>" \
  --evidence "<what was observed: exit code, output line>" --artifact <path-to-capture>
node "$PLUGIN_ROOT/scripts/lazyantigravity-evidence-map.mjs" --check-ledger .omo/ulw-loop/evidence-binding.jsonl --criteria C1,C2
```

`--check-ledger` takes the newest row per criterion and exits 1 unless every one is `pass`:

| State | Meaning |
| --- | --- |
| `pass` | verdict pass, fingerprint equals the current one, every artifact exists and is non-empty |
| `stale` | passed, but `tree` or `diff_sha256` differs now: the content moved after the capture |
| `failing` | newest verdict is `fail` or `blocked` |
| `missing` | a listed criterion has no row |
| `missing-evidence-file` | fresh row, but an artifact is absent or empty |

Run `--check-ledger` before the final verdict and again after every edit that follows a recorded proof. Rows are append-only; a wrong row is superseded by a newer one.

## Re-capture, never re-label

A `stale` criterion needs a new capture: re-run its scenario, overwrite the artifact, `--record` again. Never copy an old `tree`/`diff_sha256` onto old output, never attach an old log to a new fingerprint because the change "cannot have affected it", and never mark a criterion done without a row. Writing a new artifact under the repository changes the fingerprint, so record the row after the artifact exists, and keep artifacts under `.omo/` when they should not stale earlier rows.

## Verifier label

Every final verdict names who verified it. When `invoke_subagent` is available, the verdict comes from a lane that did not produce the work. When no subagent can be started, the producer is also the judge: write `verifier: self (no subagent capability)` in the verdict and the completion message, limit the verdict to deterministic checks (commands with captured output, file existence, diffs, `--check-ledger`), and say `maker-checker not available`. Never present a self-assessment as independent review.

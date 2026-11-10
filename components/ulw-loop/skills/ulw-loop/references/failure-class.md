# Failure class and dependent criteria

Source: adapted from hypercore (MIT, (c) 2026 alpoxdev) `skills/hyper-execute/rules/verification-gates.md` at 2d305cbf5db72e337189aa584b363bb9ced2d9bc; see `NOTICE`.

This is a notes convention for `record-evidence`, not a parsed field. The CLI stores `--notes` verbatim and nothing enforces the format. It complements the event-level `stagnation-guard`, which detects repeated errors across events, and it does not replace `evidence-verifier` (staleness and checksums).

## Name what failed

Every `fail` or `blocked` row carries `failure_class=<value>` in its notes:

| Value | Meaning |
| --- | --- |
| `none` | The criterion passed, or nothing failed. |
| `product` | The product behavior was exercised and is wrong. |
| `harness` | The runner, fixture, CI job or environment broke before the product behavior was exercised. |

```
lazyantigravity ulw-loop record-evidence --goal-id <id> --criterion-id <id> --status fail \
  --evidence "<observable>" --notes "failure_class=harness; signature=<check> :: <first error line>" --json
```

A claim of "tests ran" with no run evidence is `product` and stays failed, even when the diff looks right.

## Failure signature

The failing check plus its first error line, with volatile values removed: temp paths, timestamps, process ids, run ids, durations. Two failures with the same signature are the same failure.

## Attempts and stop

- Count attempts per criterion, from its first dispatch.
- One repair of a `harness` failure does not count as an attempt. If the same harness signature fails again after the repair, count it and stop.
- Stop the criterion when the same signature repeats on consecutive attempts, the third attempt fails, or four hours have passed since the first dispatch.
- On stop, revert that criterion's unverified changes, record `--status blocked` with `--notes "Unmet: <gap>; signature=<sig>; attempts=<n>"`, and continue with criteria that do not depend on it.

## Dependent criteria

A blocked criterion is never a met dependency. When one is closed this way, record every criterion that depends on it, directly or through another dependent, as `blocked` with `--notes "Unmet: dependency <criterion-id> blocked"`, count no attempts for them, and keep working on the independent ones. The final verification criterion does not depend on a blocked one: it verifies what landed and reports each blocked criterion as a known gap.

# LAZYANTIGRAVITY — verified guide

[Main README](../README.md) · [한국어](README.ko.md) · [Scorecard](../docs/scorecard.md)

## What is active

The checked-in catalog exposes 15 active skills: `ast-grep`, `debugging`, `frontend-ui-ux`, `git-master`, `init-deep`, `lsp`, `lsp-setup`, `programming`, `review-work`, `rules`, `start-work`, `ulw`, `ulw-loop`, `ulw-plan`, `visual-qa`. The package registers 2 official hooks (`PreInvocation`, `Stop`) and 3 local MCP servers (`database`, `git-bash`, `lsp`). Node.js >=20.17 is required.

The [19 experimental skills](../docs/experimental-skills.md) are unsupported in both available modes. Do not copy them into an Antigravity location without first porting and changing the checked-in fixture and then adding fresh evidence.

## What was exercised

A disposable staged validator created four byte-identical package layouts and drove the hook and MCP processes. The result establishes staged-process behavior only. Rule parity remains unverified across the four staged layouts. CLI and IDE live loading were unavailable, hosted execution has no fresh receipt, and real SQLite was unavailable.

## Reproduce locally

```sh
node scripts/validate-root-toolchain.mjs
node scripts/generate-antigravity-docs.mjs --check
node scripts/generate-antigravity-score.mjs --check
node scripts/validate-antigravity-distribution.mjs
```

Use an isolated copy when reviewing an untrusted change. The staged validator uses temporary locations and reports cleanup; it is not a live-install command.

## Decision

Use this repository for local evaluation and staged process verification. Do not treat it as proven for live installation or production deployment until fresh CLI, IDE, hosted, and SQLite evidence exists.

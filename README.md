# LAZYANTIGRAVITY

LAZYANTIGRAVITY is a dependency-free local package being adapted to the pinned Google Antigravity contracts in this repository. Its current status is deliberately narrower than earlier documentation claimed.

## Verified surface

- **15 active skills:** `ast-grep`, `debugging`, `frontend-ui-ux`, `git-master`, `init-deep`, `lsp`, `lsp-setup`, `programming`, `review-work`, `rules`, `start-work`, `ulw`, `ulw-loop`, `ulw-plan`, `visual-qa`.
- **19 experimental skills are currently unsupported** in both IDE and CLI modes. See the [English status guide](docs/experimental-skills.md) or [Korean status guide](docs/experimental-skills.ko.md).
- **2 official hooks:** `PreInvocation` and `Stop`.
- **3 local MCP servers:** `database`, `git-bash`, and `lsp`.
- **Runtime:** Node.js >=20.17. The root package has no runtime or development dependencies.

## Verification boundary

The validator produced four staged layouts with identical package bytes and exercised real hook and MCP processes. IDE rule parity remains unverified for those four staged layouts. Hosted CI execution, CLI live installation, and IDE live loading are unavailable in the current evidence. A real SQLite executable was unavailable; the database surface is limited to guarded local, read-only SQLite behavior and its unavailable path.

This package is usable for local evaluation and staged process verification. It is not proven for live installation or production deployment. Read the [evidence-backed scorecard](docs/scorecard.md) before deciding whether it fits your use case.

## Local verification

Prerequisite: Node.js >=20.17. Run from a clean copy of this repository:

```sh
node scripts/validate-root-toolchain.mjs
node scripts/generate-antigravity-docs.mjs --check
node scripts/generate-antigravity-score.mjs --check
node scripts/validate-antigravity-distribution.mjs
```

The final command stages disposable copies and validates them; it does not establish that Antigravity loaded a live installation.

## Documentation

- [English detailed guide](src/README.md)
- [한국어 상세 가이드](src/README.ko.md)
- [Experimental skills — English](docs/experimental-skills.md)
- [실험 스킬 — 한국어](docs/experimental-skills.ko.md)
- [Evidence-backed scorecard](docs/scorecard.md)

## License

[MIT](LICENSE.md)

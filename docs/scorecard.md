# LAZYANTIGRAVITY evidence-backed scorecard

**Evidence-backed score: 80 / 100**

**Evidence mode: `frozen-checked-in`.** This is a checked-in snapshot derived from source evidence digest `d251873eb01eb1fc4a5b04b92a2ffa1adbad7bb2d6f7bcc282b6533f997fe725`; it does not claim that ignored local receipts are present or fresh in this checkout. In a release workspace where `.omo/evidence` is present, the generator revalidates final receipt freshness and exact current subjects before accepting these values.

Real SQLite, GitHub-hosted matrix execution, CLI live install/list, and IDE live inspection are unavailable in the source evidence and earn 0. Local substitutes do not earn those points.

| Category | Item | Score | Status | Evidence result |
|---|---|---:|---|---|
| contracts | manifest | 5 / 5 | passed | passed in source evidence snapshot |
| contracts | hooks | 5 / 5 | passed | passed in source evidence snapshot |
| contracts | ide-layout | 5 / 5 | passed | passed in source evidence snapshot |
| contracts | cli-layout | 5 / 5 | passed | passed in source evidence snapshot |
| runtime | context | 5 / 5 | passed | passed in source evidence snapshot |
| runtime | stop | 5 / 5 | passed | passed in source evidence snapshot |
| runtime | offline-defaults | 5 / 5 | passed | passed in source evidence snapshot |
| mcp-database | lifecycle | 5 / 5 | passed | passed in source evidence snapshot |
| mcp-database | path-portability | 5 / 5 | passed | passed in source evidence snapshot |
| mcp-database | sqlite-safe-readonly | 0 / 10 | unavailable | exact capability receipt status is unavailable |
| skills | exact-core | 5 / 5 | passed | passed in source evidence snapshot |
| skills | metadata-references | 5 / 5 | passed | passed in source evidence snapshot |
| skills | workflow-lsp | 5 / 5 | passed | passed in source evidence snapshot |
| distribution | no-install | 5 / 5 | passed | passed in source evidence snapshot |
| distribution | snapshot-stage | 5 / 5 | passed | passed in source evidence snapshot |
| distribution | hosted-matrix | 0 / 5 | unavailable | no fresh passed GitHub-hosted Ubuntu/Windows Node 20/22 and Ubuntu SQLite receipt |
| evidence-docs | freshness | 5 / 5 | passed | passed in source evidence snapshot |
| evidence-docs | bilingual-truth | 5 / 5 | passed | passed in source evidence snapshot |
| live | cli-install-list-live | 0 / 3 | unavailable | agy binary unavailable; no live install/list receipt |
| live | ide-live | 0 / 2 | unavailable | pinned noninteractive IDE inspection contract unavailable |

## Usability verdict

**Usable for local evaluation and staged process verification, not proven for live installation or production deployment.** The 15 active skills, 2 official hooks, and 3 local MCP servers were exercised in staged layouts. Four layouts were byte-identical, but IDE rule parity remains unverified.

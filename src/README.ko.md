# LAZYANTIGRAVITY — 검증 범위 안내

[메인 README](../README.md) · [English](README.md) · [점수표](../docs/scorecard.md)

## 현재 활성 범위

체크인된 카탈로그에는 15 active skills가 있습니다: `ast-grep`, `debugging`, `frontend-ui-ux`, `git-master`, `init-deep`, `lsp`, `lsp-setup`, `programming`, `review-work`, `rules`, `start-work`, `ulw`, `ulw-loop`, `ulw-plan`, `visual-qa`. 패키지는 2 official hooks(`PreInvocation`, `Stop`)와 3 local MCP servers(`database`, `git-bash`, `lsp`)를 등록합니다. Node.js >=20.17이 필요합니다.

[19 experimental skills](../docs/experimental-skills.ko.md)는 IDE와 CLI에서 모두 unsupported 상태입니다. 체크인된 fixture를 먼저 포팅하고 변경한 다음 새로운 검증 증거를 만들기 전에는 Antigravity 경로로 복사하면 안 됩니다.

## 실제 검증 범위

일회성 staged validator가 바이트가 같은 4개 레이아웃을 만들고 실제 hook/MCP 프로세스를 실행했습니다. four staged layouts에 대한 rule parity remains unverified입니다. CLI/IDE live loading은 unavailable이고, hosted execution에는 fresh receipt가 없으며, real SQLite도 unavailable이었습니다.

## 로컬 재현

```sh
node scripts/validate-root-toolchain.mjs
node scripts/generate-antigravity-docs.mjs --check
node scripts/generate-antigravity-score.mjs --check
node scripts/validate-antigravity-distribution.mjs
```

신뢰하지 않는 변경을 검토할 때는 격리된 복사본에서 실행하십시오. staged validator는 임시 위치를 사용하고 정리 결과를 보고하지만 live install 명령은 아닙니다.

## 사용성 결론

현재는 로컬 평가와 staged process verification 용도로 사용할 수 있습니다. CLI, IDE, hosted, SQLite의 fresh evidence가 생기기 전까지 live installation이나 production deployment가 입증되었다고 보면 안 됩니다.

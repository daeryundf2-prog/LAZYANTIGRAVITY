# 첨부 아이디어 검토 및 적용 결과

검토 기준은 현재 커밋 `b04d849d95c8b91c4012bde2b66323d9a0ed9ab4`와 첨부된 `pasted_content.txt`입니다. 첨부 내용에는 유용한 하네스 방향과 함께, 검증되지 않은 모델 성능 단정 및 운영상 위험한 제안이 혼재되어 있습니다.

## 결론

모델 이름이나 자신감 있는 프롬프트를 신뢰하는 방식은 적용하지 않았습니다. **모델은 Claim을 제출할 뿐이고, Host가 실제 파일·명령·workspace 상태를 검증한 경우에만 완료를 승인한다**는 원칙을 유지했습니다.

| 첨부 제안 | 판정 | 현재 적용 결과 |
|---|---|---|
| AWT/ATT 궤도 트리밍 | 조건부 적용 | 완료 경로에서 실제 변경 파일과 attested 파일 목록을 대조하고, repository 밖 경로를 차단합니다. 의미론적 drift 판단은 모델에게 맡기지 않습니다. |
| 전지적 모드 프롬프트 | 거부 | 모델의 확신을 높이는 지침은 환각의 신뢰도만 높일 수 있습니다. Evidence Contract와 Host-side 검증을 사용합니다. |
| 메타 발언 문자열 kill switch | 거부 | 특정 문구를 중단하는 방식은 오탐·우회를 유발하며 사실성 검증이 아닙니다. |
| self-audit 후 git reset | 제한적 대체 | 자동 reset은 데이터 손실 위험이 있으므로 사용하지 않습니다. 실제 ledger·snapshot·dirty-tree guard와 명시적 복구 절차를 사용합니다. |
| Behavioral Interface | 부분 적용 | tool allowlist, schema validation, path sandbox, 실제 실행 결과 검증을 우선합니다. AST 도구는 별도 안전 경계 안에서만 사용합니다. |
| 3-tier model routing | 보류 | 모델 ID를 신뢰 경계에 하드코딩하지 않고 capability probe와 canonical envelope을 먼저 도입해야 합니다. 모델 성능·가격·가용성 단정은 근거가 필요합니다. |
| instruction truncation guard | 보류/추가 과제 | Antigravity host가 실제 주입 토큰 수와 truncation 상태를 제공하지 않는 한 100% 주입을 주장할 수 없습니다. 현재는 핵심 완료 판단을 프롬프트에 의존하지 않습니다. |

## 구현된 안전장치

`checkpoint-verification.ts`는 `quality_gate.completed`를 기록하기 전에 `evidence-completion-gate.ts`를 호출합니다. 이 gate는 strict Evidence Contract를 파싱하고, `readRanges`, `fileChecksums`, `commandsRun`, `commandAudits`를 필수로 요구하며, Host completion claim의 파일 목록이 attested 목록에 포함되는지 확인합니다.

`evidence-verifier.ts`는 실제 디스크 파일 존재 여부와 SHA-256, line range, command audit의 exit code를 확인합니다. 절대경로를 포함한 evidence 경로가 repository root 밖으로 나가면 차단합니다. 실패한 명령, 누락된 command audit, 조작된 hash는 completion으로 승격되지 않습니다.

`active-learning`은 기본적으로 analyze-only입니다. `approve === true`와 evidence JSON이 함께 제공되지 않으면 memory에 아무것도 승격하지 않습니다. 승격 시에는 verified status, gap 없는 evidence, 실제 파일 hash, command audit, workspace fingerprint, source가 필요하며 provenance를 fact record에 보존합니다.

## 검증 결과

다음 검증을 통과한 상태에서 문서가 추가되었습니다.

- `npm run check`
- `npx vitest --run components/ulw-loop/test/checkpoint.test.ts`: 35/35
- `npm --prefix components/active-learning test`: 2/2
- `node --test test/p0-p1-security.integration.test.mjs`
- `git diff --check`

## 남은 운영 과제

모델 교체에 더 강하게 대응하려면 Antigravity host payload를 canonical execution envelope으로 변환하는 단일 adapter, capability probe, provider contract matrix, tool invocation replay 방지, daemon token 인증을 추가해야 합니다. 이 과제들은 첨부 문서의 모델 성능 주장과 분리하여 구현해야 하며, 특정 Gemini 버전의 우수성을 전제로 해서는 안 됩니다.

특히 “Gemini 3.7 Flash가 항상 더 집중력이 높다”, “다른 모델은 특정 문구를 내며 무한 루프에 빠진다”와 같은 문장은 이 저장소의 실행 로그만으로 입증되지 않으므로 보안 정책이나 라우팅 정책의 근거로 사용하지 않았습니다.

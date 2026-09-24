# CHARTER — LAZYANTIGRAVITY

## Role
Orchestration plane — 에이전트 오케스트레이션, 워크스페이스 메모리, 훅 파이프라인.

## Do
- 서브에이전트 디스패치·훅·MCP 도구 노출
- 워크스페이스 상태·세션 기억 관리
- 리서치 채널(네트워크 옵트인) — **증거 채증 아님**

## Don't
- 증거 수집/보존 주장 금지 (evidence plane 소관: rapid/frametrace/lazyforensic)
- 외부 프록시(r.jina.ai 등) 출력물을 증거·인용 원본으로 사용 금지
- 무자격 "verified"/"fail-closed" 표현 금지 — `lazy-contracts/trust-levels.md` 준수

## Contracts
- Consumes: —
- Produces: 리서치 메모, 오케스트레이션 이벤트 (lazy-evidence-case-v1 준수 시)
- Vendored: `contracts/` (lazy-contracts, hash-pinned)

## Claims allowed
`observed`, `heuristic`, `model-assisted`(limitations 필수) — `verified` 계열은 검증기 실행 증거가 있을 때만.

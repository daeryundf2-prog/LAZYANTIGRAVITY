# active-learning


## How it works (from the former active-learning skill)

# Active-Learning: Telemetry-Driven Rule Evolution & Self-Healing Policy

에이전트가 반복적으로 겪는 실패 패턴(도구 인자 오류, 비동기 타임아웃, 타입 컴파일 에러)을 `.lazyantigravity/telemetry/`에서 능동 학습하여, `facts.jsonl`에 `⚠️ [AUTO-LEARNED GOTCHA]` 규칙으로 자동 승격하고 후속 세션에 선제적으로 적용하는 자가 진화 스킬입니다.

```mermaid
flowchart TD
    Run["에이전트 실행 및 도구/테스트 호출"] --> Tel["텔레메트리 실패 이벤트 수집<br/>(.lazyantigravity/telemetry/events.jsonl)"]
    Tel --> Clust["에러 시그니처 클러스터링 & 신뢰도 산정<br/>(extractFailurePatterns)"]
    Clust --> Eval{"신뢰도 >= 70% & 2회 이상 반복?"}
    Eval -- "Yes" --> Promo["Auto-Promote to facts.jsonl<br/>(⚠️ [자가학습 Gotcha])"]
    Eval -- "No" --> Retain["추가 관측 대기"]
    Promo --> Context["다음 세션 System Prompt 자동 주입"]
```

---

## CLI Commands

```bash
# 1. 텔레메트리 실패 패턴 분석
node ~/.gemini/config/plugins/lazyantigravity/components/active-learning/dist/cli.js analyze

# 2. Gotcha 규칙 자동 승격 및 메모리 동기화
node ~/.gemini/config/plugins/lazyantigravity/components/active-learning/dist/cli.js evolve
```

---
name: flaky-guard
description: "간헐적 실패(Flaky) 테스트 자가 치유 스킬. Gemini 3.7 Flash 초고속 병렬 스트레스 런으로 비동기 레이스/타이밍 결함을 포착하고 결정론적 테스트로 하드닝합니다."
---

# Flaky-Guard: Self-Healing Non-Deterministic Test Hardener

Gemini 3.7 Flash의 초저지연 병렬 실행력을 활용하여 테스트 스위트를 10~20회 고속 병렬 스트레스 런(Stress Run)하고, 비동기 타이밍 의존성(`setTimeout`, microtask 미대기, 포트 경합)으로 인해 간헐적으로 실패하는 Flaky Test를 자동으로 포착하여 결정론적(Deterministic) 구조로 자가 치유하는 스킬입니다.

```mermaid
flowchart TD
    Target["테스트 대상 파일 / 스위트"] --> Stress["1. 고속 병렬 스트레스 런<br/>(10~20회 연속 동시 실행)"]
    Stress --> Catch{"간헐적 실패 발생?"}
    Catch -- "No (10/10 PASS)" --> Green["안정적 테스트 확인"]
    Catch -- "Yes (간헐적 FAIL 발견)" --> Isolate["2. 비동기 레이스 원인 격리 (Model: 'flash')<br/>타이밍 의존성, 락 경합, 미대기 프로미스"]
    Isolate --> Refactor["3. 결정론적 불변식 리팩토링<br/>Eventual Consistency / Polling Invariant"]
    Refactor --> ReStress["4. 재검증 스트레스 런 (20/20 PASS)"]
    ReStress --> Done["5. 영구 안정화 완료"]
```

---

## 4-Step Flaky-Guard Workflow

### Step 1: Parallel Stress Runner (병렬 스트레스 런)
동일 테스트를 고속으로 반복 실행하여 간헐적 실패를 재현합니다.

```bash
# 예시: 10회 연속 병렬 실행으로 Flakiness 포착
for i in {1..10}; do npm test -- --runInBand || echo "FAIL at run $i"; done
```

### Step 2: Flakiness Root-Cause Isolation (원인 격리)
`Model: "flash"`를 사용하여 실패 로그와 타이밍 트레이스를 분석합니다.

```
invoke_subagent(
  Subagents=[
    {
      TypeName: "self",
      Role: "Flaky Test Diagnostician",
      Model: "flash",
      Prompt: """TASK: Analyze intermittent test failure logs and identify timing race conditions.
CHECKLIST:
1. Arbitrary sleep/delay (setTimeout / time.sleep) vs deterministic event listeners
2. Shared global state / uncleaned DB records across test cases
3. Unawaited microtasks / floating Promises
4. Port / filesystem resource contention

DELIVERABLE: root cause analysis and deterministic replacement diff."""
    }
  ],
  toolAction: "Diagnosing flaky test timing hazards",
  toolSummary: "Flaky test diagnosis"
)
```

### Step 3: Deterministic Hardening (결정론적 리팩토링)
임의의 시간 지연(`setTimeout(100)`)을 조건부 폴링 또는 이벤트 완료 대기(Eventual Invariant)로 수정합니다.

### Step 4: Verification Stress Gate (재검증 20회 패스)
수정 후 20회 연속 실행에서 단 1건의 실패도 없음(`20/20 PASS`)을 확인하고 완료합니다.

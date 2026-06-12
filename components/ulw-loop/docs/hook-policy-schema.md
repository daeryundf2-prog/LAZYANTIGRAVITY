# Hook Policy Schema Design

이 문서는 Ouroboros의 플러그인 훅 권한 제어(Fail-Open vs Fail-Closed) 개념을 LazyAntigravity의 `hooks.json`에 통합하기 위한 설계안입니다.

## 1. 개요
현재 LazyAntigravity의 `hooks.json`은 도구 사용 전/후에 정규식 매칭을 통해 외부 명령(스크립트)을 실행합니다. 하지만 어떤 훅이 실패했을 때 에이전트의 전체 루프를 중단시킬지, 아니면 단순 경고만 남기고 계속 진행할지에 대한 구분이 없습니다.
이를 해결하기 위해 훅별로 명시적인 `policy`를 정의합니다.

## 2. Policy Schema 정의

`hooks.json`의 각 훅 항목에 `policy` 필드를 추가합니다.

```typescript
type HookPolicy = "FAIL_OPEN" | "FAIL_CLOSED" | "FAIL_SAFE" | "HITL_REQUIRED";

interface HookConfig {
  name: string;
  trigger: string;       // Regex pattern (e.g., "^(write|apply_patch)$")
  event: string;         // Lifecycle event (e.g., "PostToolUse")
  command: string;       // CLI Command to execute
  policy: HookPolicy;    // NEW: Execution failure policy
}
```

### 2.1 정책별 동작 (Semantics)

1. **FAIL_OPEN (관측/로깅 전용)**
   - **의미**: 훅 실행 중 오류(비정상 종료 코드, 타임아웃)가 발생하더라도 메인 에이전트의 실행 흐름을 차단하지 않습니다.
   - **적용 대상**: Telemetry, 단순 로깅, 통계 수집 훅 등.
   - **조치**: 오류 내용을 콘솔에 경고(Warning)로만 출력하고 상태는 정상 진행.

2. **FAIL_CLOSED (정책 강제/차단)**
   - **의미**: 훅 실행 중 오류가 발생하면, 메인 에이전트의 실행을 즉각 중단하고 오류를 반환(Throw Error)합니다.
   - **적용 대상**: 권한 검사, 보안 필터링(Security Model), 중요 린트/빌드 검증 훅 등.
   - **조치**: 오류 내용을 반환하여 에이전트가 후속 조치를 취하지 못하도록 방어.

3. **FAIL_SAFE (폴백/복구)**
   - **의미**: 훅 실패 시 미리 정의된 안전한 기본값(Safe Default)을 반환하거나, 에이전트에게 경고 메시지를 주입하여 에이전트 스스로 복구하도록 유도합니다.
   - **적용 대상**: 외부 API 조회, 보조 데이터 풍부화 훅 등.

4. **HITL_REQUIRED (사용자 승인 대기)**
   - **의미**: 훅이 실행된 후 결과에 관계없이 무조건 사용자의 승인(Human In The Loop)이 떨어질 때까지 실행을 정지합니다.
   - **적용 대상**: 고위험 명령어(`spawn`, `delete` 등), 비용 발생 트리거.

## 3. 구현 마일스톤 (추후 적용)
1. `hooks.json` 파일에 모든 기존 훅에 대해 기본값 `"policy": "FAIL_CLOSED"` (또는 성격에 따라 `FAIL_OPEN`) 부여.
2. Hook Runner (`codex-hook.ts` 등) 로직을 수정하여 `policy`에 따라 `try-catch` 및 예외 전파 방식 분기 처리.
3. 훅 실패 이벤트(`hook.failed`)를 Ledger에 기록하여 파이프라인에서 추적 가능하도록 구성.

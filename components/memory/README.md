# memory


## How it works (from the former active-memory skill)

# Active-Memory: Local Working Memory & Facts Persistence

Antigravity 세션 간에 프로젝트의 중요한 컨벤션, 빌드 트릭, 아키텍처 제약 사항, 발견된 결함/함정(Gotcha)을 `.lazyantigravity/memory/facts.jsonl` (또는 `.omo/memory/facts.jsonl`)에 안전하게 기록하고 다음 세션 시작 시 자동으로 시스템 프롬프트에 주입하는 스킬입니다.

```mermaid
flowchart LR
    Session["Antigravity 세션 작업"] --> Learn["중요 규칙 / 함정 발견"]
    Learn --> Remember["facts.jsonl 기록<br/>(Deduplicated JSONL)"]
    Remember --> NextSession["다음 세션 SessionStart 훅"]
    NextSession --> Inject["<project-active-memory><br/>자동 주입"]
```

---

## 사용법 (Usage)

### 1. 사실(Fact) 및 제약 사항 수동 기억하기
사용자가 특정 규칙을 항상 기억하길 원하거나, 에이전트가 중요한 프로젝트 함정을 학습했을 때:

```bash
node ~/.gemini/config/plugins/lazyantigravity/components/memory/dist/cli.js remember "이 프로젝트는 Jest 대신 vitest를 사용해야 합니다."
```

### 2. 저장된 메모리 목록 확인
```bash
node ~/.gemini/config/plugins/lazyantigravity/components/memory/dist/cli.js list
```

### 3. 카테고리 분류
- `📌 [FACT]`: 빌드 도구, 패키지 매니저, 디렉터리 구조 등 객관적 사실.
- `⚠️ [GOTCHA]`: 특정 함수/API 사용 시 주의해야 할 비동기 레이스나 런타임 제약.
- `⭐ [PREFERENCE]`: 사용자가 선호하는 코드 스타일 및 네이밍 규칙.

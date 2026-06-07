<div align="center">
  <img src=".github/assets/lazyantigravity_banner.png" alt="LazyAntigravity Banner" width="640">

  <h1>LazyAntigravity</h1>

  <p><strong>The ultimate agent harness for complex codebases inside Google Antigravity.</strong><br />
  Project memory, planning, execution, and verified completion using Google Antigravity subagents.</p>

  <p>
    <a href="#-install">Install</a>
    ·
    <a href="#-workflows--slash-commands">Slash Commands</a>
    ·
    <a href="#-role-routing--model-recommendations">Role Routing</a>
    ·
    <a href="#-token--quota-safety">Quota Safety</a>
  </p>

  <br />
</div>

<hr />

> [!NOTE]
> **LAZYANTIGRAVITY**는 Google Antigravity 플랫폼용 에이전트 하네스 플러그인 패키지입니다.
> 
> 복잡한 코드베이스 분석, 다중 에이전트 자율 협업, 엄격한 품질 게이트 제어 및 모델 쿼터 초과 방지 설계를 Antigravity의 `invoke_subagent` 플로우에 최적화하여 제공합니다.

---

## 🚀 Install

한 줄의 명령어로 플러그인 컴포넌트를 빌드하고 Google Antigravity 환경에 배포합니다:
```bash
node bin/lazyantigravity.js install
```
이 스크립트는 모든 컴포넌트(`ulw-loop`, `lsp`, `rules` 등)를 빌드하고, 사용자 프로필 디렉터리(`~/.gemini/config/plugins/lazyantigravity`)에 최신 바이너리와 스킬 파일을 자동 복사합니다.

---

## ⚡ Workflows & Slash Commands

LazyAntigravity를 설치하면 Antigravity UI 내에서 아래의 전용 슬래시 명령어를 즉시 사용할 수 있습니다.

### 1. `/ulw <task>` (또는 `/ulw-loop <task>`)
- 복잡하고 긴 실행이 필요한 태스크를 수행할 때 사용하는 핵심 자율 워크플로우 루프입니다.
- **자율 역할 분해(Role Routing)**를 수행하여 Planner ➡️ Researcher ➡️ Worker ➡️ Verifier ➡️ Finalizer로 이어지는 작업을 하위 에이전트들을 통해 자율적으로 처리합니다.
- 모든 서브에이전트는 현재 사용자가 UI에서 선택한 모델을 상속(`MODEL_TIER_INHERIT`)하여 실행됩니다.

### 2. `/init-deep`
- 디렉터리 구조를 계층적으로 스캔하여 `AGENTS.md`라는 컨텍스트 랜드마크를 생성합니다.
- 에이전트가 넓은 폴더 구조에서 길을 잃지 않고 코드 근처에 마련된 가이드라인을 스스로 참고하여 고품질의 작업을 할 수 있게 합니다.

### 3. CLI 명령어 및 안전 복구 (`omo ulw-loop`)
에이전트가 백그라운드에서 오류를 제어하고 수동으로 상태를 관리하기 위한 CLI 도구를 내장하고 있습니다:
```bash
# 현재 작업 흐름의 쿼터 제한 도달 시 상태 체크포인트 저장
omo ulw-loop save-role-checkpoint --task-id <id> --platform Antigravity --selected-model <model> --completed-roles <roles> --current-role <role> --next-recommended-action <action> --resume-command <cmd>

# 체크포인트로부터 쿼터 리프레시 후 흐름 안전 복구
omo ulw-loop resume
```

---

## 🤖 Role Routing & Model Recommendations

Antigravity는 모델의 API 수준 자동 전환을 지원하지 않기 때문에, LazyAntigravity는 자율 역할 분해와 최적의 쿼터 맞춤형 모델 제안 가이드를 노출합니다.

### 1. 하위 에이전트 역할 구조
에이전트가 `/ulw` 워크플로우를 받으면 다음과 같이 하위 역할을 설계하여 작업을 분담합니다:

| 역할 (Role) | Antigravity Subagent 구동 명령어 | 역할 및 목적 |
|---|---|---|
| **planner** | `invoke_subagent(TypeName: "self", Role: "Prometheus Planner")` | 요구사항 분석, 구현 체크리스트 및 검증 계획 설계 |
| **researcher** | `invoke_subagent(TypeName: "research", Role: "Codebase Researcher")` | 관련 소스 코드 파일 탐색 및 의존성 관계 분석 |
| **worker** | `invoke_subagent(TypeName: "self", Role: "Hephaestus Worker")` | 실제 소스 코드 수정, 유닛 테스트 작성 및 에러 수정 |
| **verifier** | `invoke_subagent(TypeName: "self", Role: "Oracle Reviewer")` | Diff 분석, 품질 게이트(Quality Gate) 및 Lint 검사 수행 |
| **finalizer** | Parent Agent 실행 영역 | 잔여 임시 파일 정리, 깃 커밋 작성 및 최종 증거 기록 |

### 2. 쿼터 맞춤 가이드라인 (Session-once)
세션 시작 시 가용 모델 상황에 맞춰 최적의 드롭다운 선택안을 제안합니다:
- **충분한 Claude 쿼터 보유 시**: `Claude Opus 4.6 (Thinking)`
- **Claude 쿼터 제한 시**: `Gemini 3.1 Pro (High)`
- **대규모 코드 탐색 중심 작업 시**: `Gemini 3.5 Flash (High)`
- **신속한 반복 구현 작업 시**: `Gemini 3.5 Flash (Medium)`

---

## 🛡️ Token & Quota Safety

API 호출 쿼터 또는 토큰 소진 상황에서도 작업 내용이 유실되지 않도록 3중 방어막이 구현되어 있습니다.

### 1. Safe-Resume 체크포인트
- 오류 발생 시 `save-role-checkpoint`를 트리거하여 완료된 역할과 파일 변경 내역을 `.lazycodex/checkpoints/` 하위에 백업한 뒤 실행을 안전하게 멈춥니다.
- 사용자가 UI 드롭다운에서 모델을 변경한 후 `/ulw resume`을 통해 중복 소모 없이 재개할 수 있습니다.
- **수동 전환 권장 시나리오**:
  - **Claude Opus 제한 시**: `Gemini 3.1 Pro (High)` ➡️ `Claude Sonnet 4.6 (Thinking) (Sonnet 쿼터 존재 시)` ➡️ `Gemini 3.5 Flash (High)`
  - **Claude Sonnet 제한 시**: `Gemini 3.1 Pro (High)` ➡️ `Gemini 3.5 Flash (High)`
  - **Gemini Pro 제한 시**: `Gemini 3.5 Flash (High)` ➡️ `Gemini 3.5 Flash (Medium)`
  - **모든 모델 소진 시**: 갱신 시간까지 대기하거나 사용자가 원할 경우 계정 설정의 `AI Credit Overages`를 켜도록 안내합니다 (에이전트가 자동 활성화하지 않음).

### 2. Compact Mode (컨텍스트 절약)
- `context_window_exceeded` 상황이 감지되면 소스 코드의 전체 파일을 읽지 않고, 수정 대상이 되는 코드 범위의 slices만 파싱하여 주입합니다.
- 서브에이전트 출력 글자수를 핵심 요약본(20~40줄)으로 축소하며, 대규모 정보 아티팩트는 로컬 파일에 보관하고 본문에는 경로 링크만 연결하여 토큰 소모를 극적으로 절약합니다.

### 3. Batch Mode (출력 토큰 제한 극복)
- 코드 수정량이 출력 한도를 넘어설 것으로 예상되는 경우, 여러 개의 패치 배치(patch batch) 단위로 수정 작업을 쪼개어 단계적으로 수정 및 유효성 검증을 밟아 나갑니다.

---

## 👷 Maintainer & Homage

- **LazyAntigravity**는 Google Antigravity 플러그인 호환성 및 에이전트 자율성 유지를 위해 **Yeongyu Kim**에 의해 유지보수 및 빌드됩니다.
- 본 프로젝트는 [lazycodex.ai](https://lazycodex.ai)의 아이디어와 [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) 에이전트의 엄격한 품질 지율에 깊은 존경을 보냅니다.

## 📄 License

MIT License

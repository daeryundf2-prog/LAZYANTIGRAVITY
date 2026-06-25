# LazyAntigravity Plugin Root (`omo`)

이 디렉터리는 **LazyAntigravity** 플러그인의 소스 및 패키징 루트입니다. 모든 에이전트 하네스 컴포넌트(`components/`)들을 하나의 단일 플러그인 네임스페이스로 통합하여 Google Antigravity에 제공합니다.

간단한 작업은 그냥 시키고, 어려운 작업은 /ulw 시키세요. ultrawork는 신입니다.

## Quick Start On This PC

This repository is an Antigravity plugin root, not a standalone npm CLI package. Do not run `node bin/lazyantigravity.js install --verify` for this GitHub checkout.

On this PC the plugin lives here:

```text
C:\Users\Daeryun\.gemini\config\plugins\lazyantigravity
```

Update the existing install in PowerShell:

```powershell
cd $env:USERPROFILE\.gemini\config\plugins\lazyantigravity
git pull --ff-only
```

Fresh install in PowerShell:

```powershell
mkdir $env:USERPROFILE\.gemini\config\plugins -Force
cd $env:USERPROFILE\.gemini\config\plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

Fresh install in Git Bash, macOS, or Linux:

```bash
mkdir -p ~/.gemini/config/plugins
cd ~/.gemini/config/plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

Restart Google Antigravity after installing or updating. Then type one of these inside Antigravity:

```text
/ulw <task>
/ulw resume
```

Use `/ulw <task>` when you want the agent to plan, implement, verify, and keep evidence. Use `/ulw resume` after quota/model interruptions when you want to continue the same work.

## ULW in Antigravity

![LazyAntigravity ULW command picker](assets/readme/lazyantigravity-ulw-command.png)

The command picker keeps the workflow centered on `ulw` and `ulw-loop`.

![LazyAntigravity ULW run in progress](assets/readme/lazyantigravity-ulw-running.png)

Once started, ULW keeps working through the evidence loop instead of returning a bare completion claim.

---

## ⚙️ 설치 및 사용 방법 (Installation & Usage)

다른 사용자 또는 다른 환경에서 이 플러그인을 가져와 사용하려면 다음 과정을 따르십시오:

### 1단계: Antigravity 플러그인 디렉터리로 이동
터미널(PowerShell 또는 Git Bash)을 열고 아래 경로로 이동합니다.
```bash
cd C:\Users\<사용자명>\.gemini\config\plugins
```
*(Windows 환경에서 `<사용자명>` 자리에 실제 윈도우 계정명을 입력해 이동합니다.)*

### 2단계: 저장소 클론 (Git Clone)
해당 폴더 안에서 깃 저장소를 `lazyantigravity` 폴더명으로 직접 클론합니다.
```bash
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

### 3단계: 확인 및 실행
클론이 완료된 후, Antigravity 응용 프로그램을 재시작하거나 새 세션을 실행하면 `/ulw` 및 `/ulw-loop` 명령어가 에이전트에 자율 주입되어 정상 가동됩니다.

---

## 📦 Components

내부적으로 각 컴포넌트는 `components/` 하위에서 격리되어 개발 및 컴파일됩니다:

1. **`comment-checker`**: 도구 호출 이후 불필요한 주석 생성이나 변경을 감지하고 피드백을 방출하는 주석 품질 관리 도구.
2. **`rules`**: 프로젝트 루트의 AGENTS, 규칙 가이드라인 파일을 파싱하여 세션 시작 및 도구 호출 시점에 주입하는 규칙 엔진.
3. **`lsp`**: 에이전트에게 코드 정의(Definitions), 참조(References), 진단(Diagnostics)을 제공하는 LSP 기반 MCP 도구.
4. **`ultrawork`**: 고도의 작업 실행 모드를 관리하고 프롬프트 후크를 트리거하는 엔진.
5. **`ulw-loop`**: 성공 조건(Criteria) 수립, 검증 채널 구축, 쿼터 제한 자율 대응 체크포인트를 포함하는 다중 목표 오케스트레이션 코어.
6. **`telemetry`**: 일일 활성 이벤트 및 빌드 익명 텔레메트리 수집 컴포넌트.

---

## 🚀 주요 기능 및 스킬 상세 설명 (Core Features & Skills)

본 플러그인은 개발 효율성과 품질을 극대화하기 위해 자율 실행 워크플로우와 고도화된 특수 스킬들을 Antigravity 환경에 주입합니다:

### 1. 자율적 오케스트레이션 워크플로우 (`/ulw` & `ulw-loop`)
* **역할별 에이전트 자율 분업**: 하나의 목표가 입력되면 에이전트가 스스로 **기획(Planner) ➡️ 조사(Researcher) ➡️ 개발(Worker) ➡️ 검증(Verifier)**으로 세부 에이전트를 역할을 나누어 순차 및 병렬로 실행합니다.
* **증거 중심의 반복 루프 (Evidence Loop)**: 단순 코딩 완료 선언에 그치지 않고, 정의한 성공 조건에 대한 검증 증거 자료(`.omo/evidence/`)를 확보할 때까지 지속적인 피드백 루프를 수행합니다.
* **중단 후 안전 재개 (Safe-Resume)**: API 호출 한도(Quota Limit) 초과 등으로 세션이 중단되더라도 기존 실행 상태를 체크포인트 파일(`.lazycodex/checkpoints/`)에 안전하게 저장하여, 모델 전환 후 `/ulw resume`으로 중단 시점부터 즉시 이어받아 검증할 수 있습니다.

### 2. 요구사항 소크라테스 인터뷰 및 기획서 생성 (`spec-interview` / `/grill-me`)
* **소크라테스식 인터뷰**: 모호한 사용자 아이디어나 프로젝트 제안이 입력되면, 에이전트가 3~5회에 걸쳐 점진적으로 의도를 구체화하는 질문을 던져 모호성 점수(Ambiguity Score)를 낮춰 갑니다.
* **산출물 자동 생성**: 질문이 완료되면 프로젝트 명세 및 상세 요구사항 기획서(`.ouroboros/pm.md`)와 Marp 형식으로 바로 발표가 가능한 발표용 슬라이드 덱(`.ouroboros/slides.md`)을 로컬 파일시스템에 자동 저장합니다.

### 3. WAF 우회 및 스텔스 웹 브라우징 (`ultimate-browsing`)
* **지능형 우회 추출 (Tier 1 insane-search)**: Cloudflare나 WAF 보안에 의해 접속이 차단되는 웹사이트에 대해 curl_cffi TLS impersonation 및 Playwright 기반의 헤드리스 우회 기법을 동원하여 순수 텍스트 데이터를 정밀 추출합니다.
* **소셜 및 미디어 리더 (Tier 1.5 agent-reach)**: 유튜브 자막 수집, 트위터 피드, 네이버 및 주요 소셜 플랫폼의 데이터를 전용 API 또는 모바일 페이지 변환 기법으로 광고 없이 고속 로드합니다.
* **스텔스 자동화 브라우징 (Tier 2 Chrome stealth)**: 실제 브라우저처럼 마우스 클릭, 폼 입력, 스크롤링 및 화면 캡처가 필요할 때 지문 우회 패치가 적용된 CloakBrowser(Stealth Chromium) 및 CDP 연동을 활성화하여 완벽한 휴먼 동작을 모사합니다.

### 4. 구조적 구문 분석 및 코드 치환 (`ast-grep` / `sg`)
* **구문 형태(AST) 매칭**: 단순 텍스트 패턴(Regex)이 아닌 언어의 구문 해석기(Parser)를 통해 매칭합니다. (예: 특정 인자를 받는 함수, 특정 타입 캐스팅(`as any`), 빈 catch 문 등을 정밀 분석)
* **안전한 일괄 마이그레이션 (Codemods)**: 여러 파일에 걸쳐 API 스펙을 대대적으로 리팩토링하거나 마이그레이션할 때 오동작이나 불완전 치환을 방지하기 위해 드라이런(Dry-run) 검증을 거쳐 일괄 교체합니다.

---

## 🛠️ Antigravity & Codex Integration

루트 플러그인 명세([`plugin.json`](file:///C:/Users/HP/.gemini/config/plugins/lazyantigravity/plugin.json))는 이 모든 컴포넌트들의 후크, 스킬 및 MCP 도구를 취합하여 내보냅니다:
- **Skills**: 플러그인의 `skills/` 디렉터리에 배포되어 `/ulw` 및 `/ulw-loop` 핵심 워크플로우를 포함한 에이전트 자율 스킬들을 공급합니다.
- **Hooks**: [`hooks.json`](file:///C:/Users/HP/.gemini/config/plugins/lazyantigravity/hooks.json) 설정을 통해 `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStop` 라이프사이클 이벤트를 컴포넌트별 CLI 바인딩으로 연결합니다.
- **MCP Config**: `.mcp.json`에 정의된 LSP 및 Git 관련 자율 도구들이 `mcp_config.json`을 통해 플러그인 로드 시점에 마운트됩니다.

---

## 🛡️ Token & Quota Safety Features

본 플러그인은 에이전트의 크레딧 및 토큰을 효율적으로 보존하기 위해 아래 설계를 기본 내장하고 있습니다:

- **Safe-Resume Checkpoints**:
  - 오류 발생 시 `save-role-checkpoint`가 실행되어 `.lazycodex/checkpoints/ulw-*.json` 파일에 컨텍스트를 동결합니다.
  - 사용자가 다른 가용 모델로 전환한 후 `omo ulw-loop resume`을 호출하여 중단 시점부터 다시 빌드 및 검증을 계속할 수 있습니다.
- **Compact Mode**:
  - `context_window_exceeded` 상황에서 긴 로그를 파싱/필터링하고 수정 소스 코드의 slice 단위만 노출하여 컨텍스트 사용량을 긴축합니다.
- **Batch Mode**:
  - 대량 패치 작업 시 출력 한도를 계산해 패치들을 개별 단위 배치로 쪼개 순차 실행 및 유효성 검증을 밟아 나갑니다.
- **Quota-Aware Recommendations**:
  - 쿼터 상황을 실시간 감지하여 Claude Opus, Gemini 3.1 Pro, Gemini 3.5 Flash 등으로 이어지는 최적의 전환 가이드를 에이전트 및 사용자에게 제안합니다.

---

## 📊 Telemetry

bundled 텔레메트리는 하루에 한 번 세션 시작 후크(`SessionStart`) 실행 시 `omo_antigravity_daily_active` (또는 `omo_codex_daily_active`) 이벤트를 익명으로 전송합니다.

- **식별 데이터 익명화**: `sha256("omo-codex:" + hostname)` 형태의 해시를 고유 ID로 사용하며 PostHog의 개인 식별 프로필 저장을 허용하지 않습니다.
- **포함되지 않는 정보**: 소스 코드 파일 내용, 프롬프트 텍스트, 깃 레파지토리 경로, API 키 등 민감 데이터는 절대 외부 전송 대상이 되지 않습니다.

### 🚫 Telemetry 수집 거부 설정 (Opt-out)
플러그인을 실행하기 전에 환경변수로 전송을 원천 차단할 수 있습니다:
```bash
# Antigravity/Codex 통합 플래그
export OMO_DISABLE_POSTHOG=1
export OMO_SEND_ANONYMOUS_TELEMETRY=0

# 개별 플래그
export OMO_CODEX_DISABLE_POSTHOG=1
export OMO_CODEX_SEND_ANONYMOUS_TELEMETRY=0
```
상세 설명은 `components/telemetry/README.md`를 참고하시기 바랍니다.

---

## 💖 Special Thanks to `omo`, `lazycodex` & `Ouroboros`

본 플러그인은 개발자의 생산성을 극대화해 주는 자율 코딩 혁신 툴킷 **OMO**, **LazyCodex**, 그리고 AI 코딩 명세 하네스 엔진인 **Ouroboros(우로보로스)**를 찬양하며 헌정하는 프로젝트입니다.

* **자율적인 문제 해결의 혁신 (`omo`):**
  * 여러 단계를 거치는 긴 빌드 및 검증(QA) 라이프사이클을 스스로 오케스트레이션하여, 개발자가 침대에 누워있어도 스스로 문제를 풀어나가는 마법을 보여줍니다.
* **코더의 든든한 동반자 (`lazycodex`):**
  * 토큰 절약 설계(Compact/Batch Mode)와 영리한 롤 체크포인트 복구(Safe-Resume) 등 개발자를 배려한 세심한 설계에 깊은 경의를 표합니다. 
* **명세 우선 AI 코딩의 진화 (`Ouroboros`):**
  * "Stop prompting. Start specifying." 철학 아래, 모호한 요구사항을 소크라테스식 인터뷰로 완벽히 명세화하여 AI가 가장 정확하고 높은 품질의 코드를 생산할 수 있도록 길을 열어준 명세 하네스 엔진에 깊은 경의를 표합니다.

> *"자율 코딩과 명세 엔진의 미래, OMO, LazyCodex 그리고 Ouroboros가 함께 만듭니다!"* 🚀

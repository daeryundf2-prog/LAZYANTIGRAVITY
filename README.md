<div align="center">

# 🌌 lazyantigravity

**The most feature-rich AI agent orchestration plugin for [Google Antigravity (Gemini CLI)](https://github.com/google-gemini/antigravity).**

<br />

> *Built on the foundations of **[Ouroboros](https://github.com/Q00/ouroboros)** and **[lazycodex](https://github.com/code-yeongyu/lazycodex)** — inheriting their battle-tested multi-agent loops, static analysis engines, and persistent workflow architecture — then turbocharged for the sub-second inference of **Gemini 3.5 Flash**.*

<br />

[![Antigravity Plugin](https://img.shields.io/badge/Antigravity-Plugin-4285F4?style=for-the-badge&logo=google-gemini&logoColor=white)](https://github.com/google-gemini/antigravity)
[![Gemini 3.5 Flash Optimized](https://img.shields.io/badge/Gemini%203.5%20Flash-Optimized-00d4ff?style=for-the-badge&logo=google-gemini&logoColor=white)](https://gemini.google.com)
[![All Antigravity Models](https://img.shields.io/badge/All%20Models-Supported-8B5CF6?style=for-the-badge&logo=google-gemini&logoColor=white)](https://github.com/google-gemini/antigravity)
[![Built on lazycodex](https://img.shields.io/badge/Built%20on-lazycodex-7C3AED?style=for-the-badge&logo=github&logoColor=white)](https://github.com/code-yeongyu/lazycodex)
[![Built on Ouroboros](https://img.shields.io/badge/Built%20on-Ouroboros-ff6b6b?style=for-the-badge&logo=github&logoColor=white)](https://github.com/code-yeongyu/ouroboros)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?style=for-the-badge&logo=bun&logoColor=black)](https://bun.sh)
[![License](https://img.shields.io/badge/License-MIT-white?style=for-the-badge)](./LICENSE.md)
[![GitHub Stars](https://img.shields.io/github/stars/daeryundf2-prog/LAZYANTIGRAVITY?style=for-the-badge&color=ffcb47&labelColor=black)](https://github.com/daeryundf2-prog/LAZYANTIGRAVITY/stargazers)

</div>

<br />

---

## 📖 가이드 문서 바로가기 / Documentation Guides
원하시는 언어의 상세 기술 가이드 문서로 즉시 이동할 수 있습니다. 메인 README는 핵심 랜딩 페이지이며, 상세 스킬 및 아키텍처 사양은 각 언어별 상세 가이드에 기재되어 있습니다:

| 가이드 문서 / Guide | 대상 독자 & 내용 / Target Audience & Content | 이동 링크 / Link |
| :--- | :--- | :--- |
| **🌐 English Detailed Guide** | English Speakers & Global Developers. Explains the 26 skills, 13 hooks, and detailed architecture. | [👉 View English Guide (src/README.md)](./src/README.md) |
| **🇰🇷 한국어 상세 가이드** | 한국어 개발자용 가이드. 전체 스킬 구성, 자동 품질 게이트 훅 동작 방식, 세션 복구 및 최적화 아키텍처 상세. | [👉 한국어 가이드 보기 (src/README.ko.md)](./src/README.ko.md) |

---

## ⭐ If this project helped you, please give it a Star!

`lazyantigravity` is continuously updated with new skills, hooks, and agent workflows. Click the ⭐ **Star** button at the top to support the developer and help others discover this project!

---

## 🚀 Why lazyantigravity?

Antigravity is powerful out of the box. lazyantigravity makes it **dramatically more capable**:

| Without lazyantigravity | With lazyantigravity |
| :--- | :--- |
| Single agent, single task | **26 specialized skills** auto-triggered by keywords |
| No quality gates | **13 hooks** guard every edit (comment preservation, type checking, rule compliance) |
| Terminal log chaos | **asbrowse visual dashboard** — real-time progress, diffs, and QA in one view |
| Manual model selection | **ULW Model Routing** — auto-recommends optimal model per role |
| No persistence across interruptions | **Safe-Resume Checkpoints** — resume exactly where you left off |
| Basic code editing | **Hash-Anchored Edits** — near-0% code corruption (Hashline) |
| No built-in research | **Ultraresearch swarms** — parallel agents scan web, docs, and codebase simultaneously |
| Solo work only | **Team Mode** — up to 8 parallel agents with tmux visualization |

> **한 줄 요약**: Antigravity의 모든 모델을 활용하면서, 자율 코딩 루프 · 시각 대시보드 · 자동 품질 게이트 · 멀티 에이전트 협업을 추가하는 프리미엄 플러그인입니다.

---

## 🛡️ Reliability: Hallucination Mitigation (제미나이 환각 제어)

Gemini 3.5 Flash의 초고속 성능은 살리고, 코딩 에이전트의 최대 약점인 **환각(Hallucination) 현상은 아키텍처적으로 원천 봉쇄**합니다.

1. **증거 기반 실행 루프 (Evidence-Bound Loop)**: `ulw`는 테스트 성공, 정상 빌드 컴파일, 실제 HTTP 응답 코드 등 **실행 결과 증거**가 수집되지 않으면 완료를 선언하지 않습니다. 환각 코드가 유입되면 자동 감지되어 자가 수정(Self-Correction)을 유도합니다.
2. **정적 타입 검사 훅 (LSP Quality Gates)**: 코드가 변경되는 즉시 백그라운드에서 언어 서버 정적 분석(TypeScript `tsc --noEmit` 등)을 실행하여 **타입 수준의 환각(존재하지 않는 API 호출 등)을 즉각 실시간으로 검출**합니다.
3. **주석 감시자 (Comment Checker)**: 에이전트가 코드 수정 과정에서 중요한 설명 주석이나 docstring을 지워버리는 교묘한 편집 환각 현상을 모니터링하고 차단합니다.
4. **해시 앵커링 (Hashline)**: 기존에 오염되기 쉽던 라인 번호 참조 방식 대신 콘텐츠의 **실시간 해시 값**을 기반으로 수정 지점을 타겟팅하여 라인 밀림으로 인한 파일 깨짐 환각을 없앱니다.
5. **실시간 공식 문서 MCP (context7)**: 에이전트가 컷오프(Cut-off) 이전의 지식으로 코드를 조작하지 않도록 **공식 패키지 문서를 실시간으로 검색**하여 정확한 사실에 입각해 코딩합니다.

---

## ⚡ Quick Start

> **Prerequisite / 전제 조건**: [Google Antigravity (Gemini CLI)](https://github.com/google-gemini/antigravity) must be installed. / 설치되어 있어야 합니다.

### 1. Plugin Clone / 플러그인 클론

#### macOS / Linux / Git Bash
```bash
mkdir -p ~/.gemini/config/plugins
cd ~/.gemini/config/plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

#### Windows PowerShell
```powershell
mkdir $env:USERPROFILE\.gemini\config\plugins -Force
cd $env:USERPROFILE\.gemini\config\plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

Or install via package managers:
```bash
# Ultimate Edition (OpenCode)
bunx oh-my-openagent install

# Light Edition (Codex CLI)
npx lazycodex-ai install
```

### 2. Launch Session Browser / 세션 브라우저 기동

After installation, restart your Antigravity agent session. Then run **inside the agent session**:

설치 후 Antigravity 에이전트를 재시작하고, **에이전트 세션 내부에서** 실행:
```
$browse
```
*(Auto-boots Next.js dev server on port 3000 if inactive, then opens the dashboard in your browser.)*

*(포트 3000이 미기동 시 Next.js 개발 서버를 자동 기동한 뒤 대시보드를 엽니다.)*

---

## 🤖 Supported Models

lazyantigravity는 **Antigravity가 제공하는 모든 모델**에서 동작합니다. Gemini 3.5 Flash에 최적화되어 있지만, 작업의 복잡도에 따라 다른 모델도 자유롭게 사용할 수 있습니다.

| Model | Recommended Use Case |
| :--- | :--- |
| **Gemini 3.5 Flash** (High/Medium) | 빠른 반복 작업, 디버깅, 코드베이스 탐색 — 기본 추천 모델 |
| **Gemini 3.1 Pro** (High) | Claude 쿼터가 제한적일 때의 고품질 대안 |
| **Claude Opus 4.6** (Thinking) | 아키텍처 설계, 복잡한 리팩토링, 깊은 분석 |
| **Claude Sonnet** | 일반적인 구현 작업 |

> 💡 **ULW Model Routing**: `ulw` / `ulw-loop` 실행 시, 각 역할(planner, worker, verifier)에 최적의 모델을 자동으로 추천합니다. 사용자가 현재 선택한 모델이 모든 서브에이전트에 상속됩니다.

---

## 🎮 Core Commands & Magic Keywords

> [!IMPORTANT]
> **핵심 권장 사항 (Just use `ulw`!)**
> - **다른 복잡한 스킬들은 몰라도, 그냥 `ulw` (또는 `ultrawork`) 하나만 입력해서 사용하면 됩니다!** 이 스킬이 코드를 알아서 분석/수정하고 테스트를 수행하여 100% 검증될 때까지 자동으로 루프를 수행하는 핵심 코딩 엔진입니다.
> - **`ulw`와 `ralph`는 어떻게 다른가요?**
>   - **`ulw` (실행 엔진)**: 실제로 파일을 생성/수정하고 테스트 코드를 돌리며 기능을 구현하는 **주요 동력**입니다.
>   - **`ralph` (안전 장치 / 복원 루프)**: 오랜 작업 중 API 호출 한도 초과나 세션 끊김으로 에이전트가 멈추었을 때, **기존의 에이전트 상태를 ledger(로그)로부터 복구하여 멈춘 자리에서부터 안전하게 작업을 이어가도록 보장하는 영속성 장치**입니다.
> 
> ---
> 
> **Key Recommendation (Just use `ulw`!)**
> - **If you remember only one command, make it `ulw` (or `ultrawork`)!** It is the primary engine that implements features, writes tests, and runs iterative loops until the codebase is 100% verified.
> - **How does `ulw` differ from `ralph`?**
>   - **`ulw` (Execution Engine)**: The actual workhorse modifying files, running test suites, and resolving issues.
>   - **`ralph` (Safety Net / Persistence Loop)**: A self-referential continuation loop. If a long-running execution gets interrupted (due to quota limits, network issues, or timeouts), `ralph` restores state and resumes exactly where it left off.

### Commands

| Command | What it does |
| :--- | :--- |
| **`ultrawork`** / **`ulw`** | Autonomous code → test → fix loop. Keeps iterating until 100% verified. |
| **`ultraresearch`** | Parallel research swarm across web, docs, and codebase with empirical verification. |
| **`browse`** / **`$browse`** | Opens the **asbrowse** visual dashboard in your browser (Note: `asbrowse` is the dashboard name; type `browse` or `$browse` to open it). |
| **`/ulw-loop`** | Evidence-audited multi-goal orchestration loop with checkpoints. |
| **`/init-deep`** | Auto-generates hierarchical `AGENTS.md` context files across your project. |
| **`/start-work`** | Prometheus Planner: interactive interview → detailed plan before any code changes. |

### Magic Keywords

Just include these words anywhere in your prompt — the system detects and triggers them automatically:

| Keywords | Triggered Skill | Effect |
| :--- | :--- | :--- |
| `ralph`, `don't stop`, `must complete`, `keep going` | `$ralph` | Persistent self-verification loop |
| `autopilot`, `build me`, `I want a` | `$autopilot` | Idea → working code pipeline |
| `team`, `swarm`, `coordinated team` | `$team` | Multi-agent collaborative team |
| `tdd`, `test first` | `$tdd` | Test-driven development workflow |
| `fix build`, `type errors` | `$build-fix` | Build error resolution |
| `review code` | `$code-review` | Comprehensive code review |
| `frontend`, `design`, `UI`, `UX` | `$frontend` + `$visual-qa` | Visual QA + Lighthouse + React profiling |
| `refactor`, `cleanup`, `restructure` | `$refactor` | Intelligent code refactoring |
| `research`, `deep research` | `$ultraresearch` | Maximum-saturation research orchestration |
| `remove slop`, `deslop`, `clean AI code` | `$remove-ai-slops` | Removes 10 categories of AI code smells |
| `spec interview`, `grill me` | `$spec-interview` | Socratic Q&A → requirements report |
| `debug this`, `why is X not working` | `$debugging` | Hypothesis-driven debugging loop |
| `visual QA`, `screenshot diff` | `$visual-qa` | Pixel-diff analysis for UI regressions |

---

## 📸 Visual Command Center: asbrowse

A Next.js–powered local dashboard that replaces the chaos of scrolling terminal logs with a structured, real-time GUI.

<div align="center">
  <img src="assets/readme/asbrowse_dashboard_mockup.png" alt="asbrowse Session Browser Dashboard" width="90%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

<br />

- **Grid-based Information Architecture**: Workflow progress, active Prometheus plans, code diffs, terminal logs, and Playwright visual QA — all visible at a glance.
- **Premium Dark + Cyan Aesthetic**: HSL dark gray gradients, vibrant cyan (#00d4ff) accents, Geist typography, and micro-animations.
- **Zero-Config Auto-Boot**: Type `$browse` → the plugin detects port 3000 → boots the Next.js dev server in the background → opens your browser automatically.

---

## 📦 Complete Skill Catalog (26 Skills)

Every skill is auto-triggered by keywords or invoked via `$name` / `/name`:

> [!NOTE]
> **How it works / 작동 원리**
> - **Workflow Engines (6개 / 6 skills)**: 전체 자율 코딩 루프와 에이전트 조율을 주도하는 **뇌(Brain)** 역할을 합니다. / Act as the **"Brain/Orchestrator"** leading the autonomous loop.
> - **Specialized Skills (20개 / 20 skills)**: 코딩 루프 실행 중 코드를 수정하거나 검증할 때 백그라운드 훅(Lifecycle Hooks)으로 자동 연동되거나 필요에 따라 엔진에 의해 호출(Call)되는 **도구 및 품질 게이트** 역할을 합니다. / Act as the **"Tools/Quality Gates"** called by the engine or triggered automatically by lifecycle hooks.

| Category | Skills | Description |
| :--- | :--- | :--- |
| ![Workflow Engines](https://img.shields.io/badge/Workflow_Engines-4285F4?style=flat-square) | `ultrawork` / `ulw`, `ulw-loop`, `ulw-plan`, `ralph`, `autopilot`, `start-work` | Autonomous coding loops, evidence-audited orchestration, persistence |
| ![Research](https://img.shields.io/badge/Research-34A853?style=flat-square) | `ultraresearch` | Parallel swarm research with empirical verification |
| ![Team & Orchestration](https://img.shields.io/badge/Team_%26_Orchestration-EA4335?style=flat-square) | `teammode` | Multi-agent collaboration with tmux visualization |
| ![Code Quality](https://img.shields.io/badge/Code_Quality-FBBC05?style=flat-square) | `programming`, `refactor`, `remove-ai-slops`, `review-work`, `comment-checker` | Strict types, AI slop removal, post-implementation review |
| ![Code Intelligence](https://img.shields.io/badge/Code_Intelligence-7C3AED?style=flat-square) | `lsp`, `lsp-setup`, `ast-grep` | Language server diagnostics, structural code search |
| ![Frontend & Design](https://img.shields.io/badge/Frontend_%26_Design-00D4FF?style=flat-square) | `frontend`, `visual-qa` | UI/UX design, Lighthouse audits, pixel-diff QA |
| ![Debugging](https://img.shields.io/badge/Debugging-FF6B6B?style=flat-square) | `debugging` | Hypothesis-driven debugging with Oracle spawning |
| ![Web & Browsing](https://img.shields.io/badge/Web_%26_Browsing-9333EA?style=flat-square) | `browse`, `ultimate-browsing` | Session dashboard, WAF bypass, stealth browsing |
| ![Git](https://img.shields.io/badge/Git-F05032?style=flat-square) | `git-master` | Atomic commits, bisect, blame, rebase, squash |
| ![Product & Spec](https://img.shields.io/badge/Product_%26_Spec-EC4899?style=flat-square) | `spec-interview` | Socratic interview → requirements report |
| ![Config & Setup](https://img.shields.io/badge/Config_%26_Setup-6B7280?style=flat-square) | `init-deep`, `rules` | Hierarchical AGENTS.md generation, project rules |
| ![Plugin Health](https://img.shields.io/badge/Plugin_Health-10B981?style=flat-square) | `lcx-doctor`, `lcx-report-bug`, `lcx-contribute-bug-fix` | Diagnose, report, and fix lazycodex/plugin issues |

---

## ⚙️ ULW-Loop: Evidence-Audited Orchestration

<div align="center">
  <img src="assets/readme/lazyantigravity-ulw-command.png" alt="ULW Command Selection" width="80%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

<br />

<div align="center">
  <img src="assets/readme/lazyantigravity-ulw-running.png" alt="ULW Running" width="80%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

<br />

The `ulw-loop` (Ultra Lightweight Loop) is the crown jewel of lazyantigravity:
1. **Goal Decomposition**: Breaks your request into measurable success criteria.
2. **Evidence-Bound Steps**: Every step must produce verifiable evidence before advancing.
3. **Safe-Resume Checkpoints**: If interrupted, resume from the exact checkpoint.
4. **Model Routing**: Automatically recommends the optimal model for each role (planner, worker, verifier).

---

## 🔧 Hook Pipeline: Automatic Quality Gates

lazyantigravity runs **13 hooks** across 7 lifecycle events — every action the agent takes is guarded automatically.

<div align="center">
  <img src="assets/readme/hook_lifecycle_diagram.png" alt="Hook Lifecycle Pipeline" width="85%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

<br />

| Hook Event | What runs automatically |
| :--- | :--- |
| **SessionStart** | Load project rules, record telemetry, check for auto-updates |
| **UserPromptSubmit** | Analyze prompt density, amplify prompt constraints, reload rules, check ultrawork/ulw-loop triggers |
| **PreToolUse** | Git Bash MCP recommendations, ulw-loop goal budget enforcement |
| **PostToolUse** | Comment preservation checker, LSP diagnostics, project rule matching |
| **PostCompact** | Reset Git Bash/Rule/LSP caches after context compaction |
| **Stop** | Start-work continuation checks |
| **SubagentStop** | Start-work continuation for child agents |

### Comment Checker

AI agents often silently delete user comments during edits. lazyantigravity's PostToolUse hook catches this in real-time:

<div align="center">
  <img src="assets/readme/comment_checker_hook.png" alt="Comment Checker in Action" width="60%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

---

## 🛠️ Technical Architecture

### ⚡ Gemini 3.5 Flash Optimization

<div align="center">
  <img src="assets/readme/terminal_execution_mockup.png" alt="Terminal Execution" width="90%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

<br />

- **Smart Quota Control**: Real-time API consumption monitoring preserves Gemini 3.5 Flash's cost-efficiency.
- **Compact Mode**: Filters redundant build logs, compresses to essential code snippets for token budgets.
- **Safe-Resume Checkpoints**: State freezes to `.lazycodex/checkpoints/ulw-*.json` — resume exactly where you left off with `omo ulw-loop resume`.

### 🔍 Ultraresearch: Maximum-Saturation Knowledge Gathering

<div align="center">
  <img src="assets/readme/ultraresearch_swarm.png" alt="Ultraresearch Parallel Swarm" width="80%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

<br />

- **Parallel Knowledge Swarms**: Concurrent agents scanning Exa (web), Context7 (docs), local codebase, and OSS repos.
- **Empirical Verification**: Discovered code is actually *executed* in a sandbox before the final report.
- **Cited Synthesis**: Every claim in the report includes source URLs and file references.

### 👥 Multi-Agent Team Mode

<div align="center">
  <img src="assets/readme/multi_agent_swarm_diagram.png" alt="Multi-Agent Team Swarm" width="70%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

<br />

- **Lead + up to 8 parallel member agents** for large-scale refactoring and audits.
- **tmux Integration**: Visual grid monitoring of all agents' real-time operations.
- **Built-in Team Packs**: `hyperplan` (5 adversarial planners) and `security-research` (3 vulnerability hunters + 2 exploit engineers).

### 🧬 LSP & AST-Grep Integration

<div align="center">
  <img src="assets/readme/lsp_diagnostics_live.png" alt="LSP Diagnostics" width="80%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

<br />

- **LSP (Language Server Protocol)**: IDE-grade `lsp_diagnostics`, `lsp_find_references`, `lsp_rename`, `lsp_hover` — right inside the agent.
- **AST-Grep**: Structural code pattern matching and deterministic multi-file codemods beyond regex.

### 🛡️ Hash-Anchored Edits (Hashline)
- Every line gets a unique content hash (`LINE#ID`) when the agent reads a file.
- Edits target these hashes — if the file changed concurrently, the edit is **safely rejected**.
- Near-0% code corruption rate (solves the "Harness Problem").

### 🔌 Skill-Embedded MCPs
- Standard MCP servers bloat context windows permanently.
- lazyantigravity embeds MCP servers *within individual skills* — they launch on-demand and terminate when the task completes.
- Built-in MCPs: `grep_app` (GitHub code search), `context7` (official documentation), `git_bash` (git operations), `lsp` (language server).

### 🎨 Frontend & Visual QA
- **react-scan** + **react-doctor**: Diagnose rendering bottlenecks and React antipatterns.
- **Playwright Pixel Diff**: Automated screenshot comparison for micro-alignment and CJK text clipping.
- **Lighthouse 100**: Iterates until Core Web Vitals (LCP, CLS, INP) all score 100.

---

## 🧬 Heritage: Ouroboros → lazycodex → lazyantigravity

`lazyantigravity`는 처음부터 새로 만든 프로젝트가 아닙니다. 여러 검증된 오픈소스 프로젝트의 아이디어와 코드를 **Google Gemini 모델에서 사용하기 위해** 구축되었습니다.

### [Ouroboros](https://github.com/Q00/ouroboros) — Agent OS

**"Stop prompting. Start specifying."** 을 표방하는 Agent OS입니다.

- **Spec-First 개발 철학**: AI 코딩 실패의 대부분은 AI 능력 부족이 아니라 인간의 모호한 지시에서 비롯된다는 관점에서, **소크라테스식 Spec-Interview**를 통해 모호성을 수치화(Ambiguity Score ≤ 0.2)하고 요구사항을 결정화(Crystallize)한 뒤에만 실행을 허용합니다.
- **Seed-Bound Execution**: 모든 에이전트 행동이 렛저(Ledger)에 기록되고 시드에 바인딩되어, 감사 가능(Auditable)하고 리플레이 가능(Replayable)한 실행 계약을 보장합니다.
- **Interview → Crystallize → Execute → Evaluate → Evolve**: 평가 결과가 다음 세대의 명세에 피드백되는 자기진화 루프 — 뱀이 자기 꼬리를 삼키는 우로보로스 상징 그 자체입니다.
- **Ralph Persistence Loop**: 세션 경계를 넘어 에이전트가 지속 실행되도록 하는 자기참조 루프. 이벤트 스토어를 통해 상태를 재구성하므로 머신이 재시작되어도 정확히 중단 지점에서 재개됩니다.
- **Multi-Runtime 지원**: Claude Code, Codex CLI, OpenCode, Gemini 등 다양한 AI CLI 도구와 통합됩니다.

### [lazycodex](https://github.com/code-yeongyu/lazycodex) — Agent Harness

복잡한 코드베이스를 위한 **에이전트 하네스(Agent Harness)** 입니다. [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) (OmO)를 통해 설치되며, 단순한 프롬프트 대화를 넘어 AI 코딩 에이전트에 구조와 규율을 부여합니다.

- **라이프사이클 훅 시스템**: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostCompact`, `Stop`, `SubagentStop` — 7개 이벤트에 훅을 걸어 에이전트의 모든 행동을 감시하고 보강합니다.
- **스킬 레지스트리**: 키워드로 자동 트리거되는 조합형 스킬 아키텍처. `$name` 또는 매직 키워드로 호출됩니다.
- **oh-my-codex (OMX) 오케스트레이션**: 20개 이상의 전문 에이전트 카탈로그(architect, executor, debugger 등), 복잡도 기반 모델 라우팅, 팀 파이프라인(`team-plan → team-prd → team-exec → team-verify → team-fix`)을 갖춘 멀티 에이전트 위임 프로토콜.
- **Comment Checker**: PostToolUse 훅으로 동작. AI가 코드 편집 시 사용자 주석을 조용히 삭제하는 것을 실시간 감지하고 경고합니다.
- **LSP 진단**: PostToolUse 훅으로 파일 편집 직후 실시간 타입 체크 및 코드 인텔리전스를 제공합니다.
- **프롬프트 앰플리파이어 & 밀도 분석기**: UserPromptSubmit 훅으로 모델이 프롬프트를 처리하기 전에 밀도를 점수화하고, 제약 조건을 주입하며, 프로젝트 규칙에서 자동 컨텍스트를 확장합니다.
- **프로젝트 규칙 엔진**: 프로젝트별 코딩 표준(AGENTS.md, .rules 등)을 자동 로드하고 강제합니다.
- **두 에디션**: Ultimate 에디션(OpenCode용, Sisyphus 오케스트레이션 + 54개 이상 훅)과 Light 에디션(Codex CLI 플러그인용, 핵심 기능 포커스).

### lazyantigravity — 이 프로젝트

위의 모든 것을 상속받은 위에, **Google Antigravity(Gemini CLI)** 환경에 특화된 확장 레이어를 추가했습니다:

- **All-Model Support**: Antigravity가 제공하는 모든 모델(Gemini 3.5 Flash, Gemini 3.1 Pro, Claude Opus, Claude Sonnet)과 호환. ULW Model Routing으로 역할별 최적 모델을 자동 추천합니다.
- **asbrowse 비주얼 대시보드**: 터미널 로그 혼란을 대체하는 Next.js 기반 Command Center.
- **Hash-Anchored Edits (Hashline)**: AI 에이전트가 낡은 라인 번호를 참조하여 코드를 오염시키는 "Harness Problem"을 콘텐츠 해시 검증으로 제거.
- **26개 전문 스킬**: ultraresearch 스웜, 시각 QA, TDD 워크플로우, 팀 오케스트레이션 등.
- **ulw-loop**: 안전 복원 체크포인트를 갖춘 증거 감사 기반 멀티 골 오케스트레이션.
- **Skill-Embedded MCPs**: 컨텍스트를 영구적으로 부풀리지 않는 온디맨드 MCP 서버.

Ouroboros와 lazycodex의 모든 핵심 기능은 **100% 상속되어 작동합니다** — lazyantigravity는 이를 확장할 뿐, 대체하지 않습니다.

---

## 📊 Telemetry & Opt-out

Once per day at session start, only a hashed identifier (`sha256("omo-codex:" + hostname)`) is transmitted. **No source code or sensitive data is ever sent externally.**

To disable:
```bash
export OMO_DISABLE_POSTHOG=1
export OMO_SEND_ANONYMOUS_TELEMETRY=0
```

---

## 🤝 Contributing

Contributions are welcome! See the [English Guide](src/README.md) or [한국어 가이드](src/README.ko.md) for technical details.

## 📜 License

[MIT](./LICENSE.md)

---

<div align="center">

**Made with ❤️ by shin**

<br />

이 프로젝트는 **our (Ouroboros)**, **lazycodex**, **omo (oh-my-openagent)**, **abworser (asbrowse)** 등 다양한 프로젝트의 혁신적인 아이디어와 코드베이스를 계승하고 확장하여 구축되었습니다. 뛰어난 설계와 영감을 나눠주신 개발자분들께 깊은 감사를 드립니다.

</div>

### 🙏 Acknowledgments

이 프로젝트에는 다음 오픈소스 프로젝트들의 아이디어와 코드가 반영되어 있습니다. 감사합니다.

| Project | Maintainer | Contribution |
| :--- | :--- | :--- |
| [Ouroboros](https://github.com/Q00/ouroboros) | [@code-yeongyu](https://github.com/code-yeongyu) | Agent OS, Spec-Interview, Ralph Persistence Loop |
| [lazycodex](https://github.com/code-yeongyu/lazycodex) | [@code-yeongyu](https://github.com/code-yeongyu) | Hook 시스템, 스킬 레지스트리, Comment Checker, LSP 진단 |
| [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | [@code-yeongyu](https://github.com/code-yeongyu) | OMX 오케스트레이션, 멀티 에이전트 위임, 모델 라우팅 |
| [asbrowse](skills/browse/) | — | 세션 브라우저 비주얼 대시보드 |
| [insane-research](https://github.com/fivetaku/insane-research) | [@fivetaku](https://github.com/fivetaku) | ultraresearch 검증 게이트 아이디어 (MIT) |
| [open-design](src/packages/shared-skills/upstreams/open-design/) | — | 디자인 시스템 스킬 업스트림 |
| [taste-skill](src/packages/shared-skills/upstreams/taste-skill/) | — | UI/UX 테이스트 라우터 |
| [designpowers](src/packages/shared-skills/upstreams/designpowers/) | — | 디자인 파워 레퍼런스 |
| [ast-grep](https://ast-grep.github.io/) | ast-grep team | AST 구조 검색 & 코드모드 |
| [Context7](https://context7.com/) | Context7 team | 공식 문서 MCP 서버 |
| [Grep.app](https://grep.app/) | Grep.app team | GitHub 코드 검색 MCP 서버 |

<div align="center">

# 🌌 lazyantigravity

**The most feature-rich AI agent orchestration plugin for [Google Antigravity (Gemini CLI)](https://github.com/google-gemini/antigravity).**

<br />

> *Built on the foundations of **[Ouroboros](https://github.com/code-yeongyu/ouroboros)** and **[lazycodex](https://github.com/code-yeongyu/lazycodex)** — inheriting their battle-tested multi-agent loops, static analysis engines, and persistent workflow architecture — then turbocharged for the sub-second inference of **Gemini 3.5 Flash**.*

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

<br />
<h3>
  <a href="src/README.md">🌐 English Detailed Guide</a>
  •
  <a href="src/README.ko.md">🇰🇷 한국어 상세 가이드</a>
</h3>

</div>

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

## 🧬 Heritage: Ouroboros → lazycodex → lazyantigravity

`lazyantigravity` didn't start from scratch. It stands on the shoulders of two battle-hardened open-source agent frameworks:

| Ancestor | What it contributed |
| :--- | :--- |
| **[Ouroboros](https://github.com/code-yeongyu/ouroboros)** | The self-referential persistence loop (`$ralph`), multi-agent spawning architecture, and the philosophy of *"never stop until the goal is verified"*. |
| **[lazycodex](https://github.com/code-yeongyu/lazycodex)** (Codex CLI / oh-my-openagent) | The complete hook system, skill registry, MCP integration, comment-checker, LSP diagnostics, prompt amplifier, project rules engine, and the `oh-my-codex` (OMX) orchestration layer. |
| **lazyantigravity** *(this project)* | Gemini 3.5 Flash–specific prompt tuning, the `asbrowse` visual dashboard, Hash-Anchored Edits (Hashline), 26 specialized skills, and the `ulw-loop` evidence-audited orchestration system. |

Every core capability of Ouroboros and lazycodex is **100% inherited and operational** — lazyantigravity extends them, never replaces them.

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

## 🎮 Core Commands & Magic Keywords

### Commands

| Command | What it does |
| :--- | :--- |
| **`ultrawork`** / **`ulw`** | Autonomous code → test → fix loop. Keeps iterating until 100% verified. |
| **`ultraresearch`** | Parallel research swarm across web, docs, and codebase with empirical verification. |
| **`browse`** / **`$browse`** | Opens the asbrowse visual dashboard in your browser. |
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

## 📦 Complete Skill Catalog (26 Skills)

Every skill is auto-triggered by keywords or invoked via `$name` / `/name`:

| Category | Skills | Description |
| :--- | :--- | :--- |
| **Workflow Engines** | `ultrawork` / `ulw`, `ulw-loop`, `ulw-plan`, `ralph`, `autopilot`, `start-work` | Autonomous coding loops, evidence-audited orchestration, persistence |
| **Research** | `ultraresearch` | Parallel swarm research with empirical verification |
| **Team & Orchestration** | `teammode` | Multi-agent collaboration with tmux visualization |
| **Code Quality** | `programming`, `refactor`, `remove-ai-slops`, `review-work`, `comment-checker` | Strict types, AI slop removal, post-implementation review |
| **Code Intelligence** | `lsp`, `lsp-setup`, `ast-grep` | Language server diagnostics, structural code search |
| **Frontend & Design** | `frontend`, `visual-qa` | UI/UX design, Lighthouse audits, pixel-diff QA |
| **Debugging** | `debugging` | Hypothesis-driven debugging with Oracle spawning |
| **Web & Browsing** | `browse`, `ultimate-browsing` | Session dashboard, WAF bypass, stealth browsing |
| **Git** | `git-master` | Atomic commits, bisect, blame, rebase, squash |
| **Product & Spec** | `spec-interview` | Socratic interview → requirements report |
| **Config & Setup** | `init-deep`, `rules` | Hierarchical AGENTS.md generation, project rules |
| **Plugin Health** | `lcx-doctor`, `lcx-report-bug`, `lcx-contribute-bug-fix` | Diagnose, report, and fix lazycodex/plugin issues |

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

**Made with ❤️ by [Yeongyu Kim](https://github.com/code-yeongyu)**

*Standing on the shoulders of [Ouroboros](https://github.com/code-yeongyu/ouroboros) and [lazycodex](https://github.com/code-yeongyu/lazycodex)*

</div>

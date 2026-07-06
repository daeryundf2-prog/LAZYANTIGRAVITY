<div align="center">

# 🌌 LAZYANTIGRAVITY

**The most feature-rich AI agent orchestration plugin for [Google Antigravity (Gemini CLI)](https://github.com/google-gemini/antigravity).**

<br />

> *Built on the foundations of **[Ouroboros](https://github.com/Q00/ouroboros)** and **[lazycodex](https://github.com/code-yeongyu/lazycodex)** — inheriting their battle-tested multi-agent loops, static analysis engines, and persistent workflow architecture — then turbocharged for the sub-second inference of **Gemini 3.5 Flash**.*
>
> *It started with the simple idea: "Wouldn't Gemini be much better to use if we just loaded it up with all these great features?"*

<br />

[![Antigravity Plugin](https://img.shields.io/badge/Antigravity-Plugin-4285F4?style=for-the-badge&logo=google-gemini&logoColor=white)](https://github.com/google-gemini/antigravity)
[![Gemini 3.5 Flash Optimized](https://img.shields.io/badge/Gemini%203.5%20Flash-Optimized-00d4ff?style=for-the-badge&logo=google-gemini&logoColor=white)](https://gemini.google.com)
[![All Antigravity Models](https://img.shields.io/badge/All%20Models-Supported-8B5CF6?style=for-the-badge&logo=google-gemini&logoColor=white)](https://github.com/google-gemini/antigravity)
[![Built on lazycodex](https://img.shields.io/badge/Built%20on-lazycodex-7C3AED?style=for-the-badge&logo=github&logoColor=white)](https://github.com/code-yeongyu/lazycodex)
[![Built on Ouroboros](https://img.shields.io/badge/Built%20on-Ouroboros-ff6b6b?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Q00/ouroboros)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?style=for-the-badge&logo=bun&logoColor=black)](https://bun.sh)
[![License](https://img.shields.io/badge/License-MIT-white?style=for-the-badge)](./LICENSE.md)
[![GitHub Stars](https://img.shields.io/github/stars/daeryundf2-prog/LAZYANTIGRAVITY?style=for-the-badge&color=ffcb47&labelColor=black)](https://github.com/daeryundf2-prog/LAZYANTIGRAVITY/stargazers)

</div>

<br />

---

## 📖 Documentation Guides
You can immediately navigate to the detailed technical documentation guide in your preferred language. The main README serves as the core landing page, while detailed skills and architectural specifications can be found in the language-specific guides:

| Guide | Target Audience & Content | Link |
| :--- | :--- | :--- |
| **🌐 English Detailed Guide** | English speakers and global developers. Explains the 29 skills, 13 hooks, and detailed architecture. | [👉 View English Guide (src/README.md)](./src/README.md) |
| **🇰🇷 한국어 상세 가이드** | Guide for Korean developers. Details the full skill registry, hook pipelines, safe checkpoints, and optimization specs. | [👉 View Korean Guide (src/README.ko.md)](./src/README.ko.md) |

---

## 🧭 Project Intent & Codex Maintainer Workflow

`lazyantigravity` began with a practical maintainer question: **can the LazyCodex way of working also run well inside Google Antigravity?** The project adapts the skills, hooks, evidence loops, and multi-agent workflows shaped by [lazycodex](https://github.com/code-yeongyu/lazycodex) and Kim Yeongyu's OpenCode/Codex-oriented work, then tests how those ideas behave in the Gemini CLI ecosystem.

OpenAI/Codex-oriented agents and Google's Gemini/Antigravity stack still differ in model behavior, runtime ergonomics, and tool boundaries. This repository exists to make those differences productive: expand how LazyCodex-style workflows can be used from OpenCode into Antigravity, keep the useful improvements, and feed practical lessons back into the broader agent-maintenance direction.

For day-to-day OSS maintenance, the Codex maintainer workflow is concrete: use Codex to review TypeScript changes, test Windows and Git Bash compatibility, improve skills and hooks, update documentation, and audit security-sensitive paths such as credential masking, shell execution, and automation boundaries.

---

## ⭐ If this project helped you, please give it a Star!

`lazyantigravity` is continuously updated with new skills, hooks, and agent workflows. Click the ⭐ **Star** button at the top to support the developer and help others discover this project!

---

## 🚀 Why lazyantigravity?

Antigravity is powerful out of the box. lazyantigravity makes it **dramatically more capable**:

| Without lazyantigravity | With lazyantigravity |
| :--- | :--- |
| Single agent, single task | **29 specialized skills** auto-triggered by keywords |
| No quality gates | **13 hooks** guard every edit (comment preservation, type checking, rule compliance) |
| Terminal log chaos | **asbrowse visual dashboard** — real-time progress, diffs, and QA in one view |
| Manual model selection | **ULW Model Routing** — auto-recommends optimal model per role |
| No persistence across interruptions | **Safe-Resume Checkpoints** — resume exactly where you left off |
| Basic code editing | **Hash-Anchored Edits** — near-0% code corruption (Hashline) |
| No built-in research | **Ultraresearch swarms** — parallel agents scan web, docs, and codebase simultaneously |
| Solo work only | **Team Mode** — up to 8 parallel agents with tmux visualization |
| No database introspection | **Database MCP Server** — auto-discover Docker DBs, query SQLite/Postgres/MySQL, manage connections |

> **Summary**: A premium plugin that enhances the Antigravity agent with autonomous loops, a visual dashboard, automatic quality gates, and multi-agent collaboration.

---

## 🛡️ Reliability: Hallucination Mitigation

While utilizing the ultra-fast speeds of Gemini 3.5 Flash, the plugin architecturally eliminates **hallucinations**—the primary weakness of coding agents.

1. **Evidence-Bound Loop (`ulw`)**: The agent does not declare completion unless verifiable execution evidence (e.g., successful test runs, green compile states, expected HTTP status codes) is collected. Hallucinated code is automatically caught, triggering a self-correction loop.
2. **Static Type Checker Hooks (LSP Quality Gates)**: Immediately after file modification, background static analyses (such as TypeScript's `tsc --noEmit`) run to catch type-level hallucinations (e.g., calling non-existent APIs) in real-time.
3. **Comment Watcher (Comment Checker)**: Actively monitors and prevents the agent from silently stripping out crucial explanatory comments or docstrings.
4. **Hash-Anchored Edits (Hashline)**: Instead of volatile line-number offsets, content-based hashes are used to anchor edits. This prevents file corruption caused by concurrent line shifting.
5. **Real-time Documentation MCP (context7)**: Queries official and up-to-date documentation libraries in real-time, preventing the agent from relying on outdated post-cutoff training data.

---

## 🧠 Gemini 3.5 & 3.1 Pro Architectural Optimizations

Dedicated architectural optimizations are integrated into the plugin to leverage Gemini 3.5 Flash and 3.1 Pro's native strengths, maximizing reasoning accuracy and eliminating latency bottlenecks:

1. **System Instruction Envelope**
   - **Gemini Trait**: Standard system instructions mixed inside user prompt context tend to drift and get ignored as context sizes expand. Gemini relies heavily on rules passed inside the API's native `systemInstruction` parameters.
   - **Improvement**: Context injected by [prompt-amplifier.mjs](file:///scripts/prompt-amplifier.mjs) (rules, notepad, memory) is wrapped inside a structured `<system-directives-and-context>` XML envelope, allowing Gemini to index and enforce these constraints with near-100% reliability.

2. **Role-based Persona Enveloping**
   - **Gemini Trait**: Reasoning efficiency increases when directed with a precise role envelope and structured workflow boundaries.
   - **Improvement**: Dynamically detects the active role (Planner, Researcher, Worker, Verifier) from prompt keywords and injects specialized role XML instruction templates (`<role-instructions type="...">`) to keep the agent strictly focused.

3. **CJK Localization & TUI Alignment Auditing**
   - **Gemini Trait**: Visual encoders are prone to missing subtle Korean/Japanese/Chinese text clips (baseline drop), semantic CJK word wraps, or terminal border misalignments.
   - **Improvement**: Extended the Pass A/B check guidelines in [visual-qa/SKILL.md](file:///skills/visual-qa/SKILL.md) to explicitly require auditing for CJK wrap styles (`keep-all`, `break-all`), glyph drop (tofu), and TUI box-drawing grids.

4. **Parallelized LSP Diagnostics**
   - **Gemini Trait**: Fast, type-safe generation requires immediate feedback on compile errors.
   - **Improvement**: Parallelized the LSP diagnostics retrieval loop inside [prompt-amplifier.mjs](file:///prompt-amplifier.mjs) using `Promise.all`, reducing the maximum submit hook latency from 4.5 seconds down to a max of 1.5 seconds.

5. **Secure Context Masking (Credential leak prevention)**
   - **Gemini Trait**: API keys, credentials, or private keys written inside `.omx/notepad.md` or `project-memory.json` might accidentally get exposed to external LLM API endpoints.
   - **Improvement**: Injected the `sanitizeSecrets` helper to identify JWTs, AWS credentials, Bearer tokens, and password formats, automatically replacing them with `[REDACTED_SECRET]` in real-time before sending to the model.

6. **0ms Latency Background Hook Delegation**
   - **Gemini Trait**: Large initial session setup operations (like telemetry logs and auto-update checks) block user prompts when run synchronously.
   - **Improvement**: Added a `BACKGROUND` execution policy to `hook-runner.mjs` to spawn these processes in a completely detached background mode, cutting initial session prompt latency down to less than 60ms.

7. **Dynamic LSP Target Extensions & Priority Sorting**
   - **Gemini Trait**: Blindly expanding scanned extensions risks triggering useless IPC timeouts (800ms per file) for languages without local LSP server installations. In addition, deleted files or invalid paths can hog active diagnosis slots.
   - **Improvement**: Reverted default target extensions to the core 5 languages (`ts, tsx, go, py, rs`) and designed it to dynamically append other extensions only when explicit LSP configurations are detected in `.codex/lsp-client.json`. Added git status priority weights (Modified = 3, Added = 2) and integrated physical file existence filters (`fs.existsSync`) to prune deleted or malformed files from the scan queue.

---

## ⚡ Quick Start

> **Prerequisite**: [Google Antigravity (Gemini CLI)](https://github.com/google-gemini/antigravity) must be installed.

### 1. Plugin Clone

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

### 2. Launch Session Browser

After installation, restart your Antigravity agent session. Then run **inside the agent session**:
```
$browse
```
*(Auto-boots Next.js dev server on port 3000 if inactive, then opens the dashboard in your browser.)*

### 3. Ultimate Browsing Setup (Optional)

If you want to use the **Ultimate Browsing / Insane Search** skill to bypass Cloudflare WAF, scrape websites, or extract YouTube subtitles, you must configure the local Python virtual environment.
Run the setup script using the absolute plugin directory path (or by changing directory to the plugin folder):

```bash
# macOS / Linux (Direct run)
node ~/.gemini/config/plugins/lazyantigravity/scripts/install-browsing-deps.mjs

# Windows PowerShell (Direct run)
node $env:USERPROFILE\.gemini\config\plugins\lazyantigravity\scripts\install-browsing-deps.mjs

# Or navigate to the folder and execute:
cd ~/.gemini/config/plugins/lazyantigravity && node scripts/install-browsing-deps.mjs
```
*(This automatically configures a local Python virtual environment under `.omo/ulw-loop/browsing-venv` and installs `curl_cffi`, `playwright`, `yt-dlp`, and Playwright Chromium drivers.)*

---

## 🤖 Supported Models

lazyantigravity works on **all models supported by Antigravity**. While optimized for Gemini 3.5 Flash, you can use any model depending on the task complexity.

| Model | Recommended Use Case |
| :--- | :--- |
| **Gemini 3.5 Flash** (High/Medium) | Rapid iterative work, debugging, codebase exploration — Default recommended model |
| **Gemini 3.1 Pro** (High) | High-quality alternative when Claude quota is limited |
| **Claude Opus 4.6** (Thinking) | System design, complex refactoring, deep analysis |
| **Claude Sonnet** | General implementation tasks |

> 💡 **ULW Model Routing**: During `ulw` / `ulw-loop` execution, subagents automatically inherit the model selected in the Antigravity UI dropdown.

---

## 🎮 Core Commands & Magic Keywords

> [!IMPORTANT]
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

## 🗄️ Database Inspection: sqlit-inspired MCP Server

lazyantigravity features an integrated, high-performance **Database MCP Server** inspired by the core connection management and querying engine of `sqlit-tui`. It exposes standard Model Context Protocol (MCP) tools that allow the agent and the developer to inspect schemas and run queries natively.

- **Automated Docker Discovery**: Automatically scans active Docker containers (`db_discover_containers`) to detect running database instances (PostgreSQL, MySQL, MariaDB, SQL Server, etc.) and lists their port mappings.
- **SQLite Direct Fallback**: Zero-dependency querying (`db_query`) for local development. If `sqlit` is not installed, it falls back to native `sqlite3` CLI executions, using stdin piping for 100% parameter injection safety.
- **Keyring-Safe Connections**: Manages connections (`db_add_connection`, `db_list_connections`) and securely writes to your local `connections.json` matching `sqlit` connection configurations.

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

## 📦 Complete Skill Catalog (29 Skills)

Every skill is auto-triggered by keywords or invoked via `$name` / `/name`:

> [!NOTE]
> **How it works**
> - **Workflow Engines (6 skills)**: Act as the **"Brain/Orchestrator"** leading the autonomous loop.
> - **Specialized Skills (20 skills)**: Act as the **"Tools/Quality Gates"** called by the engine or triggered automatically by lifecycle hooks.

| Category | Skills | Description |
| :--- | :--- | :--- |
| ![Workflow Engines](https://img.shields.io/badge/Workflow_Engines-4285F4?style=flat-square) | `ultrawork` / `ulw`, `ulw-loop`, `ulw-plan`, `ralph`, `autopilot`, `start-work` | Autonomous coding loops, evidence-audited orchestration, persistence |
| ![Research](https://img.shields.io/badge/Research-34A853?style=flat-square) | `ultraresearch` | Parallel swarm research with empirical verification |
| ![Team & Orchestration](https://img.shields.io/badge/Team_%26_Orchestration-EA4335?style=flat-square) | `teammode` | Multi-agent collaboration with tmux visualization |
| ![Code Quality](https://img.shields.io/badge/Code_Quality-FBBC05?style=flat-square) | `programming`, `refactor`, `remove-ai-slops`, `review-work`, `comment-checker` | Strict types, AI slop removal, post-implementation review |
| ![Code Intelligence](https://img.shields.io/badge/Code_Intelligence-7C3AED?style=flat-square) | `lsp`, `lsp-setup`, `ast-grep` | Language server diagnostics, structural code search |
| ![Frontend & Design](https://img.shields.io/badge/Frontend_%26_Design-00D4FF?style=flat-square) | `frontend`, `visual-qa`, `clone` | UI/UX design, Lighthouse audits, pixel-diff QA, website cloner |
| ![Debugging](https://img.shields.io/badge/Debugging-FF6B6B?style=flat-square) | `debugging` | Hypothesis-driven debugging with Oracle spawning |
| ![Web & Browsing](https://img.shields.io/badge/Web_%26_Browsing-9333EA?style=flat-square) | `browse`, `ultimate-browsing` | Session dashboard, WAF bypass, stealth browsing |
| ![Git](https://img.shields.io/badge/Git-F05032?style=flat-square) | `git-master` | Atomic commits, bisect, blame, rebase, squash |
| ![Product & Spec](https://img.shields.io/badge/Product_%26_Spec-EC4899?style=flat-square) | `spec-interview` | Socratic interview → requirements report |
| ![Config & Setup](https://img.shields.io/badge/Config_%26_Setup-6B7280?style=flat-square) | `init-deep`, `rules`, `sync-rules`, `skill-gen` | Hierarchical AGENTS.md generation, conditional platform rules sync, dynamic skill generator |
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
- Built-in MCPs: `grep_app` (GitHub code search), `context7` (official documentation), `git_bash` (git operations), `lsp` (language server), `database` (database inspection).

### 🎨 Frontend & Visual QA
- **react-scan** + **react-doctor**: Diagnose rendering bottlenecks and React antipatterns.
- **Playwright Pixel Diff**: Automated screenshot comparison for micro-alignment and CJK text clipping.
- **Lighthouse 100**: Iterates until Core Web Vitals (LCP, CLS, INP) all score 100.

---

## 🧬 Heritage: Ouroboros → lazycodex → lazyantigravity

`lazyantigravity` is not built from scratch. It is constructed to leverage the ideas and codebases of several proven open-source projects **specifically optimized for Google Gemini models**.

### [Ouroboros](https://github.com/Q00/ouroboros) — Agent OS

An Agent OS that advocates **"Stop prompting. Start specifying."**

- **Spec-First Philosophy**: Grounded in the perspective that most AI coding failures stem from ambiguous human instructions rather than lack of AI capability. It crystallizes requirements via a **Socratic Spec-Interview** (targeting Ambiguity Score ≤ 0.2) before permitting execution.
- **Seed-Bound Execution**: All agent actions are recorded in a ledger and bound to a unique seed, ensuring an auditable and replayable execution contract.
- **Interview → Crystallize → Execute → Evaluate → Evolve**: A self-evolving loop where evaluation results are fed back into the next iteration's specification—the very symbol of Ouroboros swallowing its own tail.
- **Ralph Persistence Loop**: A self-referential loop that allows the agent to execute persistently across session boundaries. It reconstructs state via an event store, enabling it to resume exactly where it was interrupted even after system restarts.
- **Multi-Runtime Support**: Integrates with various AI CLI tools including Claude Code, Codex CLI, OpenCode, and Gemini.

### [lazycodex](https://github.com/code-yeongyu/lazycodex) — Agent Harness

An **Agent Harness** designed for complex codebases. Installed via [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) (OmO), it gives structure and discipline to AI coding agents beyond mere chat prompts.

- **Lifecycle Hook System**: Intercepts 7 lifecycle events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostCompact`, `Stop`, `SubagentStop`) to monitor and enhance all agent activities.
- **Skill Registry**: A composable skill architecture automatically triggered by keywords or explicitly invoked via `$name` or `/name`.
- **oh-my-codex (OMX) Orchestration**: A multi-agent delegation protocol featuring a catalog of over 20 specialized agent roles (architect, executor, debugger, etc.), complexity-aware model routing, and a structured team pipeline (`team-plan → team-prd → team-exec → team-verify → team-fix`).
- **Comment Checker**: Runs as a PostToolUse hook to detect and prevent the agent from silently deleting explanatory comments or docstrings during edits.
- **LSP Diagnostics**: Runs as a PostToolUse hook to provide real-time type checking and code intelligence immediately after editing files.
- **Prompt Amplifier & Density Analyzer**: Runs as a UserPromptSubmit hook to score prompt density, inject prompt constraints, and dynamically load rules prior to model execution.
- **Project Rule Engine**: Automatically loads and enforces workspace-specific coding standards (e.g., AGENTS.md, .rules files).
- **Dual Editions**: Ultimate Edition (for OpenCode with Sisyphus Orchestration and 54+ hooks) and Light Edition (focused plugin for Codex CLI).

### lazyantigravity — This Project

Inheriting all of the capabilities above, it adds an extension layer tailored for the **Google Antigravity (Gemini CLI)** environment:

- **All-Model Support**: Fully compatible with all models supported by Antigravity. Automatically recommends the optimal model per role via ULW Model Routing.
- **asbrowse Visual Dashboard**: A Next.js-powered command center that replaces chaotic terminal logs with a structured visual interface.
- **Hash-Anchored Edits (Hashline)**: Eliminates the "Harness Problem" (where AI corrupts code by referencing outdated line numbers) using content hash validation.
- **29 Specialized Skills**: Includes ultraresearch swarms, visual QA, TDD workflows, web cloner, conditional rule synchronization, dynamic skill generators, and more.
- **ulw-loop**: An evidence-audited, multi-goal orchestration engine with safe-resume checkpoints.
- **Skill-Embedded MCPs**: On-demand MCP servers that launch inside specific skills and close when done, avoiding context window bloat.

All core features of Ouroboros and lazycodex are **fully inherited and functional**—lazyantigravity extends them rather than replacing them.

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

This project inherits and extends the innovative ideas and codebases of various projects, including **our (Ouroboros)**, **lazycodex**, **omo (oh-my-openagent)**, and **abworser (asbrowse)**. Deep gratitude is extended to the developers who shared their outstanding designs and inspirations.

</div>

### 🙏 Acknowledgments

This project incorporates ideas and code from the following open-source projects. Thank you.

| Project | Maintainer | Contribution |
| :--- | :--- | :--- |
| [Ouroboros](https://github.com/Q00/ouroboros) | [@Q00](https://github.com/Q00) | Agent OS, Spec-Interview, Ralph Persistence Loop |
| [lazycodex](https://github.com/code-yeongyu/lazycodex) | [@code-yeongyu](https://github.com/code-yeongyu) | Hook 시스템, 스킬 레지스트리, Comment Checker, LSP 진단 |
| [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | [@code-yeongyu](https://github.com/code-yeongyu) | OMX 오케스트레이션, 멀티 에이전트 위임, 모델 라우팅 |
| [asbrowse](skills/browse/) | abworser | 세션 브라우저 비주얼 대시보드 |
| [insane-research](https://github.com/fivetaku/insane-research) | [@fivetaku](https://github.com/fivetaku) | ultraresearch 검증 게이트 아이디어 (MIT) |
| [open-design](https://github.com/nexu-io/open-design) | [@nexu-io](https://github.com/nexu-io) | 디자인 시스템 스킬 업스트림 |
| [taste-skill](https://github.com/Leonxlnx/taste-skill) | [@Leonxlnx](https://github.com/Leonxlnx) | UI/UX 테이스트 라우터 |
| [designpowers](https://github.com/Owl-Listener/designpowers) | [@Owl-Listener](https://github.com/Owl-Listener) | 디자인 파워 레퍼런스 |
| [ast-grep](https://ast-grep.github.io/) | ast-grep team | AST 구조 검색 & 코드모드 |
| [Context7](https://context7.com/) | Context7 team | 공식 문서 MCP 서버 |
| [Grep.app](https://grep.app/) | Grep.app team | GitHub 코드 검색 MCP 서버 |

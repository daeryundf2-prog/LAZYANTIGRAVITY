# 🌌 lazyantigravity — English Detailed Guide

> *The most feature-rich AI agent orchestration plugin for [Google Antigravity (Gemini CLI)](https://github.com/google-gemini/antigravity), built on the battle-tested foundations of Ouroboros and lazycodex.*

---

[![Antigravity Plugin](https://img.shields.io/badge/Antigravity-Plugin-4285F4?style=for-the-badge&logo=google-gemini&logoColor=white)](https://github.com/google-gemini/antigravity)
[![Gemini 3.5 Flash Optimized](https://img.shields.io/badge/Gemini%203.5%20Flash-Optimized-00d4ff?style=for-the-badge&logo=google-gemini&logoColor=white)](https://gemini.google.com)
[![All Antigravity Models](https://img.shields.io/badge/All%20Models-Supported-8B5CF6?style=for-the-badge&logo=google-gemini&logoColor=white)](https://github.com/google-gemini/antigravity)
[![Built on lazycodex](https://img.shields.io/badge/Built%20on-lazycodex-7C3AED?style=for-the-badge&logo=github&logoColor=white)](https://github.com/code-yeongyu/lazycodex)
[![Built on Ouroboros](https://img.shields.io/badge/Built%20on-Ouroboros-ff6b6b?style=for-the-badge&logo=github&logoColor=white)](https://github.com/code-yeongyu/ouroboros)
[![License](https://img.shields.io/badge/License-MIT-white?style=for-the-badge)](../LICENSE.md)
[![GitHub Stars](https://img.shields.io/github/stars/daeryundf2-prog/LAZYANTIGRAVITY?style=for-the-badge&color=ffcb47&labelColor=black)](https://github.com/daeryundf2-prog/LAZYANTIGRAVITY/stargazers)

**[🇰🇷 한국어 가이드 →](./README.ko.md)** &nbsp;|&nbsp; **[🏠 Back to Main README →](../README.md)**

---

## Table of Contents

- [Quick Start & Installation](#-quick-start--installation)
- [Supported Models](#-supported-models)
- [Core Commands](#-core-commands)
- [Magic Keywords](#-magic-keywords)
- [Visual Dashboard: asbrowse](#-visual-dashboard-asbrowse)
- [Complete Skill Catalog (26 Skills)](#-complete-skill-catalog-26-skills)
- [Hook Pipeline: Automatic Quality Gates](#-hook-pipeline-automatic-quality-gates)
- [Technical Architecture](#-technical-architecture)
- [Heritage & Philosophy](#-heritage--philosophy)
- [MCP Integration](#-mcp-integration)
- [Telemetry & Opt-out](#-telemetry--opt-out)

---

## ⚡ Quick Start & Installation

> **Prerequisite**: [Google Antigravity (Gemini CLI)](https://github.com/google-gemini/antigravity) must be installed.

### 1. Plugin Clone (Git Clone)

#### macOS, Linux, Git Bash
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

### Option 2: Package Managers

```bash
# Ultimate Edition (OpenCode)
bunx oh-my-openagent install

# Light Edition (Codex CLI)
npx lazycodex-ai install
```

### 2. Launch Session Browser

After installation or update, restart your Antigravity agent session. Then run the following command **inside the agent session**:
```
$browse
```
*(If port 3000 is not active, the plugin automatically boots a Next.js dev server in the background and pops open the dashboard in your browser.)*

---

## 🤖 Supported Models

lazyantigravity works with **all models available in Antigravity**. While optimized for Gemini 3.5 Flash, you can freely use any model depending on task complexity.

| Model | Recommended Use Case |
| :--- | :--- |
| **Gemini 3.5 Flash** (High/Medium) | Fast iterations, debugging, codebase exploration — default recommended model |
| **Gemini 3.1 Pro** (High) | High-quality alternative when Claude quota is limited |
| **Claude Opus 4.6** (Thinking) | Architecture design, complex refactoring, deep analysis |
| **Claude Sonnet** | General implementation work |

> 💡 **ULW Model Routing**: When running `ulw` / `ulw-loop`, the system automatically recommends the optimal model for each role (planner, worker, verifier). The model you currently have selected is inherited by all subagents.

## 🎮 Core Commands

> [!IMPORTANT]
> **Key Recommendation (Just use `ulw`!)**
> - **If you remember only one command, make it `ulw` (or `ultrawork`)!** It is the primary engine that implements features, writes tests, and runs iterative loops until the codebase is 100% verified.
> - **How does `ulw` differ from `ralph`?**
>   - **`ulw` (Execution Engine)**: The actual workhorse modifying files, running test suites, and resolving issues.
>   - **`ralph` (Safety Net / Persistence Loop)**: A self-referential continuation loop. If a long-running execution gets interrupted (due to quota limits, network issues, or timeouts), `ralph` restores state and resumes exactly where it left off.

These commands can be typed directly in your **Antigravity agent session** or included in your prompts:

| Command | Description | Key Benefit |
| :--- | :--- | :--- |
| **`ultrawork`** / **`ulw`** | Ultimate autonomous coding loop. Writes code, runs tests, and iterates until the task is 100% verified. | Leverages Gemini 3.5 Flash's speed for hyper-fast feedback loops. |
| **`ultraresearch`** / **`research`** | Maximum-saturation research orchestrator. Scans codebases, web docs, and repos. Verifies discovered code in a sandbox. | Produces cited, evidence-backed research reports. |
| **`browse`** / **`$browse`** | Opens the **asbrowse** Session Browser dashboard (Note: `asbrowse` is the dashboard name; type `browse` or `$browse` to open it). | Auto-boots Next.js dev server on port 3000 if inactive. |
| **`/ulw-loop`** | Evidence-audited multi-goal orchestration loop with checkpoints. | Ensures auditability for large features. |
| **`/init-deep`** | Generates hierarchical `AGENTS.md` context files across your project. | Maximizes agent domain awareness and token efficiency. |
| **`/start-work`** | Prometheus Planner: conducts an interactive interview and establishes a plan before coding. | Eliminates ambiguity and requirement gaps upfront. |

### ULW in Action

<div align="center">
  <img src="../assets/readme/lazyantigravity-ulw-command.png" alt="ULW Command Selection" width="80%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
  <br /><em>Selecting the ULW skill from the command palette</em>
</div>

<br />

<div align="center">
  <img src="../assets/readme/lazyantigravity-ulw-running.png" alt="ULW Running" width="80%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
  <br /><em>ULW loop executing — scanning, planning, and iterating autonomously</em>
</div>

---

## 🪄 Magic Keywords

Include any of these words in your prompt — the system auto-detects them and triggers the corresponding skill. No configuration needed.

| Keywords | Triggered Skill | What Happens |
| :--- | :--- | :--- |
| `ralph`, `don't stop`, `must complete`, `keep going` | `$ralph` | Self-referential persistence loop — keeps going until all tasks verified |
| `autopilot`, `build me`, `I want a` | `$autopilot` | Full autonomous pipeline from idea to working code |
| `team`, `swarm`, `coordinated team` | `$team` | Spawns a team of cooperating agents for complex parallel tasks |
| `tdd`, `test first` | `$tdd` | Enforces test-driven development — tests written before implementation |
| `fix build`, `type errors` | `$build-fix` | Targets and resolves build errors and TypeScript type failures |
| `review code` | `$code-review` | Comprehensive static analysis and code quality review |
| `frontend`, `design`, `UI`, `UX` | `$frontend` + `$visual-qa` | Playwright visual QA, Lighthouse 100-score audits, React profiling |
| `refactor`, `cleanup`, `restructure` | `$refactor` | Intelligent code refactoring with safety checks |
| `research`, `deep research` | `$ultraresearch` | Maximum-saturation parallel research with cited synthesis |
| `remove slop`, `deslop`, `clean AI code` | `$remove-ai-slops` | Removes 10 categories of AI-generated code smells |
| `spec interview`, `grill me` | `$spec-interview` | Socratic Q&A session → requirements report |
| `debug this`, `why is X not working` | `$debugging` | Hypothesis-driven debugging loop with Oracle spawning |
| `visual QA`, `screenshot diff` | `$visual-qa` | Pixel-diff analysis for UI regressions |

---

## 🖥️ Visual Dashboard: asbrowse

The asbrowse dashboard replaces terminal log overload with a structured, real-time web interface.

<div align="center">
  <img src="../assets/readme/asbrowse_dashboard_mockup.png" alt="asbrowse Dashboard" width="90%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
  <br /><em>The asbrowse Command Center — real-time progress, diffs, logs, and visual QA in one view</em>
</div>

<br />

### Features

- **Grid-based Information Architecture**: Splits information into clean panels — workflow progress, active phases (Prometheus plans), code diffs, terminal logs, and Playwright visual QA viewports.
- **Premium Dark + Cyan Aesthetics**: Built to the `DESIGN.md` specification. Deep HSL gray gradients, vibrant cyan (#00d4ff) accents, Geist typography, and smooth micro-animations.
- **Self-Hosting & Zero-Config Automation**: When `$browse` is called, the plugin checks if port 3000 is active. If not, it spins up `npm run dev` in the background and opens your system browser — no manual setup needed.
- **Secure Local-Only**: Runs entirely on localhost. No data leaves your machine.

---

## 📦 Complete Skill Catalog (26 Skills)

Every skill is either auto-triggered by magic keywords or manually invoked via `$name` / `/name`.

> 💡 **How it works**:
> - **Workflow Engines (6 skills)**: Act as the **"Brain/Orchestrator"** leading the autonomous loop.
> - **Specialized Skills (20 skills)**: Act as the **"Tools/Quality Gates"** called by the engine or triggered automatically by lifecycle hooks (like type checking, comment protection, and pixel-diff QA) during execution.

### ![Workflow Engines](https://img.shields.io/badge/Workflow_Engines-4285F4?style=flat-square) Workflow Engines (6 skills)

| Skill | Trigger | Description |
| :--- | :--- | :--- |
| **ultrawork / ulw** | `ultrawork`, `ulw`, `parallel` | Maximum parallelism with autonomous verification loop |
| **ulw-loop** | `/ulw-loop` | Evidence-audited multi-goal loop with checkpoints |
| **ulw-plan** | `/ulw-plan` | Planning phase for ulw-loop sessions |
| **start-work** | `start work`, `execute plan`, `resume plan` | Prometheus work plan execution with state tracking |
| **ralph** | `ralph`, `don't stop`, `keep going` | Self-referential persistence loop (inherited from Ouroboros) |
| **autopilot** | `autopilot`, `build me` | Idea → working code autonomous pipeline |

### ![Research](https://img.shields.io/badge/Research-34A853?style=flat-square) Research (1 skill)

| Skill | Trigger | Description |
| :--- | :--- | :--- |
| **ultraresearch** | `research`, `deep research`, `ultraresearch` | Parallel swarm: Exa web search + Context7 docs + local codebase + empirical verification → cited synthesis report |

<div align="center">
  <img src="../assets/readme/ultraresearch_swarm.png" alt="Ultraresearch Swarm" width="80%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
  <br /><em>Ultraresearch parallel swarm — synthesizing knowledge from 4 source types simultaneously</em>
</div>

### ![Team & Orchestration](https://img.shields.io/badge/Team_%26_Orchestration-EA4335?style=flat-square) Team & Orchestration (1 skill)

| Skill | Trigger | Description |
| :--- | :--- | :--- |
| **teammode** | `team`, `swarm`, `make a team` | Lead agent + up to 8 parallel members. tmux grid visualization. Built-in packs: `hyperplan`, `security-research` |

<div align="center">
  <img src="../assets/readme/multi_agent_swarm_diagram.png" alt="Multi-Agent Team" width="70%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
  <br /><em>Multi-agent team swarm — parallel collaboration with tmux monitoring</em>
</div>

### ![Code Quality](https://img.shields.io/badge/Code_Quality-FBBC05?style=flat-square) Code Quality (5 skills)

| Skill | Trigger | Description |
| :--- | :--- | :--- |
| **programming** | Any `.py`, `.ts`, `.tsx`, `.rs`, `.go` file work | Strict types, modern stacks (Pydantic v2 / serde / Zod / gin), 250 LOC ceiling, TDD |
| **refactor** | `refactor`, `cleanup`, `restructure` | Intelligent multi-step refactoring with safety verification |
| **remove-ai-slops** | `remove slop`, `deslop`, `clean AI code` | Removes 10 categories of AI code smells, enforces 250+ LOC split |
| **review-work** | `review work`, `check my work` | 5 parallel review agents: goal verification, code quality, security, QA, context mining |
| **comment-checker** | Automatic (PostToolUse hook) | Prevents AI from silently removing user comments during edits |

### ![Code Intelligence](https://img.shields.io/badge/Code_Intelligence-7C3AED?style=flat-square) Code Intelligence (3 skills)

| Skill | Trigger | Description |
| :--- | :--- | :--- |
| **lsp** | Automatic (PostToolUse hook) | `lsp_diagnostics`, `lsp_find_references`, `lsp_rename`, `lsp_hover` — IDE-grade analysis |
| **lsp-setup** | `lsp setup`, `configure LSP` | Configures language servers for 21 languages with install commands and config snippets |
| **ast-grep** | Structural code search tasks | AST-level code pattern matching and deterministic codemods across 25 languages |

<div align="center">
  <img src="../assets/readme/lsp_diagnostics_live.png" alt="LSP Diagnostics" width="80%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
  <br /><em>Real-time LSP diagnostics — type errors and warnings caught instantly</em>
</div>

### ![Frontend & Design](https://img.shields.io/badge/Frontend_%26_Design-00D4FF?style=flat-square) Frontend & Design (2 skills)

| Skill | Trigger | Description |
| :--- | :--- | :--- |
| **frontend** | `frontend`, `UI`, `UX`, `design` | Anti-slop taste router with 12 taste skills + 69 brand design refs. React dev tooling: react-scan, react-doctor. Lighthouse 100 via Playwright Chromium audits |
| **visual-qa** | `visual QA`, `screenshot diff`, `UI looks wrong` | Pixel-diff analysis + CJK text precision + two parallel oracle passes for design-system and functional integrity |

### ![Debugging](https://img.shields.io/badge/Debugging-FF6B6B?style=flat-square) Debugging (1 skill)

| Skill | Trigger | Description |
| :--- | :--- | :--- |
| **debugging** | `debug this`, `why is X not working`, `trace this bug` | Hypothesis-driven loop: form ≥3 hypotheses → investigate in parallel → after 2 failures, spawn Oracles from orthogonal angles → confirm root cause → lock with failing test → fix minimally |

### ![Web & Browsing](https://img.shields.io/badge/Web_%26_Browsing-9333EA?style=flat-square) Web & Browsing (2 skills)

| Skill | Trigger | Description |
| :--- | :--- | :--- |
| **browse** | `$browse`, `browse` | Opens asbrowse dashboard, auto-boots Next.js server |
| **ultimate-browsing** | `blocked site`, `bypass bot detection`, `stealth browser` | Tiered WAF bypass: curl_cffi TLS impersonation → platform readers (Xiaohongshu, Douyin, etc.) → CloakBrowser stealth Chromium |

### ![Git](https://img.shields.io/badge/Git-F05032?style=flat-square) Git (1 skill)

| Skill | Trigger | Description |
| :--- | :--- | :--- |
| **git-master** | Commit/history tasks | Atomic commits, staging, rebase, squash, fixup/autosquash, blame, bisect, reflog, git log -S/-G |

### ![Product & Specification](https://img.shields.io/badge/Product_%26_Spec-EC4899?style=flat-square) Product & Specification (1 skill)

| Skill | Trigger | Description |
| :--- | :--- | :--- |
| **spec-interview** | `spec interview`, `grill me` | Socratic Q&A → ambiguity scoring → polished requirements report (pm.md) + slide outline |

### ![Configuration & Setup](https://img.shields.io/badge/Config_%26_Setup-6B7280?style=flat-square) Configuration & Setup (2 skills)

| Skill | Trigger | Description |
| :--- | :--- | :--- |
| **init-deep** | `/init-deep` | Generates hierarchical `AGENTS.md` knowledge base across project directories |
| **rules** | Rules-related questions | Explains Codex Rules behavior, rule file locations, matching, environment config |

### ![Plugin Health](https://img.shields.io/badge/Plugin_Health-10B981?style=flat-square) Plugin Health (3 skills)

| Skill | Trigger | Description |
| :--- | :--- | :--- |
| **lcx-doctor** | `doctor`, health check | Diagnoses lazycodex/plugin installation health against latest sources |
| **lcx-report-bug** | `report bug`, `file bug` | Creates high-signal bug issues with source-backed root cause and reproduction steps |
| **lcx-contribute-bug-fix** | `fix bug`, `contribute bug fix` | Opens verified-fix issues or fork PRs for lazycodex/Codex bugs |

---

## 🔧 Hook Pipeline: Automatic Quality Gates

lazyantigravity runs **13 hooks** across **7 lifecycle events**. Every action the agent takes is automatically guarded.

<div align="center">
  <img src="../assets/readme/hook_lifecycle_diagram.png" alt="Hook Lifecycle Pipeline" width="85%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
  <br /><em>The complete hook lifecycle — from session start to agent stop</em>
</div>

<br />

### Lifecycle Events

| Event | Hooks | Purpose |
| :--- | :--- | :--- |
| **SessionStart** | Project Rules Loader, Telemetry Recorder, Auto-Update Checker | Initialize the agent's environment with rules, metrics, and latest code |
| **UserPromptSubmit** | Prompt Density Analyzer, Prompt Amplifier, Project Rules Reloader, Ultrawork Trigger, ULW-Loop Steering | Optimize every prompt before the model processes it |
| **PreToolUse** | Git Bash MCP Recommender, ULW-Loop Goal Budget Enforcer | Guard tool execution with smart recommendations and budget limits |
| **PostToolUse** | Comment Checker, LSP Diagnostics, Project Rule Matcher | Validate every file edit for comment preservation, type correctness, and rule compliance |
| **PostCompact** | Git Bash Cache Reset, Rule Cache Reset, LSP Cache Reset | Clean up caches after context window compaction |
| **Stop** | Start-Work Continuation | Check if there's remaining planned work before the agent stops |
| **SubagentStop** | Start-Work Continuation | Same check for child agents |

### Comment Checker (PostToolUse)

One of lazyantigravity's most distinctive features. AI agents frequently delete user comments during code edits without warning. The Comment Checker catches this in real-time:

<div align="center">
  <img src="../assets/readme/comment_checker_hook.png" alt="Comment Checker" width="60%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
  <br /><em>The Comment Checker detects removed comments and alerts the agent</em>
</div>

### Prompt Amplifier (UserPromptSubmit)

Before the model even sees your prompt, the Prompt Amplifier analyzes and enriches it with:
- Constraint injection for stricter adherence
- Density scoring to warn when prompts are too vague
- Automatic context expansion from project rules

---

## 🛠️ Technical Architecture

### Gemini 3.5 Flash Optimization

<div align="center">
  <img src="../assets/readme/terminal_execution_mockup.png" alt="Terminal Execution" width="90%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
  <br /><em>lazyantigravity terminal execution — optimized for Gemini 3.5 Flash speed</em>
</div>

<br />

lazyantigravity is purpose-built for **Gemini 3.5 Flash**:

- **Sub-second inference exploitation**: Prompt hierarchies are structured to maximize throughput on Flash's rapid response cycle.
- **Smart Quota Control**: Real-time API consumption monitoring preserves cost-efficiency without halting workflows.
- **Compact Mode**: Filters redundant terminal logs and compresses to essential code snippets, optimizing token budgets dynamically.
- **Safe-Resume Checkpoints**: State freezes to `.lazycodex/checkpoints/ulw-*.json`. Resume exactly where you left off with `omo ulw-loop resume`.

### Hash-Anchored Edits (Hashline)

The "Harness Problem" — when an AI agent references stale line numbers and corrupts code — is solved:

1. Every line gets a unique content hash (`LINE#ID`) when the agent reads a file.
2. The agent targets these hashes when making edits.
3. If the file changed concurrently (another process modified it, or the agent references wrong content), the edit is **safely rejected**.
4. Result: near-0% code corruption rate.

### Reliability & Hallucination Mitigation

Gemini 3.5 Flash provides exceptional speed, but LLM hallucinations (inventing non-existent API routes, deleting comments, or hallucinating code that doesn't compile) can break builds. lazyantigravity mitigates this in 5 key ways:

1. **Evidence-Bound Loop (`ulw`)**: No task is marked "done" without captured execution evidence (passing tests, clean builds, valid HTTP response codes). Hallucinated code fails compile or runtime checks, forcing the model to self-correct.
2. **LSP Quality Gates (Static Analysis)**: Instantly runs language-server type checking (e.g., TypeScript `tsc --noEmit`) immediately after file modifications, detecting type-level hallucinations (wrong parameters, fake methods) in real-time.
3. **Comment Protection (Comment Checker)**: Monitors and prevents editing hallucinations where the model silently deletes important user comments or docstrings.
4. **Hash Anchoring (Hashline)**: Targets edits using content hashes rather than fragile, hallucination-prone line numbers, eliminating file corruption.
5. **Real-time Doc RAG (context7 MCP)**: Grounds the agent in actual facts by letting it look up official package documentation in real-time during execution instead of hallucinating from outdated training memory.

### ULW-Loop: Evidence-Audited Orchestration

The `ulw-loop` is lazyantigravity's most sophisticated workflow:

1. **Goal Decomposition**: Your request is broken into measurable success criteria (happy path, edge cases, regression guards).
2. **Evidence-Bound Steps**: Each implementation step must produce verifiable evidence before the loop advances.
3. **Steering & Revision**: Success criteria can be revised mid-flight via `omo ulw-loop steer`.
4. **Safe-Resume**: If interrupted, the exact checkpoint is preserved for seamless continuation.
5. **Model Routing**: Recommends optimal model per role — Gemini 3.5 Flash for fast iteration, Claude Opus for architecture decisions.

---

## 🧬 Heritage & Philosophy

`lazyantigravity` is not a standalone project — it was built to bring ideas and code from **multiple proven open-source projects** into the **Google Gemini model ecosystem**.

### [Ouroboros](https://github.com/Q00/ouroboros) — Agent OS

**"Stop prompting. Start specifying."** An Agent OS that addresses the root cause of AI coding failures: human ambiguity.

- **Spec-First Development**: Instead of vague prompts, Ouroboros conducts a **Socratic Spec-Interview** to quantify ambiguity (Ambiguity Score ≤ 0.2) and crystallize requirements before any code execution is permitted.
- **Seed-Bound Execution**: Every agent action is ledger-recorded and seed-bound, guaranteeing auditable and replayable execution contracts.
- **Interview → Crystallize → Execute → Evaluate → Evolve**: Evaluation results feed back into the next generation's specification — a self-evolving loop embodying the ouroboros symbol itself.
- **Ralph Persistence Loop**: A self-referential loop that keeps agents running across session boundaries. State is reconstructed from an event store, so the agent resumes exactly where it left off even after machine restarts.
- **Multi-Runtime Support**: Integrates with Claude Code, Codex CLI, OpenCode, Gemini, and more.

### [lazycodex](https://github.com/code-yeongyu/lazycodex) — Agent Harness

An **agent harness for complex codebases**, installed via [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) (OmO). It goes beyond simple prompting to bring structure and discipline to AI coding agents.

- **Lifecycle Hook System**: 7 events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostCompact`, `Stop`, `SubagentStop`) with hooks that monitor and augment every agent action.
- **Skill Registry**: A composable, keyword-triggered skill architecture. Invoke via `$name` or magic keywords.
- **oh-my-codex (OMX) Orchestration**: 20+ specialized agent catalogs (architect, executor, debugger, etc.), complexity-based model routing, and a team pipeline (`team-plan → team-prd → team-exec → team-verify → team-fix`).
- **Comment Checker**: PostToolUse hook that detects and warns when AI silently deletes user comments during edits.
- **LSP Diagnostics**: Real-time type checking and code intelligence via PostToolUse hooks.
- **Prompt Amplifier & Density Analyzer**: UserPromptSubmit hook that scores prompt density, injects constraints, and auto-expands context from project rules.
- **Project Rules Engine**: Auto-loads and enforces project-specific coding standards (AGENTS.md, .rules, etc.).
- **Two Editions**: Ultimate (for OpenCode, with Sisyphus orchestration + 54+ hooks) and Light (for Codex CLI plugins, focused on core features).

### lazyantigravity — This Project

On top of everything inherited above, lazyantigravity adds an extension layer specifically tuned for **Google Antigravity (Gemini CLI)**:

- **All-Model Support**: Compatible with all Antigravity-provided models (Gemini 3.5 Flash, Gemini 3.1 Pro, Claude Opus, Claude Sonnet). ULW Model Routing auto-recommends the optimal model per role.
- **asbrowse Visual Dashboard**: A Next.js-powered Command Center replacing terminal log chaos.
- **Hash-Anchored Edits (Hashline)**: Content hash verification eliminating the "Harness Problem" of stale line references.
- **26 Specialized Skills**: From ultraresearch swarms to visual QA to TDD workflows.
- **ulw-loop**: Evidence-audited multi-goal orchestration with safe-resume checkpoints.
- **Skill-Embedded MCPs**: On-demand MCP servers that don't permanently bloat context.

---

## 🔌 MCP Integration

lazyantigravity bundles 4 MCP (Model Context Protocol) servers:

| MCP Server | Type | Purpose |
| :--- | :--- | :--- |
| **grep_app** | Remote | GitHub code search across public repositories |
| **context7** | Remote | Official documentation lookup and query |
| **git_bash** | Local | Git operations via MCP protocol |
| **lsp** | Local | Language Server Protocol diagnostics via MCP |

Unlike standard MCP servers that permanently occupy context window space, lazyantigravity's **Skill-Embedded MCP** pattern launches servers on-demand within individual skills and terminates them when the task scope ends — keeping context lean.

---

## 📊 Telemetry & Opt-out

Once per day at session start, only a hashed identifier (`sha256("omo-codex:" + hostname)`) is transmitted. **No source code, file contents, or sensitive data is ever sent externally.**

To disable all telemetry:
```bash
export OMO_DISABLE_POSTHOG=1
export OMO_SEND_ANONYMOUS_TELEMETRY=0
```

---

## 📜 License

[MIT](../LICENSE.md) — Free for personal and commercial use.

---

<div align="center">

**Made with ❤️ by shin**

<br />

This project inherits, extends, and adapts the innovative ideas and codebases of outstanding open-source projects including **our (Ouroboros)**, **lazycodex**, **omo (oh-my-openagent)**, and **abworser (asbrowse)** to the Google Gemini model ecosystem. We express our deepest gratitude to all the creators of these frameworks.

</div>

### 🙏 Acknowledgments

This project incorporates ideas and code from the following open-source projects. Thank you.

| Project | Maintainer | Contribution |
| :--- | :--- | :--- |
| [Ouroboros](https://github.com/Q00/ouroboros) | [@code-yeongyu](https://github.com/code-yeongyu) | Agent OS, Socratic Spec-Interview, Ralph Persistence Loop |
| [lazycodex](https://github.com/code-yeongyu/lazycodex) | [@code-yeongyu](https://github.com/code-yeongyu) | Hook system, Skill registry, Comment Checker, LSP diagnostics |
| [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | [@code-yeongyu](https://github.com/code-yeongyu) | OMX orchestration, multi-agent delegation, model routing |
| [asbrowse](../skills/browse/) | — | Session browser visual dashboard |
| [insane-research](https://github.com/fivetaku/insane-research) | [@fivetaku](https://github.com/fivetaku) | ultraresearch verification gate idea (MIT) |
| [open-design](../src/packages/shared-skills/upstreams/open-design/) | — | Design system skill upstream |
| [taste-skill](../src/packages/shared-skills/upstreams/taste-skill/) | — | UI/UX taste router |
| [designpowers](../src/packages/shared-skills/upstreams/designpowers/) | — | Design power references |
| [ast-grep](https://ast-grep.github.io/) | ast-grep team | AST structural search & codemods |
| [Context7](https://context7.com/) | Context7 team | Official docs MCP server |
| [Grep.app](https://grep.app/) | Grep.app team | GitHub code search MCP server |

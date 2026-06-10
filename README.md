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
> **LAZYANTIGRAVITY** is an agent harness plugin package designed specifically for the Google Antigravity platform.
> 
> It provides complex codebase analysis, multi-agent autonomous collaboration, strict quality gate controls, and API quota overrun mitigation optimized for Google Antigravity's `invoke_subagent` flow.
>
> This project is designed to adapt robust autonomous developer workflows to the Antigravity architecture, relying on oh-my-openagent components to execute reliable, structured goals.

---

## 🚀 Install

Build and deploy the plugin components to your Google Antigravity environment with a single command:
```bash
node bin/lazyantigravity.js install
```
This script builds all underlying components (`ulw-loop`, `lsp`, `rules`, etc.) and automatically synchronizes the latest binaries and skill files to your user profile directory (`~/.gemini/config/plugins/lazyantigravity`).

---

## ⚡ Workflows & Slash Commands

Once installed, the following dedicated slash commands become immediately available inside the Antigravity developer chat UI:

### 1. `/ulw <task>` (or `/ulw-loop <task>`)
- The core autonomous workflow loop used to execute complex, multi-step tasks.
- Triggers **Autonomous Role Routing** which decomposes the task into consecutive phases handled by dedicated subagents: Planner ➡️ Researcher ➡️ Worker ➡️ Verifier ➡️ Finalizer.
- All subagents automatically inherit the model currently selected by the user in the UI (`MODEL_TIER_INHERIT`).

### 2. `/init-deep`
- Scans the codebase directory structure hierarchically and generates an `AGENTS.md` context landmark file.
- Prevents agents from losing context in massive folder structures by providing local guidance files situated near the relevant code.

### 3. CLI Commands and Safe Recovery (`omo ulw-loop`)
An internal command-line tool is shipped to help agents manage state, recover from halts, and handle errors:
```bash
# Save a state checkpoint when hitting quota limits
omo ulw-loop save-role-checkpoint --task-id <id> --platform Antigravity --selected-model <model> --completed-roles <roles> --current-role <role> --next-recommended-action <action> --resume-command <cmd>

# Safely resume execution from the checkpoint after model refresh
omo ulw-loop resume
```

---

## 🤖 Role Routing & Model Recommendations

Since Google Antigravity does not support automatic model switching via API calls, LazyAntigravity guides the user through autonomous role routing and optimal quota-aware manual model recommendations.

### 1. Subagent Role Architecture
When the `/ulw` workflow is initiated, the task is split among specialized subagents with strict sandbox constraints:

| Role | Antigravity Subagent Invocation | Objective & Responsibilities |
|---|---|---|
| **planner** | `invoke_subagent(TypeName: "self", Role: "Prometheus Planner")` | Requirements gathering, implementation checklists, and verification plan design. |
| **researcher** | `invoke_subagent(TypeName: "research", Role: "Codebase Researcher")` | Codebase code discovery and dependency relationship scanning. |
| **worker** | `invoke_subagent(TypeName: "self", Role: "Hephaestus Worker")` | Code modifications, unit test implementation, and inline error resolving. |
| **verifier** | `invoke_subagent(TypeName: "self", Role: "Oracle Reviewer")` | Diff analysis, verification pipeline execution, and static analysis/lint checks. |
| **finalizer** | Parent Agent Context Execution | Cleanup of temporary files, git commit generation, and final evidence compilation. |

### 2. Quota-Aware Model Recommendations (Session-once)
At the start of a session, optimal models are recommended to match the current quota state:
- **With sufficient Claude quota**: `Claude Opus 4.6 (Thinking)`
- **With limited Claude quota**: `Gemini 3.1 Pro (High)`
- **For extensive codebase exploration**: `Gemini 3.5 Flash (High)`
- **For rapid iterative bug fixes**: `Gemini 3.5 Flash (Medium)`

---

## 🛡️ Token & Quota Safety

A triple-layer defense mechanism is implemented to ensure work progress is never lost during token exhaustion or API rate limit events.

### 1. Safe-Resume Checkpointing
- In case of an API error, `save-role-checkpoint` is triggered immediately, saving the completed roles and changed files to `.lazycodex/checkpoints/` before pausing.
- The user can then switch the active model in the Antigravity UI dropdown and run `/ulw resume` to seamlessly pick up where the workflow left off.
- **Recommended Fallback Sequence**:
  - **Claude Opus limited**: `Gemini 3.1 Pro (High)` ➡️ `Claude Sonnet 4.6 (Thinking)` (if Sonnet quota is available) ➡️ `Gemini 3.5 Flash (High)`
  - **Claude Sonnet limited**: `Gemini 3.1 Pro (High)` ➡️ `Gemini 3.5 Flash (High)`
  - **Gemini Pro limited**: `Gemini 3.5 Flash (High)` ➡️ `Gemini 3.5 Flash (Medium)`
  - **All models exhausted**: Wait for rate-limit refresh, or manually enable `AI Credit Overages` in user settings (the agent will never enable this automatically).

### 2. Compact Mode (Context Saving)
- If `context_window_exceeded` is detected, the agent shifts to compact mode, reading only specific lines of code slices instead of printing full files.
- Role outputs are truncated to summaries (20–40 lines), and large file artifacts are referenced via local paths rather than dumped directly into the context window.

### 3. Batch Mode (Output Token Limits)
- When changes exceed the output token limits, modifications are split into multiple patch batches, verified incrementally, and checkpointed progressively.

---

## 👷 Maintainers & Support

- **LazyAntigravity** is maintained and built by **Sisyphus Labs** to preserve plugin compatibility and agent autonomy within the Google Antigravity harness environment.

## 📄 License

This project is licensed under the MIT License.

---
name: init-deep
description: "(builtin) Initialize hierarchical AGENTS.md knowledge base"
---
## Antigravity Tool Mapping (default)

This plugin defaults to **Google Antigravity**. Read `../references/antigravity-tools.md`.

| Intent | Antigravity action |
| --- | --- |
| Explore / research / plan / implement / QA / review | `invoke_subagent` + TASK/DELIVERABLE/SCOPE/VERIFY + role envelope |
| Wait / poll children | Stay in parent; re-invoke incomplete lanes |
| Child model hint | Pass `Subagents[].Model`: `flash` (plan/code/research), `pro` (verify), `flash_lite` (tiny chores), `inherit` |

Use Antigravity tools only (`invoke_subagent`). Do **not** invent foreign spawn/wait/goal APIs or OpenCode kwargs.

## Usage

```
/init-deep                      # Update mode: modify existing + create new where warranted
/init-deep --create-new         # Read existing —remove all —regenerate from scratch
/init-deep --max-depth=2        # Limit directory depth (default: 3)
```

---

## Workflow (High-Level)

1. **Discovery + Analysis** (concurrent)
   - Fire background explore agents immediately
   - Main session: bash structure + LSP codemap + read existing AGENTS.md
2. **Score & Decide** - Determine AGENTS.md locations from merged findings
3. **Generate** - Root first, then subdirs in parallel
4. **Review** - Deduplicate, trim, validate

<critical>
**TodoWrite ALL phases. Mark in_progress —completed in real-time.**
```
TodoWrite([
  { id: "discovery", content: "Fire explore agents + LSP codemap + read existing", status: "pending", priority: "high" },
  { id: "scoring", content: "Score directories, determine locations", status: "pending", priority: "high" },
  { id: "generate", content: "Generate AGENTS.md files (root + subdirs)", status: "pending", priority: "high" },
  { id: "review", content: "Deduplicate, validate, trim", status: "pending", priority: "medium" }
])
```
</critical>

---

## Phase 1: Discovery + Analysis (Concurrent)

**Mark "discovery" as in_progress.**

### Fire Background Explore Agents IMMEDIATELY

Don't wait-these run async while main session works. Dispatch ALL in one response via `invoke_subagent` (see `../references/antigravity-tools.md`).

```
invoke_subagent(prompt="""
TASK: Explore project structure. PREDICT standard patterns for detected language; REPORT deviations only.
DELIVERABLE: structure findings with paths
SCOPE: repository read-only
VERIFY: parent re-reads cited paths
ROLE ENVELOPE: mayFinalizeRun=false; mayModifyGlobalRunState=false; mustReturn=SubagentResultEnvelope; requiresParentAck=true
""")
invoke_subagent(prompt="""
TASK: Find entry points. FIND main files; REPORT non-standard organization.
DELIVERABLE: entry-point list with paths
SCOPE: repository read-only
VERIFY: parent re-reads cited paths
ROLE ENVELOPE: mayFinalizeRun=false; mayModifyGlobalRunState=false; mustReturn=SubagentResultEnvelope; requiresParentAck=true
""")
invoke_subagent(prompt="""
TASK: Find conventions. FIND config files (.eslintrc, pyproject.toml, .editorconfig); REPORT project-specific rules.
DELIVERABLE: convention findings
SCOPE: repository read-only
VERIFY: parent re-reads cited paths
ROLE ENVELOPE: mayFinalizeRun=false; mayModifyGlobalRunState=false; mustReturn=SubagentResultEnvelope; requiresParentAck=true
""")
invoke_subagent(prompt="""
TASK: Find anti-patterns. FIND 'DO NOT', 'NEVER', 'ALWAYS', 'DEPRECATED' comments; LIST forbidden patterns.
DELIVERABLE: anti-pattern list with file:line
SCOPE: repository read-only
VERIFY: parent re-reads cited paths
ROLE ENVELOPE: mayFinalizeRun=false; mayModifyGlobalRunState=false; mustReturn=SubagentResultEnvelope; requiresParentAck=true
""")
invoke_subagent(prompt="""
TASK: Explore build/CI. FIND .github/workflows, Makefile; REPORT non-standard patterns.
DELIVERABLE: build/CI findings
SCOPE: repository read-only
VERIFY: parent re-reads cited paths
ROLE ENVELOPE: mayFinalizeRun=false; mayModifyGlobalRunState=false; mustReturn=SubagentResultEnvelope; requiresParentAck=true
""")
invoke_subagent(prompt="""
TASK: Find test patterns. FIND test configs and structure; REPORT unique conventions.
DELIVERABLE: test-pattern findings
SCOPE: repository read-only
VERIFY: parent re-reads cited paths
ROLE ENVELOPE: mayFinalizeRun=false; mayModifyGlobalRunState=false; mustReturn=SubagentResultEnvelope; requiresParentAck=true
""")
```

<dynamic-agents>
**DYNAMIC AGENT SPAWNING**: After shell analysis, dispatch ADDITIONAL explore subagents based on project scale using the same `invoke_subagent` shape (large files, deep modules, shared utilities, monorepo packages, extra languages). Cap additional lanes sensibly; stay in the parent and continue concurrent analysis.
</dynamic-agents>

### Main Session: Concurrent Analysis

**While background agents run**, main session does:

#### 1. Bash Structural Analysis
```bash
# Directory depth + file counts
find . -type d -not -path '*/\\.*' -not -path '*/node_modules/*' -not -path '*/venv/*' -not -path '*/dist/*' -not -path '*/build/*' | awk -F/ '{print NF-1}' | sort -n | uniq -c

# Files per directory (top 30)
find . -type f -not -path '*/\\.*' -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -30

# Code concentration by extension
find . -type f \\( -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.go" -o -name "*.rs" \\) -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -20

# Existing AGENTS.md / CLAUDE.md
find . -type f \\( -name "AGENTS.md" -o -name "CLAUDE.md" \\) -not -path '*/node_modules/*' 2>/dev/null
```

#### 2. Read Existing AGENTS.md
```
For each existing file found:
  Read(filePath=file)
  Extract: key insights, conventions, anti-patterns
  Store in EXISTING_AGENTS map
```

If `--create-new`: Read all existing first (preserve context) —then delete all —regenerate.

#### 3. LSP Codemap (if available)
```
LspServers()  # Check availability

# Entry points (parallel)
LspDocumentSymbols(filePath="src/index.ts")
LspDocumentSymbols(filePath="main.py")

# Key symbols (parallel)
LspWorkspaceSymbols(filePath=".", query="class")
LspWorkspaceSymbols(filePath=".", query="interface")
LspWorkspaceSymbols(filePath=".", query="function")

# Centrality for top exports
LspFindReferences(filePath="...", line=X, character=Y)
```

**LSP Fallback**: If unavailable, rely on explore agents + AST-grep.

### Collect Background Results

```
// After main session analysis done, collect all task results
for each background task ID (`bg_...`): background_output(task_id="bg_...")
```

**Merge: bash + LSP + existing + explore findings. Mark "discovery" as completed.**

---

## Phase 2: Scoring & Location Decision

**Mark "scoring" as in_progress.**

### Scoring Matrix

| Factor | Weight | High Threshold | Source |
|--------|--------|----------------|--------|
| File count | 3x | >20 | bash |
| Subdir count | 2x | >5 | bash |
| Code ratio | 2x | >70% | bash |
| Unique patterns | 1x | Has own config | explore |
| Module boundary | 2x | Has index.ts/__init__.py | bash |
| Symbol density | 2x | >30 symbols | LSP |
| Export count | 2x | >10 exports | LSP |
| Reference centrality | 3x | >20 refs | LSP |

### Decision Rules

| Score | Action |
|-------|--------|
| **Root (.)** | ALWAYS create |
| **>15** | Create AGENTS.md |
| **8-15** | Create if distinct domain |
| **<8** | Skip (parent covers) |

### Output
```
AGENTS_LOCATIONS = [
  { path: ".", type: "root" },
  { path: "src/hooks", score: 18, reason: "high complexity" },
  { path: "src/api", score: 12, reason: "distinct domain" }
]
```

**Mark "scoring" as completed.**

---

## Phase 3: Generate AGENTS.md

**Mark "generate" as in_progress.**

<critical>
**File Writing Rule**: If AGENTS.md already exists at the target path —use `Edit` tool. If it does NOT exist —use `Write` tool.
NEVER use Write to overwrite an existing file. ALWAYS check existence first via `Read` or discovery results.
</critical>

### Root AGENTS.md (Full Treatment)

```markdown
# PROJECT KNOWLEDGE BASE

**Generated:** {TIMESTAMP}
**Commit:** {SHORT_SHA}
**Branch:** {BRANCH}

## OVERVIEW
{1-2 sentences: what + core stack}

## STRUCTURE
```
{root}/
?———— {dir}/    # {non-obvious purpose only}
?———— {entry}
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|

## CODE MAP
{From LSP - skip if unavailable or project <10 files}

| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|

## CONVENTIONS
{ONLY deviations from standard}

## ANTI-PATTERNS (THIS PROJECT)
{Explicitly forbidden here}

## UNIQUE STYLES
{Project-specific}

## COMMANDS
```bash
{dev/test/build}
```

## NOTES
{Gotchas}
```

**Quality gates**: 50-150 lines, no generic advice, no obvious info.

### Subdirectory AGENTS.md (Parallel)

Launch writing tasks for each location:

```
for loc in AGENTS_LOCATIONS (except root):
  invoke_subagent(prompt=`TASK: Generate AGENTS.md
DELIVERABLE: AGENTS.md content
SCOPE: target directory only
VERIFY: parent writes/edits file and re-reads
ROLE ENVELOPE: mayFinalizeRun=false; mayModifyGlobalRunState=false; mustReturn=SubagentResultEnvelope; requiresParentAck=true

    Generate AGENTS.md for: ${loc.path}
    - Reason: ${loc.reason}
    - 30-80 lines max
    - NEVER repeat parent content
    - Sections: OVERVIEW (1 line), STRUCTURE (if >5 subdirs), WHERE TO LOOK, CONVENTIONS (if different), ANTI-PATTERNS
  `)
```

**Wait for all. Mark "generate" as completed.**

---

## Phase 4: Review & Deduplicate

**Mark "review" as in_progress.**

For each generated file:
- Remove generic advice
- Remove parent duplicates
- Trim to size limits
- Verify telegraphic style

**Mark "review" as completed.**

---

## Final Report

```
=== init-deep Complete ===

Mode: {update | create-new}

Files:
  [OK] ./AGENTS.md (root, {N} lines)
  [OK] ./src/hooks/AGENTS.md ({N} lines)

Dirs Analyzed: {N}
AGENTS.md Created: {N}
AGENTS.md Updated: {N}

Hierarchy:
  ./AGENTS.md
  ?———— src/hooks/AGENTS.md
```

---

## Anti-Patterns

- **Static agent count**: MUST vary agents based on project size/depth
- **Sequential execution**: MUST parallel (explore + LSP concurrent)
- **Ignoring existing**: ALWAYS read existing first, even with --create-new
- **Over-documenting**: Not every dir needs AGENTS.md
- **Redundancy**: Child never repeats parent
- **Generic content**: Remove anything that applies to ALL projects
- **Verbose style**: Telegraphic or die

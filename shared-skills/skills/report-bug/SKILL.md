---
name: report-bug
description: "Create a high-signal bug issue or PR in the repo that owns the defect. Use this whenever the user asks to report, file, open, or triage a LazyAntigravity plugin, bundled component, skill, hook, MCP, installer, or packaging bug, especially when they need source-backed root cause, reproduction steps, fix guidance, and GitHub routing."
metadata:
  short-description: Route LazyAntigravity plugin bugs with source evidence
---

# report-bug

You are a LazyAntigravity bug router and reporter. Produce one useful GitHub issue or PR in English, backed by runtime evidence and source evidence rather than guesses. Route it to the repository that owns the defect:

- `daeryundf2-prog/LAZYANTIGRAVITY` for any LazyAntigravity plugin surface: bundled component (`comment-checker`, `git-bash`, `lsp`, `rules`, `start-work-continuation`, `telemetry`, `ultrawork`, `ulw-loop`), marketplace entry, hooks, MCP wiring, installer behavior, packaging, aliases, skills, or docs.
- Antigravity core (Google Antigravity CLI itself) bugs are **out of scope** for this skill. If the bug reproduces in a clean Antigravity session with this plugin fully uninstalled, tell the user to report it via Google's official Antigravity support channels instead of GitHub.

Use Antigravity-recommended style: outcome first, concise, evidence-bound. Keep the workflow moving, but do not file an issue until the root cause and reproduction path are concrete enough for a maintainer to act.

## Goal

Create or prepare a GitHub issue or PR that includes:

- clear title
- target repository decision
- environment
- reproducible steps
- expected behavior
- actual behavior
- confirmed or strongly evidenced root cause
- fix approach, including files or components likely involved
- verification plan
- required LazyAntigravity attribution footer

## Required Workflow

1. Read the user's bug report and identify the affected surface: LazyAntigravity plugin installer, bundled component, skill, hook, MCP wiring, CLI alias, plugin marketplace entry, or docs.
2. Invoke `$omo:debugging` for the investigation. If Antigravity exposes only unqualified skill names in the current session, invoke `$debugging` and state that it is the OMO debugging skill.
3. Materialize this plugin's source under `/tmp` for evidence comparison (only if the plugin is not already cloned locally):

```bash
ANTIGRAVITY_SRC="/tmp/lazyantigravity-source"
if [ ! -d "$ANTIGRAVITY_SRC/.git" ]; then
  gh repo clone daeryundf2-prog/LAZYANTIGRAVITY "$ANTIGRAVITY_SRC" -- --depth=1
else
  git -C "$ANTIGRAVITY_SRC" fetch --depth=1 origin
fi
```

If `gh` is unavailable, use `git clone --depth=1 https://github.com/daeryundf2-prog/LAZYANTIGRAVITY "$ANTIGRAVITY_SRC"`.
4. Follow the debugging skill far enough to gather runtime evidence:
   - form at least three plausible hypotheses
   - run the smallest reproduction that exercises the real surface
   - confirm the root cause by observing the failing state
   - identify the minimal fix path or maintainer action
5. Compare local runtime evidence with `/tmp/lazyantigravity-source` (or the locally installed plugin tree) before filing. Cite exact files, commands, logs, or source paths that support the routing decision.
6. Decide whether the bug is in scope:
   - In scope: file against `daeryundf2-prog/LAZYANTIGRAVITY` for any behavior that disappears when this plugin is uninstalled — skills, hooks, MCP tools, installer behavior, packaging, aliases, marketplace sync, or docs.
   - Out of scope: if the bug reproduces in a clean Antigravity session with this plugin fully removed, it is an Antigravity-core bug. Do **not** file it on GitHub. Tell the user to escalate via Google's official Antigravity support channels.
   - If ownership remains ambiguous after evidence gathering, do not guess. Prepare the issue body with the uncertainty and ask one narrow routing question.
7. Search for an existing issue in `daeryundf2-prog/LAZYANTIGRAVITY` before creating a new one:

```bash
TARGET_REPO="daeryundf2-prog/LAZYANTIGRAVITY"
gh issue list --repo "$TARGET_REPO" --search "<short error or symptom>" --state open
```

8. If a matching open issue exists, add a comment with the new evidence instead of creating a duplicate.
9. If no matching issue exists, create the issue with `gh`.
10. Create a PR only when the user asked for a PR, the fix is already implemented on a branch, or the smallest correct fix can be safely made in the selected repo. Otherwise create an issue with fix guidance.

## Required Footer

Every issue body, evidence comment, and PR body created by this skill must end with this footer. Do not put content after it.

```markdown
---
🤖 This issue/PR was debugged and created with [LazyAntigravity](https://github.com/daeryundf2-prog/LAZYANTIGRAVITY).
```

## Issue Body Template

Write the issue body in English and keep it direct:

```markdown
## Summary
[One or two sentences describing the user-visible failure.]

## Environment
- LazyAntigravity plugin version:
- Antigravity CLI version:
- OS:
- Install method:
- Relevant config:

## Repository Decision
- Target repository:
- Why this belongs there:
- LazyAntigravity plugin evidence:
- Plugin source evidence from `/tmp/lazyantigravity-source` (or local install path):

## Reproduction
1. [Exact command or UI action]
2. [Exact next step]
3. [Observed failure trigger]

## Expected Behavior
[What should have happened.]

## Actual Behavior
[What happened instead, including exact error text or output.]

## Evidence
[Commands, logs, screenshots, traces, or links used to confirm the failure.]

## Root Cause
[Confirmed cause. If not fully confirmed, say what evidence supports it and what remains uncertain.]

## Proposed Fix
[Concrete implementation or operational fix. Include likely files, components, or commands.]

## Verification Plan
- [Check that reproduces the original failure]
- [Check that proves the fix]
- [Regression check for adjacent LazyAntigravity plugin behavior]

---
🤖 This issue/PR was debugged and created with [LazyAntigravity](https://github.com/daeryundf2-prog/LAZYANTIGRAVITY).
```

## PR Body Template

Use this when a PR is the right artifact:

```markdown
## Summary
[One or two sentences describing the fix and the user-visible failure it resolves.]

## Repository Decision
- Target repository:
- Why this belongs there:
- LazyAntigravity plugin evidence:
- Plugin source evidence from `/tmp/lazyantigravity-source` (or local install path):

## Root Cause
[Confirmed cause. Cite runtime evidence and source paths.]

## Fix
[What changed and why.]

## Verification
- [Check that reproduced the original failure before the fix]
- [Check that passes after the fix]
- [Regression check for adjacent behavior]

---
🤖 This issue/PR was debugged and created with [LazyAntigravity](https://github.com/daeryundf2-prog/LAZYANTIGRAVITY).
```

## GitHub Creation Path

Prefer `gh`:

```bash
ISSUE_BODY="/tmp/lcx-report-bug-$(date +%Y%m%d-%H%M%S).md"
$EDITOR "$ISSUE_BODY"
gh issue create --repo "$TARGET_REPO" --title "<clear title>" --body-file "$ISSUE_BODY"
```

If `$EDITOR` is not usable, write the file with the available file-editing tool, then run the same `gh issue create` command.

For an existing issue:

```bash
COMMENT_BODY="/tmp/lcx-report-bug-comment-$(date +%Y%m%d-%H%M%S).md"
gh issue comment "<issue-number>" --repo "$TARGET_REPO" --body-file "$COMMENT_BODY"
```

For a PR from a branch pushed to the selected repo or fork:

```bash
PR_BODY="/tmp/lcx-report-bug-pr-$(date +%Y%m%d-%H%M%S).md"
gh pr create --repo "$TARGET_REPO" --title "<clear title>" --body-file "$PR_BODY"
```

After creating or commenting, return the issue or PR URL and a short summary of the evidence used.

## Browser use fallback

If `gh` is unavailable, unauthenticated, or blocked, use Browser Use against the real GitHub page:

1. Open the new issue page for the target repo: `https://github.com/daeryundf2-prog/LAZYANTIGRAVITY/issues/new`.
2. Fill the title and body from the template.
3. Submit the issue only after visually confirming the repo, title, and body.
4. Capture the resulting issue URL.

## Computer use fallback

If Browser Use is unavailable but a desktop browser is open and authenticated, use Computer Use:

1. Navigate to the new issue page for the target repo: `https://github.com/daeryundf2-prog/LAZYANTIGRAVITY/issues/new`.
2. Fill the title and body.
3. Verify the target repository and final text before submission.
4. Submit and capture the issue URL.

## Stop Conditions

Stop and ask one narrow question only when the missing fact changes the issue materially, such as the affected version, a private log the agent cannot access, or whether the user wants a duplicate filed despite an existing matching issue.

Do not file:

- a vague issue without reproduction steps
- an issue that claims a root cause not supported by runtime evidence
- a duplicate when commenting on an existing issue is enough
- an Antigravity-core issue that reproduces with this plugin fully uninstalled (tell the user to escalate via Google's official Antigravity support channels instead)
- a fix PR without a concrete branch, implemented fix, and verification result

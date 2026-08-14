---
name: rules
description: Use when the user asks about project rules, injected AGENTS.md-style instructions, supported rule file locations, matching, or environment configuration.
---

# Project Rules

Rule injection is automatic once the plugin is enabled. It injects:

- static project instructions on `SessionStart` and `UserPromptSubmit`
- matching file-specific rules after edit-like tools (`Write`, `Edit`, `apply_patch`, and equivalents)

Dynamic `PostToolUse` output is injected as additional context and is deduplicated per plugin data session. The injector does not rewrite tool output.

Supported project sources:

- `CONTEXT.md`
- `.omo/rules/**/*.md`
- `.claude/rules/**/*.md`
- `.cursor/rules/**/*.md`
- `.github/instructions/**/*.md`
- `.github/copilot-instructions.md`

Supported environment knobs (checked in this order):

- `LAZYANTIGRAVITY_RULES_DISABLED=1`
- `LAZYANTIGRAVITY_RULES_MODE=both|static|dynamic|off`
- `LAZYANTIGRAVITY_RULES_MAX_RULE_CHARS=<number>`
- `LAZYANTIGRAVITY_RULES_MAX_RESULT_CHARS=<number>`
- `LAZYANTIGRAVITY_RULES_ENABLED_SOURCES=CONTEXT.md,.omo/rules`

Legacy fallbacks: `CODEX_RULES_*`, then `PI_RULES_*`.

# LAZYANTIGRAVITY experimental skill status

**DO NOT COPY. Port and change the checked-in fixture first.** All 19 entries are unsupported in both IDE and CLI modes.

| Name | IDE | CLI | Pinned reason |
|---|---|---|---|
<!-- skill:browse -->
| `browse` | unsupported | unsupported | Browser and network workflows have not been proven against native Antigravity tools and resource boundaries. |
<!-- skill:clone -->
| `clone` | unsupported | unsupported | Session cloning depends on harness-specific conversation state that is not an Antigravity skill contract. |
<!-- skill:coding-agent-sessions -->
| `coding-agent-sessions` | unsupported | unsupported | Local coding-agent transcript stores and session APIs are platform-specific and not yet ported. |
<!-- skill:comment-checker -->
| `comment-checker` | unsupported | unsupported | Automatic post-tool file feedback requires invocation fields absent from the pinned Antigravity hook contract. |
<!-- skill:deep-interview -->
| `deep-interview` | unsupported | unsupported | Its interactive interview workflow has not been validated against the native Antigravity question surface. |
<!-- skill:eval-loop -->
| `eval-loop` | unsupported | unsupported | Its evaluator loop relies on orchestration and evidence semantics that have not been ported. |
<!-- skill:hwp-loader -->
| `hwp-loader` | unsupported | unsupported | External document conversion dependencies and resource handling are not verified for this distribution. |
<!-- skill:lcx-contribute-bug-fix -->
| `lcx-contribute-bug-fix` | unsupported | unsupported | The workflow is specific to LazyCodex and Codex upstream contribution surfaces. |
<!-- skill:lcx-doctor -->
| `lcx-doctor` | unsupported | unsupported | The health checks inspect LazyCodex and Codex installation state rather than Antigravity. |
<!-- skill:lcx-report-bug -->
| `lcx-report-bug` | unsupported | unsupported | The reporting workflow targets LazyCodex and Codex repositories with platform-specific evidence. |
<!-- skill:refactor -->
| `refactor` | unsupported | unsupported | The delegated refactor workflow still references non-native orchestration tools. |
<!-- skill:remove-ai-slops -->
| `remove-ai-slops` | unsupported | unsupported | Its parallel cleanup and reviewer workflow has not been translated to native Antigravity tools. |
<!-- skill:skill-gen -->
| `skill-gen` | unsupported | unsupported | Generated metadata, paths, and tool references have not been constrained to the pinned Antigravity skills contract. |
<!-- skill:sync-rules -->
| `sync-rules` | unsupported | unsupported | Rule synchronization currently targets Codex-specific rule locations and injection behavior. |
<!-- skill:teammode -->
| `teammode` | unsupported | unsupported | It creates and coordinates Codex threads through codex_app APIs unavailable in Antigravity. |
<!-- skill:ultimate-browsing -->
| `ultimate-browsing` | unsupported | unsupported | Stealth browser, network, and external runtime dependencies are outside the verified offline core. |
<!-- skill:ultraresearch -->
| `ultraresearch` | unsupported | unsupported | The research orchestration wrapper has not been validated against native Antigravity subagents and tools. |
<!-- skill:ulw-research -->
| `ulw-research` | unsupported | unsupported | Its maximum-saturation research workflow still depends on non-native agent and browsing surfaces. |
<!-- skill:voice-interpreter -->
| `voice-interpreter` | unsupported | unsupported | Audio tooling, external runtimes, and credential boundaries are not verified for this distribution. |

## Future-only eligible destinations

These are pinned future candidates, not current installation instructions. None of the current 19 entries is eligible to be copied to these locations.

- IDE workspace: `<workspace>/.agents/skills/<skill-folder>/`
- IDE global: `~/.gemini/config/skills/<skill-folder>/`
- CLI workspace: `<workspace>/.agents/skills/<skill-name>.md`
- CLI global: `~/.gemini/antigravity-cli/skills/<skill-name>.md`

[Main documentation](../README.md)

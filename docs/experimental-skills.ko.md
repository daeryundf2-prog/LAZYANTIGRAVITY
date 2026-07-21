# LAZYANTIGRAVITY 실험 스킬 상태

**복사하지 마십시오. 먼저 저장소에 체크인된 fixture를 포팅하고 변경해야 합니다.** 현재 19개 항목은 IDE와 CLI 모두 지원되지 않습니다.

| 이름 | IDE | CLI | 고정 사유 |
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

## 향후에만 사용할 수 있는 대상 경로

아래 경로는 고정 계약에 기록된 향후 후보일 뿐입니다. 현재 19개 중 이 경로로 복사할 자격을 충족한 항목은 없습니다.

- IDE workspace: `<workspace>/.agents/skills/<skill-folder>/`
- IDE global: `~/.gemini/config/skills/<skill-folder>/`
- CLI workspace: `<workspace>/.agents/skills/<skill-name>.md`
- CLI global: `~/.gemini/antigravity-cli/skills/<skill-name>.md`

[메인 문서](../README.md)

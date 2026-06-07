---
name: ulw
description: Shorthand alias for /ulw-loop. Triggers the full ulw-loop workflow with role routing and model recommendation.
metadata:
  short-description: "/ulw shorthand — runs ulw-loop"
---

# /ulw — ulw-loop 단축 명령

This is a thin alias for the full `ulw-loop` skill. When the user types `/ulw <task>`, execute the complete ulw-loop workflow.

## Instructions

1. Read the `ulw-loop` skill by opening `../ulw-loop/SKILL.md` with `view_file`. Follow all instructions there exactly.
2. Read `../ulw-loop/references/full-workflow.md` as the ulw-loop skill instructs.
3. Execute the full ulw-loop procedure. Do NOT stop at the alias — run the entire workflow.

## Antigravity Routing Semantics (inherited from ulw-loop)

- **Role routing**: Automatic. Work is decomposed into planner → researcher → worker → verifier → finalizer.
- **Model auto-routing**: NOT available on Antigravity. `canAutoRoute = false`.
- **Subagent model inheritance**: All subagents inherit the user's currently selected Antigravity model.
- **Model recommendation**: Display once per session, then never repeat.

### Session-once model recommendation

At the start of this session, if this is the first `/ulw` or `/ulw-loop` invocation, output this message **exactly once**:

> 💡 **Antigravity 권장 모델 구성 가이드**
> - **충분한 Claude quota 보유 시**: Claude Opus 4.6 (Thinking)
> - **Claude quota가 제한된 상태일 시**: Gemini 3.1 Pro (High)
> - **대규모 탐색 위주 작업 시**: Gemini 3.5 Flash (High)
> - **빠른 코드 수정 위주 작업 시**: Gemini 3.5 Flash (Medium)
> 
> *주의: Antigravity는 role별 모델 자동 전환을 지원하지 않으므로, 모든 하위 단계(planner, researcher, worker, verifier)는 현재 선택된 모델을 상속합니다.*

**Suppression**: If the user's message contains "조용히 실행", "추천 메시지 생략", "no model hint", or "quiet", skip this recommendation and proceed directly.

**Do not repeat**: If the recommendation was already shown in this conversation (by either `/ulw` or `/ulw-loop`), do not show it again.

### What NOT to say
- ~~auto model routing enabled~~
- ~~switching to Opus~~
- ~~verifier will use Gemini~~
- ~~researcher will use Flash~~

Use instead:
- "role routing enabled"
- "model recommendation only — subagents inherit the selected Antigravity model"

## After reading this file

Immediately proceed to read and execute the `ulw-loop` skill. This alias adds no additional steps beyond the model recommendation above.

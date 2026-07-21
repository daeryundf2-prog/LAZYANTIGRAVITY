---
name: sync-rules
description: "Rules Sync Skill: Synchronize master AI guidelines in AGENTS.md across platform-specific files like .cursorrules, CLAUDE.md, GEMINI.md, and .clinerules."
---

# $sync-rules 스킬 (Rules Sync)

`sync-rules` 스킬은 프로젝트 내의 마스터 에이전트 규칙 파일(`.agents/AGENTS.md` 또는 루트 `AGENTS.md`)의 변경 사항을 프로젝트 내의 각 에이전트 환경(Cursor, Claude Code, Gemini CLI, Cline 등)에 부합하는 설정 파일로 즉시 변환 및 동기화합니다.

## 사용법

채팅창에 `$sync-rules` 또는 `/sync-rules`를 입력하여 실행합니다.

```text
$sync-rules
```

## 동작 메커니즘
1. 로컬 환경에서 `AGENTS.md` 파일이 존재하는지 검증합니다.
2. `node <plugin-root>/skill-aliases/sync-rules/scripts/sync-agent-rules.mjs` 스크립트를 기동합니다.
3. 스크립트가 실행되면 다음 파일들이 자동 생성 및 동기화됩니다:
   - **Cursor / Windsurf**: `.cursorrules` 및 `.windsurfrules`
   - **Claude Code**: `CLAUDE.md`
   - **Gemini / Antigravity**: `GEMINI.md` 및 `.agents.md`
   - **Cline / Roo Code**: `.clinerules`
4. 동기화 성공 메시지와 갱신된 에이전트 전용 규칙 파일 리스트를 출력합니다.

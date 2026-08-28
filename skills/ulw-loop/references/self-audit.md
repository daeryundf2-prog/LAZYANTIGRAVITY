---
name: self-audit
description: "에이전트 자가 시인(잘못했어요) & 원자적 롤백 스킬. 기만 커밋, 택갈이, 엉뚱한 수정, 모델 스위칭 이탈 발생 시 최근 Trajectory Ledger를 역추적하여 안전 롤백 및 재발 방지 Gotcha를 등록합니다."
---

# Self-Audit: Agent Confession & Atomic Rollback Protocol

에이전트가 모델 스위칭(Session Drift), 컨텍스트 오염, 환각으로 인해 목표 범위를 벗어난 엉뚱한 코드를 작성하거나 기만 커밋/택갈이를 시도했을 때, 최근 N턴의 행동 궤적(Trajectory Ledger)을 강제로 역추적하여 오염된 변경 사항을 자백받고 `git` 기반으로 안전하게 롤백(Rollback)하는 스킬입니다.

```mermaid
flowchart TD
    Trigger["에이전트 기만/오염 감지 ('잘못했어요' / $self-audit)"] --> Trace["1. Trajectory Ledger & Git Diff 역추적<br/>(최근 N개 턴 수정 파일 및 커밋 스캔)"]
    Trace --> Confess["2. 자가 시인 및 영향도 분석<br/>- 목표 이탈 파일 목록 분리<br/>- 오염된 변경 사항 명세"]
    Confess --> Rollback["3. 원자적 롤백 실행<br/>git reset / git restore로 깨끗한 상태 복원"]
    Rollback --> Register["4. 재발 방지 Gotcha 영속화<br/>~/.gemini/facts.jsonl 또는 .omo/rules 기록"]
    Register --> Realign["5. 올바른 목표(Goal Vector) 재정렬 후 재시작"]
```

---

## 4-Step Self-Audit Protocol

### Step 1: Trajectory Ledger & Git Diff 역추적
최근 커밋과 워킹 트리의 변경 사항을 전수 스캔하여 오염된 파일과 정상 파일을 분류합니다.

```bash
# 최근 커밋 및 변경된 파일 목록 확인
git log -n 5 --stat --oneline
git status --short
```

### Step 2: Confession & Impact Isolation (자가 시인 보고)
에이전트는 변명이나 메타 발언(*"흥미롭군요"*, *"That's interesting"*) 없이 다음 3가지 항목을 즉시 자백합니다:
1. **이탈 원인**: (예: 모델 스위칭으로 인한 지시 유실, 목표 범위 외 전역 리팩토링 시도 등)
2. **오염된 파일 목록**: 태스크 범위 밖에서 임의로 수정/삭제된 파일 경로
3. **손실 없는 복구 지점**: 안전한 베이스라인 커밋 SHA

### Step 3: Atomic Rollback (원자적 롤백)
오염된 워킹 트리 또는 최근 잘못된 커밋을 안전하게 취소하고 원 상태로 복구합니다.

```bash
# 워킹 트리 내 잘못된 수정 파일 전체 복원
git restore .

# 잘못된 최근 커밋 안전 취소 (커밋만 되돌리고 변경분 확인 시 --soft, 완전 취소 시 --hard)
git reset --hard HEAD~1

# 특정 파일만 이전 상태로 복구
git checkout HEAD -- <polluted_file_path>
```

### Step 4: Gotcha Persistence (재발 방지 팩트 영속화)
동일한 실수가 반복되지 않도록 액티브 메모리에 실패 패턴과 주의사항(Gotcha)을 기록합니다.

```
invoke_subagent(
  Subagents=[
    {
      TypeName: "self",
      Role: "Audit Ledger Recorder",
      Model: "flash",
      Prompt: "TASK: Record the audit findings and rollback reason into facts.jsonl.\nDELIVERABLE: verified fact entry preventing identical drift."
    }
  ],
  toolAction: "Recording self-audit ledger",
  toolSummary: "Self-audit ledger persistence"
)
```

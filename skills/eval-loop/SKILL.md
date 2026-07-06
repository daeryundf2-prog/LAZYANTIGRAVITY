---
name: eval-loop
description: "Agent Evaluation & Benchmark Loop: Automate dataset collection, run test inputs, grade output quality (LLM-as-judge), group failure patterns, and refine prompts."
---

# $eval-loop 스킬 (Agent Evaluation & Benchmark Loop)

`eval-loop` 스킬은 구글의 `google/agents-cli` 모범 사례와 평가 메커니즘을 템플릿화하여 에이전트의 프롬프트와 동작 신뢰성을 정량적으로 측정하고 개선하도록 돕습니다.

## 사용법

채팅창에 `$eval-loop` 혹은 `/eval-loop`를 입력하고 평가 대상 에이전트 또는 프롬프트 파일 경로를 지정합니다.

```text
$eval-loop
"scripts/prompt-amplifier.mjs 의 시스템 지침 파이프라인에 대해 20개의 테스트 케이스를 구축하고 Gemini 3.5 Flash 환경에서 평가를 구동해줘"
```

## 평가 파이프라인 (Evaluation Pipeline)

이 스킬이 구동되면 에이전트는 다음 5단계를 거쳐 체계적인 에이전트 품질 게이트 평가 및 튜닝을 수행합니다.

### 1단계: 테스트 데이터셋 빌드 (Dataset Scaffolding)
- 평가 대상 스킬 또는 에이전트가 처리해야 하는 **입력(Inputs)**과 기대하는 **최적의 기준 답안(Ground Truth/Expected Outputs)**을 포함한 테스트 데이터셋을 구성합니다.
- 코너 케이스, 모호한 프롬프트, 비정상 입력을 포함한 **Adversarial(적대적) 데이터셋**도 최소 20% 이상 확보합니다.

### 2단계: 에이전트 다회차 실행 (Batch Execution)
- 타겟 에이전트 또는 프롬프트 규칙 세트를 사용해 구성한 테스트 데이터셋을 반복적으로 실행하여 결과를 수집합니다.
- 각 실행 결과를 독립된 로그 파일에 저장하고 누적 소모 토큰 및 응답 시간을 정밀 측정합니다.

### 3단계: LLM 판정관 기반 채점 (LLM-as-Judge Grading)
- 사람이 매번 손으로 결과를 매기는 대신, 독립된 지식 모델(예: `self` 서브에이전트)을 판정관(Judge)으로 기동하여 점수를 판정합니다.
- 평가 기준 항목:
  - **정확성 (Accuracy)**: 기준 답안과의 정렬도 (1~5점)
  - **지침 준수도 (Constraint Adherence)**: 금지 규칙 및 포맷 강제 규칙 준수 여부 (P/F)
  - **슬롭 감지 (Slop Detection)**: 무의미한 부가설명이나 불필요한 마크다운 장식이 없는지 여부 (P/F)

### 4단계: 실패 패턴 분류 및 분석 (Failure Mode Categorization)
- 감점되거나 준수에 실패한 결과들을 그룹핑하여 실패 원인(Failure Modes)을 자동 분류합니다 (예: "컨텍스트 유실", "부적절한 예외 처리", "출력 형식 이탈").
- 버전을 비교하는 A/B 테스트 성적표를 마크다운 리포트로 작성합니다.

### 5단계: 프롬프트 자동 다듬기 (Refinement Iteration)
- 분석된 실패 원인을 개선할 수 있도록 타겟 프롬프트나 스키마 가이드의 취약 부분을 자동으로 보강하고 보정(Tuning)합니다.
- 다듬어진 프롬프트로 2단계부터 다시 가동하는 자가 피드백 루프를 반복하여 최종 성공률을 높입니다.

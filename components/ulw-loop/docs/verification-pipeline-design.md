# 3-Stage Verification Pipeline Design

이 문서는 Ouroboros의 3단계 검증 파이프라인(Mechanical → Semantic → Consensus)을 LazyAntigravity의 `quality-gate.ts` 및 역할(Role) 프롬프트에 이식하기 위한 설계안입니다.

## 1. 개요
기존 `quality-gate.ts`는 단일 `Verifier`가 AI Slop 제거, 코드 리뷰, 요구사항 충족 여부를 한 번에 검증합니다. 
이를 Ouroboros의 3단계 파이프라인으로 확장하여 비용을 절감하고, 검증의 신뢰도(특히 고위험 변경 사항)를 높입니다.

## 2. 파이프라인 구성

### Stage 1: Mechanical Verification (비용 최소화 단계)
- **주체**: 자동화된 훅(Hook) 또는 매우 가벼운 모델(Gemini 3.5 Flash).
- **작업**: 문법 오류(Syntax Error), 린트(Lint) 통과, 빌드(Build) 성공, 타입(Type) 체크를 수행.
- **로직**:
  - `filesChanged`가 감지되면 TypeScript의 경우 `tsc --noEmit` 또는 Biome 체크를 자동으로 실행.
  - 이 단계에서 에러가 발생하면 모델의 의미론적 판단을 거치지 않고 곧바로 **FAIL** 처리 및 Worker에게 피드백 반환.
- **장점**: 모델 API 호출 비용 없이 기계적으로 잡아낼 수 있는 에러를 조기에 차단.

### Stage 2: Semantic Verification (표준 리뷰 단계)
- **주체**: 일반 `Verifier` 모델 (예: Gemini 3.1 Pro).
- **작업**: Mechanical 검증을 통과한 코드에 대해 기능적 요구사항(Success Criteria)을 충족하는지 의미론적으로 리뷰.
- **로직**:
  - 코드가 `objective`를 어떻게 달성했는지, `evidence`가 유효한지 평가.
  - 보안 취약점, AI Slop 포함 여부 체크.

### Stage 3: Deliberative Consensus (고위험/심층 리뷰 단계)
- **주체**: 최고 성능 모델(예: Claude Opus 4.6 Thinking) 또는 다중 페르소나 앙상블.
- **작업**: 핵심 비즈니스 로직 수정, 아키텍처 변경 등 고위험 변경 시 작동.
- **로직**:
  - **Advocate**: 이 변경사항이 어떻게 문제를 완벽히 해결하는지 주장.
  - **Devil's Advocate**: 이 변경사항이 근본 원인(Root Cause)을 해결하지 못한 단순 미봉책(Band-aid)일 가능성과 잠재적 부작용(Side Effect)을 비판.
  - **Judge**: 두 주장을 종합하여 최종 승인(`UNCONDITIONAL APPROVAL`) 또는 기각 결정.
- **장점**: AI의 거짓 양성(False Positive, 안 되는데 된다고 착각하는 현상)을 다중 페르소나의 논리적 충돌을 통해 극복.

## 3. 구현 마일스톤 (추후 적용)
1. `ulw-loop` Skill 프롬프트 내에 `Devil's Advocate` 페르소나 추가.
2. `quality-gate.ts`의 스키마를 `mechanical`, `semantic`, `consensus` 필드로 분리.
3. Hook을 활용해 Stage 1 자동화 트리거 추가.

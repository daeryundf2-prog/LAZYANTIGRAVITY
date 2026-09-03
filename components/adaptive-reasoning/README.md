# adaptive-reasoning


## How it works (from the former adaptive-reasoning skill)

# Adaptive-Reasoning: Dynamic Thinking Budget & AST Skeletonizer

Gemini 3.7 Flash/Pro의 하이브리드 추론 능력을 극대화하기 위해, 작업 복잡도에 따라 Thinking Budget(0, 8k, 32k, 64k)과 모델 티어(Tier 1/2/3)를 동적으로 스케일링하고, 대용량 파일은 AST 스켈레토나이저로 함수 본문을 제거하여 컨텍스트를 80% 압축하는 스킬입니다.

```mermaid
flowchart TD
    Task["작업 요청 및 프롬프트"] --> Classify["복잡도 & 위험도 분류"]
    Classify --> T1["Tier 1: Fast & Lean (Budget: 0, Model: 'flash_lite')<br/>단순 조회, 린트 수정"]
    Classify --> T2["Tier 2: Standard Workhorse (Budget: 8k~32k, Model: 'flash')<br/>표준 구현, 리팩토링, Flaky Guard"]
    Classify --> T3["Tier 3: Deep Adversarial (Budget: 64k, Model: 'pro')<br/>보안 감사, 동시성 검증, 아키텍처 가설 반증"]

    File["대형 파일 분석"] --> Skele["AST Skeletonizer<br/>(scripts/ast-skeletonizer.mjs)"]
    Skele --> Compress["타입/시그니처만 로딩 (80% 절감)"]
```

---

## 3-Tier Adaptive Reasoning Routing

### 1. Tier 1: Fast & Lean (Low Complexity)
* **적용**: 단순 파일 조회, 오타 수정, 빠른 상태 체크
* **할당**: `Model: "flash_lite"`, `Thinking Budget: 0`

### 2. Tier 2: Standard Workhorse (Standard/High Complexity)
* **적용**: 기능 구현, 단위 테스트 작성, multi-agent ULW 오케스트레이션, UI Loopback
* **할당**: `Model: "flash"`, `Thinking Budget: 8,192 ~ 32,768`

### 3. Tier 3: Deep Adversarial (Mission-Critical / High Stakes)
* **적용**: 보안 침투 감사, 비동기 락 경합 격리, 클린 아키텍처 드리프트 방지
* **할당**: `Model: "pro"`, `Thinking Budget: 64,000`

---

## AST Skeletonizer Usage

대형 소스 코드를 에이전트 컨텍스트에 로드할 때 함수 구현부를 제외한 시그니처만 추출합니다:

```bash
# 파일 스켈레톤 추출 및 출력
node ~/.gemini/config/plugins/lazyantigravity/scripts/ast-skeletonizer.mjs src/services/auth.ts
```

---

## Med-Gemini Uncertainty-Guided Search (Section 4.3)

Google DeepMind Med-Gemini 연구 기반의 **불확실성 및 다중 경로 엔트로피 측정 기반 검색 트리거(Uncertainty-Guided Search Trigger)**:

1. **에피스테믹 불확실성(Epistemic Uncertainty) 평가**:
   - 시간 민감 정보(최신 버전/릴리즈), 고위험 법령/판례, CVE 취약점, 수치 벤치마크, 모호성 표현을 감지하여 0.0~1.0 불확실성 점수를 계산.
   - 점수 >= 0.50 시 자동으로 `<uncertainty-guided-search>` 디렉티브를 주입하여 파라메트릭 메모리 과신을 금지하고 검색 도구 호출을 강제.
2. **다중 추론 경로 엔트로피(Multi-Path Entropy) 측정**:
   - 여러 가설/추론 경로(`hypotheses`) 간의 섀넌 엔트로피(Shannon Entropy) 및 상반 결론(Polarity Contradiction)을 측정.
   - 엔트로피 >= 0.40 또는 상반 결론 감지 시 외부 검색을 즉시 발동하여 타이 브레이킹(Tie-breaking) 및 팩트 그라운딩 수행.

```bash
# 단일 프롬프트 불확실성 평가
lazyantigravity-adaptive-reasoning uncertainty "React 19 최신 릴리즈 API 변경점"

# 다중 추론 경로 엔트로피 측정
lazyantigravity-adaptive-reasoning entropy "가설 1: 성립함" "가설 2: 불성립함 (기각)"
```


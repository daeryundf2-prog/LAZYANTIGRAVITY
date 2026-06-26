# lazyantigravity

`lazyantigravity`는 Google Antigravity 및 OpenAI Codex CLI 환경에서 에이전트의 워크플로우를 극대화하기 위한 통합 플러그인 저장소입니다. 특히 **Gemini 모델 패밀리의 거대한 컨텍스트 창과 멀티모달 역량에 최적화**되어 있으며, 여러 하네스 컴포넌트(`components/`)들을 하나의 네임스페이스로 통합하여 강력한 자율 코딩 및 검증을 제공합니다.

---

## 🎮 사용자 가이드: 핵심 명령어 및 키워드

사용자가 에이전트 터미널에서 입력하거나 프롬프트에 포함하여 특정 자율 기능을 트리거할 수 있습니다.

### 1. CLI 명령어

| 명령어 | 설명 |
| :--- | :--- |
| **`ultrawork`** (또는 **`ulw`**) | 최강의 에이전트 자율 루프를 실행합니다. 계획 수립, 코드 수정, 테스트 및 빌드 검증이 완료될 때까지 스스로 단계를 밟아가며 반복 수행합니다. (Gemini 대용량 컨텍스트 기반의 일괄 대규모 변경 최적화) |
| **`ultraresearch`** (또는 마법 키워드 **`research`**) | 지식 탐색 오케스트레이터를 기동합니다. 코드베이스, 웹 문서, 오픈소스 저장소를 병렬 수집하고 로컬 코드 실행 검증을 거쳐 보고서를 작성합니다. |
| **`browse`** (또는 **`$browse`**) | 세션 브라우저(asbrowse)를 기본 웹 브라우저에서 실행하고 엽니다. 로컬 Next.js 대시보드를 연동하여 실시간 빌드/테스트 진척도, 코드 Diff, task.md 목록을 미려한 UI로 탐색합니다. (Next.js 백그라운드 서버가 꺼져 있을 경우 `$browse` 실행 시 자동 기동 및 포트 3000 바인딩) |
| **`/ulw-loop`** |  증거 감사(Evidence Audit) 기반의 영속 멀티 골 오케스트레이션 루프를 실행합니다. |
| **`/init-deep`** | 프로젝트 및 디렉토리 구조에 맞는 계층형 `AGENTS.md` 컨텍스트 파일을 자동 생성합니다. 토큰 효율과 에이전트의 도메인 이해도를 대폭 향상시킵니다. |
| **`/start-work`** | Prometheus 플래너가 기동되어 코드를 수정하기 전에 인터뷰 모드로 작업의 모호성을 해소하고 세부 계획을 수립합니다. |

---

## ⚙️ 설치 및 사용 방법 (Installation & Usage)

### 1. macOS, Linux, Git Bash
터미널을 열고 Gemini config 플러그인 디렉터리로 이동하여 깃 저장소를 클론합니다:
```bash
mkdir -p ~/.gemini/config/plugins
cd ~/.gemini/config/plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

### 2. Windows PowerShell
```powershell
mkdir $env:USERPROFILE\.gemini\config\plugins -Force
cd $env:USERPROFILE\.gemini\config\plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

설치 또는 업데이트 후 Google Antigravity를 재시작하면 `/ulw` 및 `/ulw-loop` 명령어가 에이전트에 자율 주입되어 정상 가동됩니다.

---

## 🛠️ 기능적 상세 설명 (Technical Details)

### 1. 대시보드 세션 브라우저 (asbrowse)

에이전트의 워크플로우 진행 상태와 빌드 경과를 고급스러운 그래픽과 레이아웃으로 관찰할 수 있는 웹 기반 뷰어입니다.

![LazyAntigravity Session Browser 실행 화면](assets/readme/lazyantigravity-ulw-running.png)

*   **정보 구조(IA) 및 시각 피드백**: 텍스트 과부하를 해소하고 에이전트의 진행 상태, Prometheus 계획, `task.md` 할 일 목록과 미세한 코드 Diff 내역을 터미널 정보 과부하 없이 로컬 Next.js 대시보드로 실시간 렌더링합니다.
*   **고품격 어두운/시안 미학 (Dark + Cyan)**: `DESIGN.md` 명세를 충실히 반영하여 HSL 기반의 다크 그레이 배경, 포인트 시안 컬러, Geist 타이포그래피, 그리고 부드러운 트랜지션 모션 Primitives를 결합하여 개발용 커맨드 센터 스타일의 프리미엄 UI를 제공합니다.
*   **백그라운드 자동 기동**: `$browse` 명령 호출 시, 로컬 3000 포트 활성 여부를 감지하여 필요 시 백그라운드로 Next.js 개발 서버를 자동 기동하고 브라우저를 열어줍니다.

### 2. 핵심 컴포넌트 (Components)
*   **`ultrawork` & `ulw-loop`**: 성공 기준 수립, 검증 채널 구축, 쿼터 제한 자율 대응 체크포인트를 포함하는 다중 목표 오케스트레이션 코어.
*   **`rules`**: 프로젝트 루트의 `AGENTS.md` 및 가이드라인 파일을 파싱하여 세션 시작 및 도구 호출 시점에 주입하는 규칙 엔진.
*   **`lsp`**: 에이전트에게 코드 정의(Definitions), 참조(References), 진단(Diagnostics)을 제공하는 LSP 기반 MCP 도구.
*   **`comment-checker`**: 도구 호출 이후 불필요한 주석 생성이나 변경을 감지하고 피드백을 방출하는 주석 품질 관리 도구.
*   **`telemetry`**: 일일 활성 이벤트 및 빌드 익명 텔레메트리 수집 컴포넌트.

### 3. Gemini 모델 최적화 개편
*   **초거대 컨텍스트 활용**: Gemini 모델의 대용량 컨텍스트 윈도우 특성을 능동 반영하여 프롬프트의 계층 구조를 효율적으로 재구성했습니다.
*   **동적 라우팅 및 폴백**: API 쿼터 상황을 자동 모니터링하여 가용한 고지능 모델(Pro)과 비용 효율적인 모델(Flash) 간의 전환 가이드를 내장하고 유연하게 폴백합니다.

### 4. 프론트엔드 진단 및 시각 QA
*   **프론트엔드 분석**: `react-scan` 및 `react-doctor`를 통합하여 렌더링 병목과 React 안티패턴을 감지합니다.
*   **픽셀 단위 시각 QA & Lighthouse**: Playwright Chromium을 기동해 픽셀 디프(Pixel Diff) 분석으로 UI 정렬 오류와 글자 잘림을 검사하고, Lighthouse Core Web Vitals 100점 점수를 만족할 때까지 자율 검증을 거칩니다.

### 5. 토큰 및 쿼터 안전 기능 (Token & Quota Safety)
*   **Safe-Resume Checkpoints**: 오류 발생 시 `save-role-checkpoint`가 실행되어 `.lazycodex/checkpoints/ulw-*.json` 파일에 컨텍스트를 동결합니다. 다른 가용 모델로 전환한 후 `omo ulw-loop resume`을 통해 중단 시점부터 작업을 계속할 수 있습니다.
*   **Compact & Batch Mode**: `context_window_exceeded` 상황에서 긴 로그를 필터링하고 코드의 슬라이스 단위만 노출하여 토큰을 긴축합니다. 대량 패치 시 작업을 단위 배치로 쪼개 순차 실행합니다.

### 6. 텔레메트리 및 수집 거부 (Opt-out)
하루에 한 번 세션 시작 시 `sha256("omo-codex:" + hostname)` 형태로 해시된 식별자만 전송하며, 소스 코드 및 민감 데이터는 외부로 절대 전송되지 않습니다.
비활성화하려면 아래 환경변수를 설정하세요:
```bash
export OMO_DISABLE_POSTHOG=1
export OMO_SEND_ANONYMOUS_TELEMETRY=0
```

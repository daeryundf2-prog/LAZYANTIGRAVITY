<div align="center">

# 🌌 lazyantigravity

**Next-Gen Agent Orchestration & Interactive Session Command Center**
<br />
Google Antigravity 및 OpenAI Codex CLI 환경을 위한 최상위 에이전트 오케스트레이터 및 시각 브라우저 플러그인.

---

[![Gemini 3.5 Flash Optimized](https://img.shields.io/badge/Gemini%203.5%20Flash-Optimized-00d4ff?style=flat-square&logo=google-gemini&logoColor=white)](https://gemini.google.com)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?style=flat-square&logo=bun&logoColor=black)](https://bun.sh)
[![License](https://img.shields.io/badge/License-MIT-white?style=flat-square)](./LICENSE.md)

</div>

---

## 💡 Why lazyantigravity?

에이전트가 코드를 작성하는 동안, 수백 줄의 터미널 텍스트 스크롤에 지치셨나요? 
`lazyantigravity`는 터미널의 정보 과부하를 극복하고 에이전트의 개발 전 과정을 완벽한 정보 위계(IA) 속에서 추적할 수 있도록 돕습니다.

*   **Gemini 3.5 Flash Hyper-Context Optimization**: Gemini 3.5 Flash 모델의 초거대 컨텍스트 창과 압도적인 추론 속도를 백분 활용하도록 설계된 프롬프트 엔진.
*   **Visual Command Center (asbrowse)**: 코딩 진행 상황, 변경 Diff, 터미널 로그, 그리고 Playwright 시각 QA를 미려한 GUI 대시보드로 실시간 브라우징.
*   **Zero-Configuration Automation**: 간단한 명령어 `$browse` 하나로 백그라운드 웹 서버 기동부터 브라우저 탭 오픈까지 논스톱 수행.

---

## 📸 Interactive Session Dashboard (asbrowse)

`DESIGN.md` 명세를 철저히 반영하여 디자인된 Senior Engineer's Command Center 스타일의 웹 대시보드입니다. HSL 기반의 세련된 다크 모드 배경과 시안(Cyan) 포인트 액센트, Geist 타이포그래피가 적용되었습니다.

<div align="center">
  <img src="assets/readme/lazyantigravity-ulw-running.png" alt="Session Browser Dashboard Preview" width="90%" style="border-radius: 8px; border: 1px solid #262626;" />
</div>

---

## ⚡️ Quick Start & Installation

### 1. 플러그인 클론 (Git Clone)

#### macOS, Linux, Git Bash
```bash
mkdir -p ~/.gemini/config/plugins
cd ~/.gemini/config/plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

#### Windows PowerShell
```powershell
mkdir $env:USERPROFILE\.gemini\config\plugins -Force
cd $env:USERPROFILE\.gemini\config\plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

### 2. 세션 브라우저 기동
설치 또는 업데이트 후 에이전트를 재시작하고, 터미널 세션 내부에서 아래 명령어를 실행하십시오:
```bash
$browse
```
*(웹 서버 포트 3000이 활성화되어 있지 않으면 백그라운드로 Next.js 개발 서버를 자동 기동한 뒤 대시보드 브라우저 탭이 자동 팝업됩니다.)*

---

## 🎮 Core Commands

에이전트 터미널에서 즉시 입력하거나 프롬프트에 포함할 수 있는 핵심 제어 명령어 목록입니다.

| Command | Action | Key Benefit |
| :--- | :--- | :--- |
| **`ultrawork`** (또는 `ulw`) | 최강의 에이전트 자율 루프 구동 | 성공 기준이 100% 충족될 때까지 멈추지 않고 스스로 단계를 밟아가며 코딩과 검증을 반복합니다. (Gemini 3.5 Flash의 빠른 피드백 루프 극대화) |
| **`ultraresearch`** | 지식 탐색 오케스트레이션 스웜 기동 | 코드베이스, 웹 문서, 오픈소스 저장소를 병렬 수집하고 실제 로컬 코드 실행 검증을 거쳐 보고서를 냅니다. |
| **`browse`** (또는 `$browse`) | 세션 브라우저(asbrowse) 오픈 | Next.js 로컬 대시보드와 실시간 연동하여 작업 진행도, 코드 Diff, task.md 할 일을 GUI로 탐색합니다. |
| **`/init-deep`** | 계층형 `AGENTS.md` 자동 생성 | 프로젝트 구조에 최적화된 컨텍스트를 자동 설계하여 토큰 효율을 극대화합니다. |
| **`/start-work`** | Prometheus 계획 수립 | 코드 수정 전 모호함을 해소하기 위한 소크라테스식 인터뷰를 시작합니다. |

---

## 🛠️ Technical Architectural Details

### 🌌 1. Gemini 3.5 Flash Optimization
*   Gemini 3.5 Flash 모델의 초거대 컨텍스트 윈도우 특성을 능동 반영하여 프롬프트의 계층 구조를 효율적으로 재구성했습니다.
*   API 쿼터 상황을 자동 모니터링하여 Gemini 3.5 Flash 환경의 성능을 비용 효율적으로 보존하고 에이전트의 토큰 소모를 영리하게 통제합니다.
*   컴파일 에러나 긴 빌드 로그가 컨텍스트 윈도우를 과포화하지 않도록 핵심 코드 조각만 압축 요약해 전송하는 Compact Mode가 내장되어 있습니다.

### 🎨 2. Frontend Diagnostics & Visual QA
*   **프론트엔드 분석**: `react-scan` 및 `react-doctor`를 통합하여 렌더링 병목과 React 안티패턴을 감지합니다.
*   **픽셀 단위 시각 QA & Lighthouse**: Playwright Chromium을 기동해 픽셀 디프(Pixel Diff) 분석으로 UI 정렬 오류와 글자 잘림을 검사하고, Lighthouse Core Web Vitals 100점 점수를 만족할 때까지 자율 검증을 거칩니다.

### 🛡️ 3. Token & Quota Safety
*   **Safe-Resume Checkpoints**: 오류 발생 시 `save-role-checkpoint`가 실행되어 `.lazycodex/checkpoints/ulw-*.json` 파일에 컨텍스트를 동결합니다. 다른 가용 모델로 전환한 후 `omo ulw-loop resume`을 통해 중단 시점부터 작업을 계속할 수 있습니다.
*   **Compact & Batch Mode**: `context_window_exceeded` 상황에서 긴 로그를 필터링하고 코드의 슬라이스 단위만 노출하여 토큰을 긴축합니다. 대량 패치 시 작업을 단위 배치로 쪼개 순차 실행합니다.

---

## 📊 Telemetry & Opt-out

하루에 한 번 세션 시작 시 `sha256("omo-codex:" + hostname)` 형태로 해시된 식별자만 전송하며, 소스 코드 및 민감 데이터는 외부로 절대 전송되지 않습니다.
비활성화하려면 아래 환경변수를 설정하세요:

```bash
export OMO_DISABLE_POSTHOG=1
export OMO_SEND_ANONYMOUS_TELEMETRY=0
```

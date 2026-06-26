<div align="center">

# 🌌 lazyantigravity

**"Stop Staring at the Boring Terminal Logs."**
<br />
Gemini 3.5 Flash의 압도적인 속도와 세련된 시각 Command Center(asbrowse)가 결합된 차세대 AI 에이전트 오케스트레이터.

---

[![Gemini 3.5 Flash Optimized](https://img.shields.io/badge/Gemini%203.5%20Flash-Optimized-00d4ff?style=flat-square&logo=google-gemini&logoColor=white)](https://gemini.google.com)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?style=flat-square&logo=bun&logoColor=black)](https://bun.sh)
[![License](https://img.shields.io/badge/License-MIT-white?style=flat-square)](./LICENSE.md)
[![GitHub Stars](https://img.shields.io/github/stars/daeryundf2-prog/LAZYANTIGRAVITY?style=flat-square&color=ffcb47&labelColor=black)](https://github.com/daeryundf2-prog/LAZYANTIGRAVITY/stargazers)

<br />
<h3>
  <a href="src/README.md">🌐 English Detail Guide</a> 
  • 
  <a href="src/README.ko.md">🇰🇷 한국어 상세 가이드</a>
</h3>

</div>

---

## 🌟 이 프로젝트가 도움되셨다면 Star를 눌러주세요!
`lazyantigravity`는 더 세련되고 고도화된 에이전트 환경을 위해 지속해서 업데이트됩니다. 상단의 ⭐ **Star** 버튼을 눌러 개발팀을 응원하고 프로젝트의 유입을 도와주세요!

---

## 💡 Why lazyantigravity?

에이전트가 코딩을 수행하는 동안, 쏟아지는 수백 줄의 터미널 텍스트 로그에 압도되어 피로하셨나요? 
`lazyantigravity`는 기존의 낡고 복잡한 개발 플러그인을 완전히 오버홀하여, 극도의 사용성과 미학적 만족감을 제공합니다.

*   **⚡️ Gemini 3.5 Flash 완벽 튜닝**: Pro 모델 대비 최대 10배 빠른 추론 속도와 압도적인 가성비를 살려, 에이전트의 반복적인 빌드 및 디버깅 루프를 초고속으로 제어합니다.
*   **🖥️ asbrowse (Interactive Dashboard)**: 에이전트의 상태, 진행률, 변경된 코드 Diff, 실시간 터미널 로그를 미려한 GUI 화면으로 시큐어하게 브라우징합니다.
*   **🛡️ Hashline Edit (안전한 수술적 편집)**: 낡은 라인을 참조해 에이전트가 코드를 파괴하는 현상(Harness Problem)을 0%에 가깝게 차단하는 콘텐츠 해시 검증 엔진을 탑재했습니다.

---

## 📸 Interactive Session Dashboard (asbrowse)

`DESIGN.md` 명세를 철저히 반영하여 디자인된 Senior Engineer's Command Center 스타일의 웹 대시보드입니다. HSL 기반의 세련된 다크 모드 배경과 시안(Cyan) 포인트 액센트, Geist 타이포그래피가 적용되었습니다.

<div align="center">
  <img src="assets/readme/asbrowse_dashboard_mockup.png" alt="Session Browser Dashboard Preview" width="90%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

---

## ⚡️ Quick Start & Installation

단 10초 만에 로컬 환경에 차세대 에이전트 지휘 본부를 구축하세요.

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
| **`ultrawork`** (또는 `ulw`) | 최강의 에이전트 자율 루프 구동 | 성공 기준이 100% 충족될 때까지 스스로 코딩과 검증을 반복합니다. (Gemini 3.5 Flash의 빠른 피드백 루프 극대화) |
| **`ultraresearch`** | 지식 탐색 오케스트레이션 스웜 기동 | 코드베이스, 웹 문서, 오픈소스 저장소를 병렬 수집하고 실제 로컬 코드 실행 검증을 거쳐 보고서를 냅니다. |
| **`browse`** (또는 `$browse`) | 세션 브라우저(asbrowse) 오픈 | Next.js 로컬 대시보드와 실시간 연동하여 작업 진행도, 코드 Diff, task.md 할 일을 GUI로 탐색합니다. |
| **`/init-deep`** | 계층형 `AGENTS.md` 자동 생성 | 프로젝트 구조에 최적화된 컨텍스트를 자동 설계하여 토큰 효율을 극대화합니다. |
| **`/start-work`** | Prometheus 계획 수립 | 코드 수정 전 모호함을 해소하기 위한 소크라테스식 인터뷰를 시작합니다. |

---

## 🛠️ Technical Architectural Details

### ⚡️ 1. Gemini 3.5 Flash Optimization
`lazyantigravity`는 **Gemini 3.5 Flash** 모델의 서브 세컨드 수준의 빠른 추론 속도와 초거대 컨텍스트 윈도우 특성을 능동 반영하여 프롬프트의 계층 구조를 최적화했습니다.

<div align="center">
  <img src="assets/readme/terminal_execution_mockup.png" alt="Terminal Command Execution" width="90%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

*   **스마트 쿼터 제어**: API 쿼터 상황을 실시간 모니터링하여 Gemini 3.5 Flash 환경의 성능을 비용 효율적으로 보존하고 에이전트의 토큰 소모를 영리하게 통제합니다.
*   **Compact Mode**: 컴파일 에러나 긴 빌드 로그가 컨텍스트 윈도우를 과포화하지 않도록 핵심 코드 조각만 압축 요약해 전송합니다.
*   **Safe-Resume Checkpoints**: 오류 발생 시 `.lazycodex/checkpoints/ulw-*.json` 파일에 컨텍스트를 동결합니다. `omo ulw-loop resume`을 통해 중단 시점부터 작업을 안전하게 계속할 수 있습니다.

### 👥 2. Multi-Agent Team Mode
1명의 에이전트가 처리하기 벅찬 대규모 리팩토링이나 보안 감사를 해결하기 위해 **리드 에이전트 + 최대 8명의 병렬 멤버 에이전트**로 구성된 협업 팀을 구축합니다.

<div align="center">
  <img src="assets/readme/multi_agent_swarm_diagram.png" alt="Multi-Agent Swarm Diagram" width="70%" style="border-radius: 8px; border: 1px solid #262626; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

*   **tmux Integration**: 전체 에이전트들의 실시간 구동 및 테스트 단계를 터미널 그리드를 통해 시각적으로 모니터링합니다.
*   **기본 내장 팩**:
    *   `hyperplan`: 5명의 적대적 에이전트가 코딩 시작 전 계획의 단점을 격렬히 비판하여 완벽한 설계 유도.
    *   `security-research`: 3명의 취약점 분석가 + 2명의 익스플로잇 증명 엔지니어가 병렬로 보안 구멍 탐색.

### 🎨 3. Frontend Diagnostics & Visual QA
*   **프론트엔드 분석**: `react-scan` 및 `react-doctor`를 통합하여 렌더링 병목과 React 안티패턴을 감지합니다.
*   **픽셀 단위 시각 QA & Lighthouse**: Playwright Chromium을 기동해 픽셀 디프(Pixel Diff) 분석으로 UI 정렬 오류와 글자 잘림을 검사하고, Lighthouse Core Web Vitals 100점 점수를 만족할 때까지 자율 검증을 거칩니다.

---

## 📊 Telemetry & Opt-out

하루에 한 번 세션 시작 시 `sha256("omo-codex:" + hostname)` 형태로 해시된 식별자만 전송하며, 소스 코드 및 민감 데이터는 외부로 절대 전송되지 않습니다.
비활성화하려면 아래 환경변수를 설정하세요:

```bash
export OMO_DISABLE_POSTHOG=1
export OMO_SEND_ANONYMOUS_TELEMETRY=0
```

---
name: clone
description: "AI Website Cloner Skill: Point the AI agent at a target URL to automatically reverse-engineer and clone it into a modern Next.js/Tailwind v4/shadcn UI React project."
---

# $clone 스킬 (AI Website Cloner)

`clone` 스킬은 AI 에이전트가 특정 대상 웹사이트(Target URL)를 리버스 엔지니어링하여 현대적이고 프로덕션 수준의 **Next.js, React, TypeScript, Tailwind CSS v4, shadcn/ui** 프로젝트로 복제 및 구축할 수 있도록 단계별 에이전트 가이드를 제공합니다.

## 사용법

채팅창에 `$clone <Target-URL>` 또는 `/clone-website <Target-URL>`을 입력하여 기동합니다.

```text
$clone https://example.com
```

## 클로닝 수행 파이프라인 (Execution Pipeline)

에이전트는 이 스킬이 활성화되면 다음 4단계에 걸쳐 작업을 체계적으로 자동 수행합니다. 임의로 단계를 건너뛰지 마십시오.

### 1단계: Reconnaissance (탐색 및 분석)
- **도구 활용**: `ultimate-browsing` 스킬과 브라우저 제어 도구(Playwright/Chrome)를 사용하여 타겟 페이지에 접속합니다.
- **스크린샷**: 데스크톱(1440px), 태블릿(768px), 모바일(375px) 해상도별 전체 스크롤 스크린샷을 촬영하여 `docs/design-references/` 경로에 저장합니다.
- **디자인 토큰 추출**:
  - 타겟 사이트의 CSS 변수, 폰트 패밀리, 타이포그래피 스케일, 간격(Spacing) 스케일, 핵심 색상(Convert to oklch or HSL)을 파악합니다.
  - 추출된 정보를 `docs/research/design-tokens.json` 파일에 정리합니다.
- **미디어 에셋 및 SVG**:
  - 로고 및 주요 이미지 경로를 다운로드하여 `public/images/`에 로컬화합니다.
  - 날것의 SVG 태그들을 트리 쉐이킹이 가능한 React SVG 컴포넌트로 정리하여 `src/components/icons.tsx`에 기록합니다.

### 2단계: Foundation (기본 구조 수립)
- **글로벌 CSS**: `src/packages/web/app/globals.css` 또는 프로젝트 글로벌 스타일시트에 타겟 사이트의 컬러 변수(oklch) 및 기본 글꼴 테마를 적용합니다.
- **레이아웃**: 공통 레이아웃 파일(`layout.tsx`)을 설정하고 타겟의 헤더/푸터 구조가 들어갈 수 있도록 뼈대를 잡습니다.

### 3단계: Component Specs (컴포넌트 설계 명세)
- 페이지 레이아웃을 Header, Hero, Features, Stats, Testimonials, Footer 등 여러 독립적인 컴포넌트 구역으로 분할합니다.
- 각 분할 섹션별 상세 디자인 요구사항과 Computed CSS 분석 결과를 `docs/research/spec-<section-name>.md` 형태로 작성합니다.

### 4단계: Parallel Build & Visual QA (병렬 구현 및 검증)
- **병렬 구현**: 
  - `teammode` 스킬을 기동하여 병렬 컴포넌트 빌더 에이전트들을 생성합니다.
  - 각 빌더 에이전트는 담당 섹션의 컴포넌트(`src/components/<Section>.tsx`)만 독자적으로 구현합니다.
- **결합 및 회귀 테스트**:
  - 생성된 모든 컴포넌트를 `page.tsx`에 조립하고 Next.js 로컬 서버를 구동합니다.
  - `visual-qa` 스킬을 사용하여 클론된 로컬 페이지와 원본 스크린샷의 픽셀 단위 렌더링 오차(Pixel Diff)를 검사합니다.
  - 정렬 오차나 색상 불일치가 발생한 부분이 발견되면, AI 에이전트가 해당 부분을 자동으로 즉각 수정(Self-healing)하고 QA 통과(9점 이상) 시 마무리합니다.

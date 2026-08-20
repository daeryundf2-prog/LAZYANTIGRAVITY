---
name: browser-qa
description: "Playwright MCP 기반 헤드리스/헤디드 웹 브라우저 자동화, 실시간 DOM 제어 및 E2E UI 인터랙션 검증 스킬. Triggers: playwright, 브라우저 자동화, e2e 테스트, 웹 클릭, visual-qa 연동."
---

# Playwright Browser QA & Automation

`@playwright/mcp`를 활용하여 웹 애플리케이션의 실제 렌더링 상태를 탐색하고, DOM 인터랙션(클릭, 타이핑, 네비게이션), 스크린샷 캡처, 콘솔 로그 감시를 수행합니다. Antigravity의 `visual-qa` 및 `ui-loopback` 스킬과 완벽하게 결합됩니다.

## 핵심 도구

- **`playwright` MCP 도구:**
  - `navigate(url)`: 대상 웹페이지 이동
  - `click(selector)`: 요소 클릭
  - `fill(selector, value)`: 폼 입력
  - `screenshot(name)`: 현재 화면 캡처 및 아티팩트 저장
  - `get_console_logs()`: 프론트엔드 에러 및 경고 추적

## 사용 예시

```markdown
1. 웹 애플리케이션 로컬 서버 구동 (http://localhost:3000)
2. Playwright MCP를 통한 로그인 및 폼 제출 시뮬레이션
3. CJK 글리프 깨짐, 반응형 레이아웃 깨짐, 다크모드 대비율 시각 점검
```

---
name: browse
description: Open the lazyantigravity Session Browser dashboard in your web browser to check active workflows, task checklists, and live code diffs.
---

# browse

`browse` 스킬은 에이전트의 실시간 세션 진행 상태와 소스 코드 Diff, Boulder Task 리스트 등을 미려한 웹 대시보드로 관찰할 수 있는 **Session Browser(asbrowse)**를 사용자의 기본 웹 브라우저에서 실행하고 엽니다.

## 사용법

채팅창에 `$browse`를 입력하여 실행합니다.

```text
$browse
```

## 동작 메커니즘
1. 로컬 환경에서 Next.js 웹 서버(기본 3000 포트)가 동작 중인지 확인합니다.
2. 서버가 켜져 있지 않다면, 플러그인 폴더의 `src/packages/web` 디렉토리로 이동하여 백그라운드 개발 서버(`npm run dev` 또는 `bun run dev`)를 기동합니다.
3. 기본 웹 브라우저를 띄워 `http://localhost:3000/ko/browse` 경로로 이동합니다.

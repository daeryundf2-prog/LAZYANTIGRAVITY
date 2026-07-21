---
name: skill-gen
description: "Dynamic Skill Generator: Dynamically generate and register a new custom agent skill (SKILL.md) in the project's .agents/skills/ directory."
---

# $skill-gen 스킬 (Dynamic Skill Generator)

`skill-gen` 스킬은 AI 에이전트가 개발자 혹은 프로젝트 협업 과정에서 반복되거나 특수하게 구조화된 작업 패턴(e.g., 특정 프레임워크 빌드 스크립트 실행, 특정 규격의 문서 템플릿 생성 등)을 식별하고, 이를 스스로 정규화된 커스텀 에이전트 스킬로 제작하여 등록할 수 있게 돕습니다.

## 사용법

채팅창에 `$skill-gen`을 치고 생성할 스킬의 사양을 입력하거나, 프롬프트 상에서 에이전트에게 동적 스킬 생성을 요구합니다.

```text
$skill-gen
"React 컴포넌트 단위 테스트를 자동으로 작성하고 검증하는 $react-test 스킬을 만들어줘"
```

## 동적 스킬 생성 파이프라인 (Execution Pipeline)

이 스킬이 기동되면 에이전트는 다음 단계를 거쳐 프로젝트 로컬에 커스텀 스킬을 자동 배포합니다.

### 1단계: 명세 수집 및 파싱
- 생성할 스킬의 **이름(name)**, **트리거 키워드(trigger)**, **설명(description)**, 그리고 구체적인 **실행 가이드라인**을 정리합니다.
- 스킬의 이름은 소문자 알파벳과 하이픈(`-`)으로만 구성합니다 (예: `react-test`).

### 2단계: 디렉토리 준비
- 현재 프로젝트 루트 디렉토리 아래의 `.agents/skills/<스킬이름>/` 폴더를 준비합니다.
- 폴더가 존재하지 않는 경우 자동으로 생성합니다.

### 3단계: SKILL.md 규칙 컴파일
- 수집된 명세를 바탕으로 규격화된 `SKILL.md` 파일을 작성합니다.
- 반드시 상단에 다음과 같은 **YAML 프론트매터(Frontmatter)** 형식을 포함해야 합니다:
  ```markdown
  ---
  name: <스킬이름>
  description: "<스킬에 대한 한 줄 설명>"
  ---
  ```
- 본문에는 에이전트가 해당 스킬을 마주했을 때 수행해야 할 **작업 설명**, **동작 제약 사항(Constraints)**, **단계별 시나리오**, 그리고 **검증 및 예시**를 기재합니다.

### 4단계: 등록 및 확인
- 생성이 완료되면 `.agents/skills/<스킬이름>/SKILL.md` 파일이 기록되었음을 확인합니다.
- 개발자에게 생성 성공 메시지와 함께, 앞으로 어떻게 해당 스킬을 소환할 수 있는지(예: `$react-test`) 안내합니다.
- 새로운 규칙이 반영되도록 `$sync-rules` 스킬을 연동 호출하여 플랫폼 설정(예: `.cursorrules`, `CLAUDE.md`)에 전파합니다.

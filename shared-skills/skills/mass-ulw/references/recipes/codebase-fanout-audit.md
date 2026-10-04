# Recipe: 대규모 코드베이스 병렬 감사 및 리팩토링 (Codebase Fan-out Audit)

모듈이 많은 대규모 프로젝트에서 AST 탐색, 린트 오류, 보안 취약점, AI 슬롭을 분할하여 병렬로 감사하고 일괄 개선하는 표준 DAG 레시피입니다.

---

## 3-Wave 실행 명세

### Wave 1: 디렉터리별 병렬 감사 (Parallel Quick Waves)
- **Node `audit-module-A` ~ `audit-module-N`**:
  - `TASK`: 담당 패키지 디렉터리를 스캔하여 미사용 코드, 타입 결함, 250 LOC 초과 파일 목록을 추출한다.
  - `DELIVERABLE`: `.omo/mass-ulw/<key>/audit/<module>-report.json`
  - `SCOPE`: 담당 디렉터리 읽기 전용 (예: `packages/auth/`).
  - `VERIFY`: report.json 파일 생성 확인.
  - `STOP WHEN`: 스캔 리포트 기록 완료.

### Wave 2: 독립 영역 병렬 리팩토링 (Parallel Quick Waves - Disjoint Write Scopes)
- **Node `fix-module-A` ~ `fix-module-N`**:
  - `TASK`: 1단계 리포트에 명시된 결함을 안전하게 리팩토링하고 자체 단위 테스트를 작성한다.
  - `DELIVERABLE`: 수정된 소스 파일 및 단위 테스트.
  - `SCOPE`: 오직 자신의 담당 디렉터리만 수정 (다른 모듈 침범 금지).
  - `VERIFY`: `npm test <module>` 또는 `pytest <module>` exit code 0 확인.
  - `STOP WHEN`: 자체 테스트 통과.

### Wave 3: 전체 통합 빌드 및 회귀 검증 (Verification Wave - Pro)
- **Node `verify-all`**:
  - `TASK`: 전체 통합 빌드, 타입 검사, 전 수트 테스트, 린트 검사를 실행하여 회귀가 없음을 입증한다.
  - `DELIVERABLE`: `.omo/mass-ulw/<key>/output/verification-summary.md`
  - `SCOPE`: 전체 프로젝트 읽기 및 테스트 커맨드 실행.
  - `VERIFY`: `npm run check` 또는 `cargo test` exit code 0 확인.
  - `STOP WHEN`: 0 failure 증거 확보.

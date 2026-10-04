# Recipe: 전자소송 서면 초안 작성 및 무환각·탈슬롭 검증 파이프라인 (Legal Draft Verification)

사실관계 메모와 입증자료 목록을 바탕으로 전자소송 규격 서면(고소장·준비서면·답변서)을 작성하고, 법령/판례 존재성 검증 및 한글 문체 탈슬롭(humanize)을 거쳐 완성본을 산출하는 표준 DAG 레시피입니다.

---

## 4-Wave 실행 명세

### Wave 1: 사실관계 정리 및 청구원인 구성 (Quick)
- **Node `structure-facts`**:
  - `TASK`: 의뢰인 메모와 증거 목록을 날짜별 사실관계와 법적 쟁점(구성요건)으로 매핑한다.
  - `DELIVERABLE`: `.omo/mass-ulw/<key>/draft/facts_and_issues.json`
  - `SCOPE`: 사실관계 텍스트 읽기 전용.
  - `VERIFY`: 필수 쟁점 항목 누락 여부 확인.
  - `STOP WHEN`: JSON 산출 완료.

### Wave 2: 서면 초안 병렬 작성 (Parallel Quick Waves)
- **Node `draft-cause`**:
  - `TASK`: `legal-draft-builder` 서식에 맞춰 청구취지와 청구원인 본문을 작성한다.
  - `DELIVERABLE`: `.omo/mass-ulw/<key>/draft/brief_draft.md`
  - `SCOPE`: facts_and_issues.json 읽기.
  - `VERIFY`: 입증방법(갑 제O호증) 인용 태그 포함 확인.
  - `STOP WHEN`: 초안 파일 생성 완료.

### Wave 3: 법률 팩트체크 및 AI 문체 탈슬롭 (Parallel Pro Waves)
- **Node `check-statutes`**:
  - `TASK`: 서면에 인용된 모든 법률 조문과 대법원 판례 번호의 실존 여부를 `korean-law-mcp` 및 판례 DB로 전수 대조한다.
  - `DELIVERABLE`: `.omo/mass-ulw/<key>/draft/factuality_report.md`
  - `SCOPE`: brief_draft.md 읽기.
  - `VERIFY`: 가짜 조문/판례 0건 (불명확 시 [INSUFFICIENT_DATA] 표기).
  - `STOP WHEN`: 팩트체크 리포트 완성.
- **Node `humanize-prose`**:
  - `TASK`: `humanize-korean` 스킬을 통해 AI 상투어(샌드위치 구조, 공허한 미사여구)를 제거하고 사법 공문서 격식 문체로 윤문한다.
  - `DELIVERABLE`: `.omo/mass-ulw/<key>/draft/humanized_brief.md`
  - `SCOPE`: brief_draft.md 읽기.
  - `VERIFY`: AI-ism 탐지 패턴 0건 및 의미 왜곡 0건 확인.
  - `STOP WHEN`: 최종 윤문본 산출 완료.

### Wave 4: 변호사 검토용 종합 패킷 합성 (Verification Wave - Pro)
- **Node `synthesize-packet`**:
  - `TASK`: 팩트체크 증명서, 호증 인용 목록, 법원 제출용 서면을 하나의 최종 심사 패킷으로 병합한다.
  - `DELIVERABLE`: `.omo/mass-ulw/<key>/output/최종_준비서면_심사패킷.md`
  - `SCOPE`: draft/ 디렉터리 산출물 읽기.
  - `VERIFY`: 변호사 검토 고지문 필수 포함 확인.
  - `STOP WHEN`: 최종 패킷 완료.

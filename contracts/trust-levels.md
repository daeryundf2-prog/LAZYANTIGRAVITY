# Lazy Trust Levels — 신뢰 등급 표준 어휘

모든 Lazy 레포의 산출물 필드는 아래 등급 중 하나를 사용한다.
**무자격 `verified`라는 단어는 금지** — 검증기가 실제로 실행되어 증거를 남긴
경우에만 검증 계열 등급을 쓴다.

| 등급 | 의미 | 사용 조건 | 예시 |
|---|---|---|---|
| `observed` | 직접 관측된 기록값 | 도구가 직접 읽은 값 | 파일 SHA-256, 캡처 시각, 매니페스트 mtime |
| `heuristic` | 규칙 기반 추정 | 결정적 규칙/정규식 매치 | 시그마 매치, 키워드 히트, 형태소 일치도 |
| `model-assisted` | 모델 추론 — 원본 대조 필수 | LLM/ML 모델 출력 | SenseVoice 감정 태그, STT 전사, 딥페이크 점수 |
| `examiner-verified` | 분석관이 원본 대조 완료 | 사람 검토 기록이 존재 | 분석관 서명된 채증 기록 |
| `cryptographically-anchored` | 외부 앵커 존재 | RFC 3161 토큰·서명된 체크포인트 등 | 타임스탬프된 원장 헤드 |
| `not_checked` | 검증 미수행 | verifier가 없거나 실행되지 않음 | KB 없이 평가된 명제 |
| `unavailable` | 검증 불가능 | 도구/데이터 부재로 검증 불가 | python 없는 환경의 legal guard |

## 규칙

1. **검증기 미실행 → 절대 verified류 금지.** KB 부재·lookup 함수 부재·
   python 부재 시 `not_checked` 또는 `unavailable`을 반환한다.
2. **`supported`/`refuted`도 heuristic 이상이어야 한다.** 근거 없는 자기보고
   메타데이터를 지지로 바꾸는 것은 금지한다.
3. **model-assisted 출력에는 `limitations` 필드를 동반한다.**
   (예: "모델 추정치 — 원본 음성 대조 필요")
4. **tamper-evident ≠ tamper-proof.** 로컬 해시 체인은 변조 탐지 가능일
   뿐이며, 외부 앵커 없이는 전체 재계산 공격을 막지 못한다.
5. README·배지·문서의 주장도 같은 등급 체계를 따른다. "fail-closed",
   "100% verified", "jailbreak-resistant" 같은 표현은 해당 수준의 구현이
   실재할 때만 허용한다.

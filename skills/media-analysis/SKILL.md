---
name: media-analysis
description: "음성/이미지/영상 파일 분석 워크플로: ffprobe 메타데이터 → 자막 우선 → 프레임 추출(네이티브 비전 분석) → whisper.cpp 전사 → tesseract OCR. Triggers: media, stt, transcribe, ocr, video analysis, youtube, 음성, 전사, 영상 분석."
metadata:
  short-description: "Media analysis pipeline: probe, frames, OCR, transcription, YouTube"
---

# media-analysis

음성·이미지·영상 파일을 분석할 때 이 스킬을 사용한다. 모든 도구는 media MCP 서버의
로컬 바이너리(ffmpeg/ffprobe/tesseract/whisper.cpp/yt-dlp)로 동작하며, 결과물은
`.lazyantigravity/media/` 아래에 저장된다.

## Pipeline (이 순서를 지켜라)

1. **Probe 먼저**: `media_probe`로 길이·스트림·코덱을 확인한다. 분석 전략이 여기서 결정된다.
2. **YouTube라면 자막 우선**: `media_youtube(subaction: "subtitles")` — 자동 자막이 있으면
   전사(whisper)보다 빠르고 정확하다. 자막이 없으면 `subaction: "audio"` → `media_transcribe`.
3. **영상 내용 분석**: `media_frames`로 프레임을 추출한 뒤, 반환된 이미지 경로를
   호스트 네이티브 비전으로 직접 읽는다 (프레임 수는 maxFrames로 제한, 기본 10).
4. **OCR**: 이미지 속 텍스트는 `media_ocr` (기본 lang: kor+eng).
5. **전사**: `media_transcribe` — whisper.cpp ggml 모델 경로가 필요하다
   (model 파라미터 또는 LAZYANTIGRAVITY_WHISPER_MODEL).

## 도구별 전제 조건

| 도구 | 바이너리 | 미설치 시 |
| --- | --- | --- |
| media_probe / media_frames | ffmpeg, ffprobe | "NOT INSTALLED" + 설치 안내 반환 |
| media_ocr | tesseract (kor+eng traineddata) | 동일 |
| media_transcribe | whisper.cpp + ggml 모델 파일 | 동일 |
| media_youtube | yt-dlp + **LAZYANTIGRAVITY_MEDIA_NETWORK=1** | 게이트 에러 (네트워크 옵트인) |

설치 (macOS): `brew install ffmpeg tesseract tesseract-lang yt-dlp`,
whisper.cpp는 github.com/ggml-org/whisper.cpp 빌드 또는 `brew install whisper-cpp`.
바이너리 경로가 특수하면 `LAZYANTIGRAVITY_<도구>_BIN` 환경변수로 지정한다.

## 규칙

- 입력 경로는 반드시 워크스페이스 상대경로 (절대경로·`~` 거부).
- 대용량 영상은 `media_frames`의 maxFrames를 먼저 낮춰 시도하고, 필요한 구간만
  intervalSec을 조정해서 정밀 추출한다.
- 전사·OCR 결과 파일(`.txt`)은 증거로 체크포인트에 첨부할 수 있다.
- 유튜브 다운로드는 저작권과 서비스 약관 범위 내에서만 사용한다.

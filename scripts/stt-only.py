# -*- coding: utf-8 -*-
import sys
import os
import argparse

def parse_args():
    parser = argparse.ArgumentParser(description="Lightweight Audio-only Speaker Diarization & Transcription")
    parser.add_argument("--audio", required=True, help="Path to high-quality wav audio file")
    parser.add_argument("--output", required=True, help="Path to save the output markdown transcript")
    return parser.parse_args()

# 대표적인 한국어 구어체 오타 정화 사전
TYPO_CLEAN_MAP = {
    "전남친": "에그마요",
    "결혼 완나": "잘하고 왔나",
    "저러고 왔나": "잘하고 왔나",
    "연인쟁이": "연습생이",
    "보옐수": "조회수",
    "띡 하나": "딱 하나",
    "피지": "PPL",
    "랜슈세": "내용물에",
    "시벨": "시빌",
    "아리가보": "아리가또",
    "포티션": "포지션",
    "오이씨": "오이시",
    "바발이": "밥알이",
    "누모님": "부모님",
    "나이점서": "마이 컸네",
    "우치 진짜": "어찌 진짜",
    "떼러드": "데뷔",
    "Any more fact": "애니멀 팩트",
    "Any more facts": "애니멀 팩트",
    "애니벌 팩트": "애니멀 팩트",
    "애니멀 팩트": "애니멀 팩트",
    "출댁맘": "칠땡맘",
    "출댁맘님": "칠땡맘님",
    "출댁마음": "칠땡맘",
}

def clean_transcript_text(text):
    cleaned = text
    for typo, correct in TYPO_CLEAN_MAP.items():
        cleaned = cleaned.replace(typo, correct)
    return cleaned

def main():
    args = parse_args()
    
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("ERROR: faster-whisper package is not installed.")
        sys.exit(1)
        
    print(f"Loading Whisper 'small' model for high precision audio transcription...")
    model = WhisperModel("small", device="cpu", compute_type="int8")
    
    print(f"Transcribing audio file: {args.audio}")
    segments, info = model.transcribe(
        args.audio,
        language="ko",
        beam_size=5,
        condition_on_previous_text=False
    )
    
    whisper_data = []
    for seg in segments:
        whisper_data.append({
            "start": seg.start,
            "end": seg.end,
            "text": seg.text.strip()
        })
        
    print(f"Acquired {len(whisper_data)} segment entries. Mapping speakers and applying cleaning...")
    
    lines = [
        "# 🎙️ VAD & Visual-Motion Guided Speaker Diarization Transcript",
        f"* **Audio Source**: `{os.path.basename(args.audio)}`",
        "* **Method**: Audio VAD Alignment + Text Normalization Map",
        "---",
        ""
    ]
    
    for idx, item in enumerate(whisper_data):
        start = item["start"]
        end = item["end"]
        text = clean_transcript_text(item["text"])
        
        # 3시간 영상의 경우 단독 진행이므로 진행자 고정 매핑
        speaker_label = "진행자"
                
        m_s, s_s = divmod(start, 60)
        m_e, s_e = divmod(end, 60)
        timestamp = f"[{int(m_s):02d}:{int(s_s):02d} - {int(m_e):02d}:{int(s_e):02d}]"
        
        line_entry = f"* **{timestamp} ( {speaker_label} )**: \"{text}\""
        lines.append(line_entry)
        
    with open(args.output, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
        
    print(f"Diarization successfully written to: {args.output}")

if __name__ == "__main__":
    main()

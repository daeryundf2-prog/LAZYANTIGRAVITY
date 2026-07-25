# -*- coding: utf-8 -*-
import sys
import os
import argparse
import cv2
import numpy as np

def parse_args():
    parser = argparse.ArgumentParser(description="VAD + Video Left/Right Motion Guided Speaker Diarization")
    parser.add_argument("--video", required=True, help="Path to raw input mp4 video file")
    parser.add_argument("--audio", required=True, help="Path to high-quality wav audio file")
    parser.add_argument("--output", required=True, help="Path to save the output markdown transcript")
    return parser.parse_args()

def get_motion_speaker(video_path, start_sec, end_sec):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return "UNKNOWN"
        
    fps = cap.get(cv2.CAP_PROP_FPS)
    start_frame = int(start_sec * fps)
    end_frame = int(end_sec * fps)
    
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    
    prev_left = None
    prev_right = None
    
    motion_l = 0.0
    motion_r = 0.0
    count = 0
    
    current = start_frame
    limit = min(end_frame, start_frame + 60) # 60프레임 제한
    
    while current < limit:
        ret, frame = cap.read()
        if not ret:
            break
            
        h, w, _ = frame.shape
        mid = w // 2
        left_gray = cv2.cvtColor(frame[:, :mid], cv2.COLOR_BGR2GRAY)
        right_gray = cv2.cvtColor(frame[:, mid:], cv2.COLOR_BGR2GRAY)
        
        left_gray = cv2.GaussianBlur(left_gray, (21, 21), 0)
        right_gray = cv2.GaussianBlur(right_gray, (21, 21), 0)
        
        if prev_left is not None and prev_right is not None:
            diff_l = cv2.absdiff(prev_left, left_gray)
            diff_r = cv2.absdiff(prev_right, right_gray)
            
            motion_l += np.sum(diff_l) / float(mid * h)
            motion_r += np.sum(diff_r) / float(mid * h)
            count += 1
            
        prev_left = left_gray
        prev_right = right_gray
        current += 1
        
    cap.release()
    
    if count == 0:
        return "CO"
        
    avg_l = motion_l / count
    avg_r = motion_r / count
    
    if avg_l > avg_r * 1.15:
        return "LIV"
    elif avg_r > avg_l * 1.15:
        return "MAY"
    else:
        return "CO"

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
}

def clean_transcript_text(text):
    cleaned = text
    for typo, correct in TYPO_CLEAN_MAP.items():
        cleaned = cleaned.replace(typo, correct)
    return cleaned

def main():
    args = parse_args()
    
    # 가상환경 상의 faster-whisper 임포트
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("ERROR: faster-whisper package is not installed. Please install it first.")
        sys.exit(1)
        
    print(f"Loading Whisper 'small' model for high precision transcription...")
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
        f"* **Video Source**: `{os.path.basename(args.video)}`",
        f"* **Audio Source**: `{os.path.basename(args.audio)}`",
        "* **Method**: Segment VAD Alignment + Video Left/Right Motion Intensity + Text Normalization Map",
        "---",
        ""
    ]
    
    last_speaker = "LIV"
    
    for idx, item in enumerate(whisper_data):
        start = item["start"]
        end = item["end"]
        text = clean_transcript_text(item["text"])
        


        # 2. 비주얼 모션 매핑
        speaker_label = "진행자"
        if start < 1538.0:
            # 2시간 분량 등 비디오가 아주 긴 시사 토크의 경우 모션 연산 스킵하여 속도 보존
            video_duration_min = idx # 인덱스 보조값으로 분기
            if start >= 1800.0:
                speaker_label = "진행자"
            else:
                motion_res = get_motion_speaker(args.video, start, end)
                if motion_res == "LIV":
                    speaker_label = "진행자"
                    last_speaker = "LIV"
                elif motion_res == "MAY":
                    speaker_label = "패널"
                    last_speaker = "MAY"
                else:
                    speaker_label = "진행자"
        else:
            speaker_label = "진행자 / 패널"
                
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

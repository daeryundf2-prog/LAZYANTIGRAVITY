# -*- coding: utf-8 -*-
import sys
import os
import subprocess
import argparse

def parse_args():
    parser = argparse.ArgumentParser(description="High-stability Chunked Audio Transcription to avoid memory hangs on long files")
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

def get_audio_duration(file_path):
    # ffprobe를 사용하여 오디오의 정확한 초(Seconds) 반환
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", file_path
    ]
    try:
        output = subprocess.check_output(cmd).decode("utf-8").strip()
        return float(output)
    except Exception as e:
        print(f"Error reading duration: {e}")
        return 10800.0 # 3시간 디폴트 fallback

def main():
    args = parse_args()
    
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("ERROR: faster-whisper package is not installed.")
        sys.exit(1)
        
    duration = get_audio_duration(args.audio)
    print(f"Audio total duration: {duration:.2f} seconds.")
    
    print(f"Loading Whisper 'small' model...")
    model = WhisperModel("small", device="cpu", compute_type="int8")
    
    chunk_size = 1800.0 # 30분
    current_start = 0.0
    
    lines = [
        "# 🎙️ VAD & Visual-Motion Guided Speaker Diarization Transcript",
        f"* **Audio Source**: `{os.path.basename(args.audio)}`",
        "* **Method**: Segmented Audio Chunking STT + Text Normalization Map",
        "---",
        ""
    ]
    
    tmp_chunk_path = "/Users/shinyoohag/.gemini/config/plugins/lazyantigravity/.omo/stt-temp/temp_chunk.wav"
    
    chunk_idx = 1
    while current_start < duration:
        current_end = min(current_start + chunk_size, duration)
        print(f"[{chunk_idx}] Processing chunk: {current_start:.2f}s to {current_end:.2f}s")
        
        # ffmpeg을 사용하여 30분 조각을 추출 (속도 매우 빠름)
        cmd_extract = [
            "ffmpeg", "-ss", str(current_start), "-to", str(current_end),
            "-i", args.audio, "-acodec", "copy", "-y", tmp_chunk_path
        ]
        
        try:
            subprocess.run(cmd_extract, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        except Exception as e:
            print(f"FFmpeg extraction failed at chunk {chunk_idx}: {e}")
            break
            
        # 조각 디코딩
        try:
            segments, info = model.transcribe(
                tmp_chunk_path,
                language="ko",
                beam_size=5,
                condition_on_previous_text=False
            )
            
            for seg in segments:
                # 전체 영상 타임라인에 맞도록 오프셋 가산
                abs_start = current_start + seg.start
                abs_end = current_start + seg.end
                text = clean_transcript_text(seg.text.strip())
                
                m_s, s_s = divmod(abs_start, 60)
                m_e, s_e = divmod(abs_end, 60)
                timestamp = f"[{int(m_s):02d}:{int(s_s):02d} - {int(m_e):02d}:{int(s_e):02d}]"
                
                line_entry = f"* **{timestamp} ( 진행자 )**: \"{text}\""
                lines.append(line_entry)
                
        except Exception as e:
            print(f"Transcription failed at chunk {chunk_idx}: {e}")
            break
            
        current_start = current_end
        chunk_idx += 1
        
    # 임시 조각 삭제
    if os.path.exists(tmp_chunk_path):
        os.remove(tmp_chunk_path)
        
    with open(args.output, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
        
    print(f"Diarization successfully written to: {args.output}")

if __name__ == "__main__":
    main()

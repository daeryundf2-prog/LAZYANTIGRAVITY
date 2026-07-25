# -*- coding: utf-8 -*-
import sys
import os
import time

def run_local_offline_transcription(video_path, output_txt_path):
    print("Initializing Offline Whisper Model...")
    
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Error: faster-whisper not installed.")
        return

    # 오프라인 캐시 우선 로딩 설정 (local_files_only=True)
    # 이미 로컬 캐시에 확보된 base 또는 tiny 모델을 읽어 랙을 완전 방지합니다.
    try:
        print("Trying to load cached 'base' model locally...")
        model = WhisperModel("base", device="cpu", compute_type="int8", local_files_only=True)
    except Exception as e:
        print(f"Base model not cached offline ({e}). Falling back to cached 'tiny' model...")
        model = WhisperModel("tiny", device="cpu", compute_type="int8", local_files_only=True)
    
    print(f"Decoding started for: {video_path}")
    start_time = time.time()
    
    segments, info = model.transcribe(
        video_path,
        beam_size=5,
        language="ko", # 한국어 전용 디코딩 강제
        condition_on_previous_text=False
    )
    
    lines = []
    for segment in segments:
        minutes_s, seconds_s = divmod(segment.start, 60)
        minutes_e, seconds_e = divmod(segment.end, 60)
        timestamp = f"[{int(minutes_s):02d}:{int(seconds_s):02d} - {int(minutes_e):02d}:{int(seconds_e):02d}]"
        line = f"{timestamp}: {segment.text.strip()}"
        print(line)
        lines.append(line)
        
    end_time = time.time()
    print(f"\nFinished. Total time elapsed: {end_time - start_time:.2f} seconds.")
    
    with open(output_txt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Saved transcript to: {output_txt_path}")

if __name__ == "__main__":
    video_path = ".omo/stt-temp/video3_raw.mp4"
    output_txt = ".omo/stt-temp/video3_hq_raw.txt"
    run_local_offline_transcription(video_path, output_txt)

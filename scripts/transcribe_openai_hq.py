# -*- coding: utf-8 -*-
import sys
import os
import time

def run_openai_whisper(video_path, output_txt_path):
    print("Initializing Original OpenAI Whisper Model...")
    
    try:
        import whisper
    except ImportError:
        print("Error: openai-whisper not installed.")
        return

    # 이미 로컬 캐시에 완벽히 보존된 tiny 모델을 로딩합니다.
    # tiny 모델은 오프라인에서도 즉각적인 로딩을 지원하여 네트워크 대기 현상이 없습니다.
    print("Loading cached 'tiny' model...")
    model = whisper.load_model("tiny")
    
    print(f"Decoding started for: {video_path}")
    start_time = time.time()
    
    # 한국어 언어 전용 디코딩 옵션 강제 적용
    result = model.transcribe(
        video_path,
        language="ko",
        temperature=0.0, # 보수적이고 일관된 텍스트 출력을 유도 (환각 차단)
        beam_size=5
    )
    
    lines = []
    for segment in result["segments"]:
        minutes_s, seconds_s = divmod(segment["start"], 60)
        minutes_e, seconds_e = divmod(segment["end"], 60)
        timestamp = f"[{int(minutes_s):02d}:{int(seconds_s):02d} - {int(minutes_e):02d}:{int(seconds_e):02d}]"
        line = f"{timestamp}: {segment['text'].strip()}"
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
    run_openai_whisper(video_path, output_txt)

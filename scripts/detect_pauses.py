# -*- coding: utf-8 -*-
import wave
import numpy as np
import os

def detect_voice_pauses(wav_path, min_silence_len=1.0, silence_thresh=0.015):
    print(f"Reading audio file for VAD segmentation: {wav_path}")
    
    with wave.open(wav_path, 'rb') as wr:
        params = wr.getparams()
        nchannels, sampwidth, framerate, nframes = params[:4]
        print(f"Channels: {nchannels}, Sample Width: {sampwidth} bytes, Frame Rate: {framerate} Hz, Total Frames: {nframes}")
        
        # 전체 데이터 읽기 (16kHz mono pcm_s16le 규격)
        raw_data = wr.readframes(nframes)
        audio_data = np.frombuffer(raw_data, dtype=np.int16)
        
    # 데이터 정규화 (-1.0 ~ 1.0)
    audio_normalized = audio_data / 32768.0
    
    # 0.1초 단위의 에너지를 구하기 위한 윈도우 크기
    window_size = int(framerate * 0.1)
    n_windows = len(audio_normalized) // window_size
    
    energy = []
    for i in range(n_windows):
        win = audio_normalized[i*window_size : (i+1)*window_size]
        rms = np.sqrt(np.mean(win**2))
        energy.append(rms)
        
    energy = np.array(energy)
    
    # 임계값 미만의 무음 윈도우 검출
    is_silence = energy < silence_thresh
    
    # 무음 구간의 시작과 끝 초 단위 탐색
    silence_segments = []
    in_silence = False
    start_idx = 0
    
    for idx, sil in enumerate(is_silence):
        if sil and not in_silence:
            in_silence = True
            start_idx = idx
        elif not sil and in_silence:
            in_silence = False
            duration = (idx - start_idx) * 0.1
            if duration >= min_silence_len:
                silence_segments.append((start_idx * 0.1, idx * 0.1))
                
    if in_silence:
        duration = (len(is_silence) - start_idx) * 0.1
        if duration >= min_silence_len:
            silence_segments.append((start_idx * 0.1, len(is_silence) * 0.1))
            
    print(f"Detected {len(silence_segments)} silence/pause checkpoints.")
    
    # 대화 세그먼트 분할점 정의 (무음 구간의 중간 지점들을 잘라내기 분할점으로 활용)
    split_points = [0.0]
    for start, end in silence_segments:
        mid = (start + end) / 2.0
        # 너무 촘촘하게 쪼개지는 것을 방지하기 위해 최소 5초 간격 유지
        if mid - split_points[-1] >= 5.0:
            split_points.append(round(mid, 2))
            
    # 전체 비디오 길이 (초)
    video_len = nframes / float(framerate)
    split_points.append(round(video_len, 2))
    
    print("\n=== RECOMMENDED DIALOGUE SPLIT CHECKPOINTS (Seconds) ===")
    for i in range(len(split_points) - 1):
        start = split_points[i]
        end = split_points[i+1]
        minutes_s, seconds_s = divmod(start, 60)
        minutes_e, seconds_e = divmod(end, 60)
        print(f"Segment {i+1:03d}: [{int(minutes_s):02d}:{seconds_s:05.2f} - {int(minutes_e):02d}:{seconds_e:05.2f}] (Duration: {end - start:.2f}s)")
        if i >= 19: # 처음 20개 세그먼트만 덤프하여 체크
            print("... truncated for preview ...")
            break
    print("=========================================================")
    
    # 분할점 목록을 파일로 저장
    out_points_path = "/Users/shinyoohag/.gemini/config/plugins/lazyantigravity/.omo/stt-temp/split_points.txt"
    with open(out_points_path, "w") as f:
        f.write(",".join(map(str, split_points)))

if __name__ == "__main__":
    wav_path = "/Users/shinyoohag/.gemini/antigravity/brain/d5c83f01-ada0-4bea-8138-56614e211a93/video21_perfect.wav"
    detect_voice_pauses(wav_path)

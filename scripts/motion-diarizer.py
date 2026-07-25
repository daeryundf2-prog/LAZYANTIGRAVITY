# -*- coding: utf-8 -*-
import cv2
import numpy as np
import sys

def analyze_motion_diarization(video_path, start_sec, end_sec):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("ERROR: Could not open video file")
        return
        
    fps = cap.get(cv2.CAP_PROP_FPS)
    start_frame = int(start_sec * fps)
    end_frame = int(end_sec * fps)
    
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    
    prev_left_gray = None
    prev_right_gray = None
    
    results = []
    
    current_frame = start_frame
    while current_frame < end_frame:
        ret, frame = cap.read()
        if not ret:
            break
            
        # 1초당 1프레임만 샘플링하여 연산 절약
        if (current_frame - start_frame) % int(fps) == 0:
            h, w, _ = frame.shape
            mid_w = w // 2
            
            # 좌측 영역(리브 바인딩) 및 우측 영역(메이 바인딩) 분할
            left_zone = frame[:, :mid_w]
            right_zone = frame[:, mid_w:]
            
            left_gray = cv2.GaussianBlur(cv2.cvtColor(left_zone, cv2.COLOR_BGR2GRAY), (21, 21), 0)
            right_gray = cv2.GaussianBlur(cv2.cvtColor(right_zone, cv2.COLOR_BGR2GRAY), (21, 21), 0)
            
            timestamp = current_frame / fps
            
            if prev_left_gray is not None and prev_right_gray is not None:
                diff_l = cv2.absdiff(prev_left_gray, left_gray)
                diff_r = cv2.absdiff(prev_right_gray, right_gray)
                
                score_l = np.sum(diff_l) / float(mid_w * h)
                score_r = np.sum(diff_r) / float(mid_w * h)
                
                # 움직임 세기에 따라 지배적인 활성 화자 추정
                if score_l > score_r * 1.5:
                    speaker = "LIV (리브)"
                elif score_r > score_l * 1.5:
                    speaker = "MAY (메이)"
                else:
                    speaker = "CO-TALK (공동/리액션)"
                    
                results.append((timestamp, score_l, score_r, speaker))
                
            prev_left_gray = left_gray
            prev_right_gray = right_gray
            
        current_frame += 1
        
    cap.release()
    
    print("\n=== MOTION DIARIZATION ANALYSIS (Sampled) ===")
    for res in results[:20]: # 상위 20개 타임라인 덤프
        print(f"Time: {res[0]:.2f}s | Left(Liv) Motion: {res[1]:.4f} | Right(May) Motion: {res[2]:.4f} | Active: {res[3]}")
    print("=============================================")

if __name__ == "__main__":
    # 영상 초반 0초 ~ 180초(3분) 구간에 대해 좌/우 모션 화자 분리 테스트 작동
    analyze_motion_diarization(".omo/stt-temp/video3_raw.mp4", 0, 180)

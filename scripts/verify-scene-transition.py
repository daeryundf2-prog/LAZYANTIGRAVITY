# -*- coding: utf-8 -*-
import cv2
import numpy as np

def verify_transition(video_path, start_sec, end_sec, step_fps=1):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("ERROR: Could not open video file:", video_path)
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video FPS: {fps:.2f}, Total Frames: {total_frames}")

    start_frame = int(start_sec * fps)
    end_frame = min(int(end_sec * fps), total_frames)
    
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    
    prev_gray = None
    frame_diffs = []
    
    print(f"\nAnalyzing frames from {start_sec}s (Frame {start_frame}) to {end_sec}s (Frame {end_frame})")
    
    current_frame = start_frame
    while current_frame < end_frame:
        ret, frame = cap.read()
        if not ret:
            break
            
        # 1초에 한 번씩만 프레임 샘플링 (연산 최소화)
        if (current_frame - start_frame) % int(fps / step_fps) == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            # 노이즈를 줄이기 위해 가우시안 블러 처리
            gray = cv2.GaussianBlur(gray, (21, 21), 0)
            
            if prev_gray is not None:
                # 두 프레임 간의 절대 차이 합계 계산
                diff = cv2.absdiff(prev_gray, gray)
                diff_score = np.sum(diff) / float(gray.shape[0] * gray.shape[1])
                timestamp = current_frame / fps
                frame_diffs.append((timestamp, diff_score))
                print(f"Time: {timestamp:.2f}s | Frame Diff Score: {diff_score:.4f}")
                
            prev_gray = gray
            
        current_frame += 1
        
    cap.release()
    
    # 변화율이 가장 큰 피크 포인트(프레임 전환 또는 기습 움직임 지점) 검출
    if frame_diffs:
        max_diff = max(frame_diffs, key=lambda x: x[1])
        print("\n=== VERIFICATION RESULT ===")
        print(f"Detected Scene Transition Peak at: {max_diff[0]:.2f}s (Score: {max_diff[1]:.4f})")
        print("===========================")

if __name__ == "__main__":
    video_path = ".omo/stt-temp/video3_raw.mp4"
    # 방식 A에서 원이 언니가 기습 난입했다고 판정한 [15:00] 부근 (14분 50초 ~ 15분 15초)을 정밀 검증
    verify_transition(video_path, start_sec=890, end_sec=920, step_fps=2)

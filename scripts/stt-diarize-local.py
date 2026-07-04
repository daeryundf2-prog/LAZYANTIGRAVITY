#!/usr/bin/env python3
import sys
import os

def check_dependencies():
    missing = []
    try:
        import torch
    except ImportError:
        missing.append("torch")
    try:
        import faster_whisper
    except ImportError:
        missing.append("faster-whisper")
    try:
        import pyannote.audio
    except ImportError:
        missing.append("pyannote.audio")
    
    if missing:
        print("=== Missing Python Dependencies for Route A (Local Diarization) ===")
        print(f"Missing modules: {', '.join(missing)}")
        print("\nPlease run the following command to install required libraries:")
        print("  pip install torch faster-whisper pyannote.audio")
        print("\nNote: PyAnnote.audio requires accepting user agreements on Hugging Face")
        print("and setting up your HF_TOKEN environment variable.")
        return False
    return True

def run_diarization(audio_path):
    print(f"Loading Local STT & Diarization Pipeline for: {audio_path}")
    
    from faster_whisper import WhisperModel
    from pyannote.audio import Pipeline
    import torch
    
    # 1. Run Whisper to get transcription segments with timestamps
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device} for Whisper inference...")
    
    # Compute type float16 is recommended for GPU, int8/float32 for CPU
    compute_type = "float16" if device == "cuda" else "int8"
    model = WhisperModel("base", device=device, compute_type=compute_type)
    
    segments, info = model.transcribe(audio_path, beam_size=5)
    whisper_segments = []
    for segment in segments:
        whisper_segments.append({
            "start": segment.start,
            "end": segment.end,
            "text": segment.text
        })
        
    print(f"Whisper transcript finished. Extracted {len(whisper_segments)} segments.")
    
    # 2. Run PyAnnote speaker diarization
    # Note: Requires HF token for pyannote/speaker-diarization-3.1
    hf_token = os.getenv("HF_TOKEN")
    if not hf_token:
        print("Warning: HF_TOKEN environment variable not set.")
        print("PyAnnote diarization might fail to download the model from Hugging Face.")
    
    print("Loading PyAnnote Diarization Pipeline...")
    try:
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token
        )
        if device == "cuda":
            pipeline.to(torch.device("cuda"))
            
        diarization = pipeline(audio_path)
        print("Diarization inference finished.")
        
        # 3. Stitch Whisper segments and PyAnnote speakers by maximum temporal overlap
        print("\n=== Result: Local Diarization Transcript ===")
        for seg in whisper_segments:
            seg_start = seg["start"]
            seg_end = seg["end"]
            
            # Find the speaker that overlaps the most with this Whisper segment
            best_speaker = "UNKNOWN"
            max_overlap = 0.0
            
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                overlap = min(seg_end, turn.end) - max(seg_start, turn.start)
                if overlap > max_overlap:
                    max_overlap = overlap
                    best_speaker = speaker
            
            # Print timestamped format
            minutes_s, seconds_s = divmod(seg_start, 60)
            minutes_e, seconds_e = divmod(seg_end, 60)
            timestamp = f"[{int(minutes_s):02d}:{int(seconds_s):02d} - {int(minutes_e):02d}:{int(seconds_e):02d}]"
            print(f"{timestamp} ({best_speaker}): {seg['text'].strip()}")
            
    except Exception as e:
        print(f"\nDiarization failed to run: {e}")
        print("\nPrinting Whisper raw text instead (without Speaker labels):")
        for seg in whisper_segments:
            minutes_s, seconds_s = divmod(seg["start"], 60)
            minutes_e, seconds_e = divmod(seg["end"], 60)
            timestamp = f"[{int(minutes_s):02d}:{int(seconds_s):02d} - {int(minutes_e):02d}:{int(seconds_e):02d}]"
            print(f"{timestamp} (TRANSCRIPT ONLY): {seg['text'].strip()}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python stt-diarize-local.py <path_to_audio_file>")
        sys.exit(1)
        
    audio_file = sys.argv[1]
    if not os.path.exists(audio_file):
        print(f"File not found: {audio_file}")
        sys.exit(1)
        
    if check_dependencies():
        run_diarization(audio_file)

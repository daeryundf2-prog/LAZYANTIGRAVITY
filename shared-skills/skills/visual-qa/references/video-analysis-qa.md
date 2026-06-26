# Video Analysis QA Rules

To prevent models from hallucinating visual events, misidentifying objects/actions, or misreporting temporal boundaries in video analysis, all video tasks must be verified programmatically and through multi-modal cross-checks.

---

## 1-10 Scoring Rubric for Video Analysis Tasks

| Score Range | Tier | Criteria |
| :--- | :--- | :--- |
| **8 - 10** | **Premium / Excellent** | - **Programmatic Frame Extraction**: Video is decoded at target intervals (e.g. 1 frame/sec or scene change detection) using OpenCV/FFmpeg to audit keyframes.<br>- **Multi-Modal Cross-Checking**: Video metadata, visual OCR (on-screen text), audio transcript, and visual actions are cross-referenced to verify consistency.<br>- **Action Tracking & Temporal Accuracy**: Actions and objects are localized with precise start/end timestamps ($\pm 0.5$ sec accuracy).<br>- **Zero-Hallucination**: No non-existent objects, actions, text, or scene changes are reported. |
| **5 - 7** | **Moderate / Standard** | - **General Keyframe Review**: Video is analyzed using standard LLM video features (or coarse frame sampling), but lacks precise temporal audits.<br>- **Rough Timing**: Core events are localized within $\pm 3.0$ seconds of their actual occurrence.<br>- **Basic Visual-Audio Sync**: The overall audio-visual relationship is checked, but sub-second syncing is not verified.<br>- **Minor Hallucinations**: Low-contrast objects or rapid motion may be misclassified or missed. |
| **1 - 4** | **Basic / Low** | - **Pure Guesswork**: The model describes the video content based on titles, description metadata, or short text summaries without decoding the visual frames.<br>- **Severe Hallucination**: Model claims to see objects, actions, or text that are completely absent.<br>- **Timing Mismatch**: Core event timestamps are off by $> 5.0$ seconds or completely mismatched.<br>- **No Verification**: No keyframe extraction, OCR checks, or audio alignment is performed. |

---

## Technical Verification Checklist

To achieve a score of **8 - 10**, the video analysis task must implement and verify the following checks:

### 1. Programmatic Frame Extraction & Visual Auditing
- **Check**: Run a script to extract frames at scene boundaries or at a high frequency (e.g. every $1.0$ second).
- **Rule**: If the model claims a specific event occurred at timestamp $T$, the corresponding frame extracted at $T$ must explicitly display the visual elements (e.g. object, slide, person, slide text) that verify the claim.
- **Action**: Compile a grid of keyframes corresponding to all reported events and cross-verify with the textual claims.

### 2. OCR (On-Screen Text) Timeline Cross-Check
- **Check**: Run an OCR engine (e.g., Tesseract, EasyOCR, or PaddleOCR) on the extracted keyframes:
  $$\text{OCR Text}(t) = \text{ReadText}(\text{Frame}(t))$$
- **Cross-Check**: If the video analysis report summaries or slides text are mentioned, programmatically match the reported text with $\text{OCR Text}(t)$.
- **Action**: Flag any text mentioned in the analysis that cannot be found via OCR in the corresponding video frames as a **HALLUCINATION**.

### 3. Temporal Action Localization & Object Tracking
- **Check**: Verify that the duration of identified actions aligns with physical frame counts:
  $$\text{Action Duration} = (f_{\text{end}} - f_{\text{start}}) \times \frac{1}{\text{FPS}}$$
- **Object Check**: If an object is claimed to be moving or present, verify its continuous presence across frames (e.g., via YOLO tracking or visual bounding-box consistency).
- **Action**: Flag actions claimed to happen instantaneously (e.g., "the car turned left") that cannot be traced over a sequence of at least $0.5$ seconds of frames.

### 4. Audio-Visual Consistency
- **Check**: Align the audio STT transcript timestamps with the visual frames:
  $$\text{Speech Transcript}(t) \longleftrightarrow \text{Visual Movement}(t)$$
- **Rule**: Ensure lip sync or visual activities (e.g. slides changing, speaker talking, objects interacting) align with the spoken audio cues.

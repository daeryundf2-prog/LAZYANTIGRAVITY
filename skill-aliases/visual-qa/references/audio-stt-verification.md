# Audio & STT Verification QA Rules

To prevent models from hallucinating speech, omitting silent segments, or outputting transcription errors during audio processing, all audio-to-text (STT) tasks must be verified against strict programmatic and multi-pass verification rules.

---

## 1-10 Scoring Rubric for STT/Audio Tasks

| Score Range | Tier | Criteria |
| :--- | :--- | :--- |
| **8 - 10** | **Premium / Excellent** | - **Double-Pass Audit**: Transcription is executed via two distinct models/parameters, and a programmatic word-level alignment diff is calculated.<br>- **Voice Activity Detection (VAD) Mapping**: Silent and speech intervals are programmatically audited to verify that no speech is omitted, and no silence is transcribed as speech.<br>- **Sub-Second Timestamp Sync**: Word or phrase timestamps are verified to align exactly with audio frames, with zero temporal drift.<br>- **Zero-Hallucination & Zero-Omission**: All filler words, quiet murmurs, and overlapping voices are audited for accuracy. |
| **5 - 7** | **Moderate / Standard** | - **Single-Pass Run**: Standard transcription is done using a single model pass.<br>- **Total Duration Check**: The total duration of the transcript timestamps is checked against the audio file's actual duration.<br>- **No VAD Check**: Silent intervals are skipped based on model defaults without secondary validation.<br>- **Minor Omissions**: Very low volume segments or rapid speech may occasionally be dropped or summarized. |
| **1 - 4** | **Basic / Low** | - **Acoustic Hallucination**: The model invents sentences, agreements, or statements that do not exist in the source audio.<br>- **Huge Omissions**: Large segments of speech are skipped or truncated without notification.<br>- **Misalignment**: Timestamps drift significantly (e.g. by > 3 seconds) from actual audio speech.<br>- **No verification**: The raw model output is accepted without any sanity checks. |

---

## Technical Verification Checklist

To achieve a score of **8 - 10**, the STT/Audio task must implement and verify the following checks:

### 1. Double-Pass Transcript Comparison (WER/Semantic Diff)
- **Check**: Generate two independent transcriptions (e.g., Run A: Whisper Large-v3, Run B: Whisper Large-v3 with temperature tuning, or a different local ASR engine).
- **Metric**: Programmatically calculate the Word Error Rate (WER) and Character Error Rate (CER) between the two passes:
  $$\text{WER} = \frac{S + D + I}{N}$$
  *(where $S$ is substitutions, $D$ is deletions, $I$ is insertions, and $N$ is total reference words)*.
- **Action**: Highlight any mismatch (where WER $> 5\%$ or CER $> 2\%$) for manual validation or secondary oracle review.

### 2. Voice Activity Detection (VAD) & Omission Audit
- **Check**: Run a standalone lightweight VAD tool (e.g., PyAnnote, WebRTCVAD, or Silero VAD) to map all active speech boundaries:
  $$\text{Speech Intervals} = \{ [t_{\text{start}, i}, t_{\text{end}, i}] \}$$
- **Omission Check**: Ensure every speech interval identified by VAD contains corresponding transcribed text. If an interval has $>1.5$ seconds of speech but no transcription, flag as **OMISSION**.
- **Hallucination Check**: If the transcript contains text in a segment identified by VAD as silence (no speech activity), flag as **HALLUCINATION**.

### 3. Timestamp & Audio Frame Synchronization
- **Check**: Programmatically verify that the last timestamp of the transcript does not exceed the audio file duration:
  $$t_{\text{final}} \le \text{Duration}_{\text{audio}}$$
- **Action**: Detect temporal drift. For long audio files ($>10$ minutes), sample 3 random timestamps and programmatically listen or slice the audio at those timestamps to verify that the transcribed text matches the spoken words in that exact sub-second range.

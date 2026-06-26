---
name: visual-qa
description: "Rigorous visual and multimodal QA for UI/UX design, code, data analysis, audio/STT, and video tasks. MUST USE to verify outputs, evaluate aesthetics, and prevent hallucinations using strict 1-10 scoring rubrics and programmatic checks. Triggers: visual QA, visual regression, screenshot diff, pixel diff, CJK text, terminal UI, TUI, data analysis, STT, audio analysis, transcription audit, video QA, video tracking, OCR check, model hallucination prevention, data bias check."
---

## Codex Harness Tool Compatibility

This skill may include examples copied from the OpenCode harness. In Codex, do not call OpenCode-only tools such as `call_omo_agent(...)`, `task(...)`, `background_output(...)`, or `team_*(...)` literally. Translate those examples to Codex native tools:

| OpenCode example | Codex tool to use |
| --- | --- |
| `call_omo_agent(subagent_type="explore", ...)` | `multi_agent_v1.spawn_agent({"message":"TASK: act as an explorer. ...","agent_type":"explorer","fork_context":false})` |
| `call_omo_agent(subagent_type="librarian", ...)` | `multi_agent_v1.spawn_agent({"message":"TASK: act as a librarian. ...","agent_type":"librarian","fork_context":false})` |
| `task(subagent_type="plan", ...)` | `multi_agent_v1.spawn_agent({"message":"TASK: act as a planning agent. ...","agent_type":"plan","fork_context":false})` |
| `task(subagent_type="oracle", ...)` for final verification | `multi_agent_v1.spawn_agent({"message":"TASK: act as a rigorous reviewer. ...","agent_type":"lazycodex-gate-reviewer","fork_context":false})` |
| `task(category="...", ...)` for implementation or QA | `multi_agent_v1.spawn_agent({"message":"TASK: act as an implementation or QA worker. ...","fork_context":false})` |
| `background_output(task_id="...")` | `multi_agent_v1.wait_agent(...)` for mailbox signals |
| `team_*(...)` | Use Codex native subagents via `multi_agent_v1.spawn_agent`, `multi_agent_v1.send_input`, `multi_agent_v1.wait_agent`, and `multi_agent_v1.close_agent` |

Role-specific behavior must be described in a self-contained `message`. Use `fork_context: false` to start the child with only the initial prompt (no parent history); use `fork_context: true` only when full parent history is truly required. Include any required conversation context, files, diffs, constraints, and requested skill names directly in the spawned agent's `message`. OMO installs these selectable agent roles into `~/.codex/agents/`: `explorer`, `librarian`, `plan`, `momus`, `metis`, `lazycodex-code-reviewer`, `lazycodex-qa-executor`, and `lazycodex-gate-reviewer` - pass the matching name as `agent_type` so the child gets that role's model and instructions. If the spawn tool exposes no `agent_type` parameter, omit it and describe the role inside `message`. If a code block below conflicts with this section, this section wins.

For work likely to exceed one wait cycle, require the child to send `WORKING: <task> - <current phase>` before long passes and `BLOCKED: <reason>` only when progress stops. A `multi_agent_v1.wait_agent` timeout only means no new mailbox update arrived. Treat a running child as alive. Fallback only when the child is completed without the deliverable, ack-only after followup, explicitly `BLOCKED:`, or no longer running.

# Visual & Multimodal QA - Multi-Oracle Verification

Verify any visual design, code implementation, data analysis, audio (STT), or video task against intent using objective script evidence plus two parallel read-only oracle passes, then synthesize one good/bad verdict and a 1-10 quality score.

## Purpose and when to use

- Use after you build or change any UI, write new code, perform data analysis, run STT transcriptions, or generate video insights.
- Prevents visual regression, code bugs, data bias, speech transcription hallucinations, and temporal video localization errors.
- Skip when the task has no visual, code, data, audio, or video output.

In the commands below, `$SKILL_DIR` is this skill's own directory. Reference guides containing detailed checklists and scoring rules are available at:
- Code QA: [code-hallucination-prevention.md](file:///Users/shinyoohag/.gemini/config/plugins/lazyantigravity/skills/visual-qa/references/code-hallucination-prevention.md)
- Data QA: [data-bias-mitigation.md](file:///Users/shinyoohag/.gemini/config/plugins/lazyantigravity/skills/visual-qa/references/data-bias-mitigation.md)
- Audio/STT QA: [audio-stt-verification.md](file:///Users/shinyoohag/.gemini/config/plugins/lazyantigravity/skills/visual-qa/references/audio-stt-verification.md)
- Video QA: [video-analysis-qa.md](file:///Users/shinyoohag/.gemini/config/plugins/lazyantigravity/skills/visual-qa/references/video-analysis-qa.md)

---

## 1-10 Scoring Rubric for Visual Design & UI/UX

Evaluate visual elements across typography, colors, spacing, alignment, responsive behavior, CLS, and CJK text.

| Score | Tier | Visual & UI/UX Rubric Criteria |
| :--- | :--- | :--- |
| **8 - 10** | **Premium / Excellent** | - **Fluid Typography & Naming**: Typographic scale uses `clamp()` equations; elements have semantic, readable class names and follow clean BEM or modular patterns.<br>- **Negative Space & Grid**: Spacing strictly conforms to 4px/8px grid system; overlaps are explicitly defined with named grid areas and strict z-index elevation registries.<br>- **Color Palette Aesthetics**: Custom-tailored dark/light mode with glassmorphism, smooth CSS transitions (e.g., `transition-all duration-200`), and curated HSL colors.<br>- **CJK Precision**: Natural CJK line breaking (no Korean words awkwardly split mid-syllable), zero glyph drops (tofu), or baseline clipping.<br>- **Responsive & Zero CLS**: 100% stable layouts with predefined element aspect-ratios, resulting in Cumulative Layout Shift (CLS) of 0. |
| **5 - 7** | **Moderate / Standard** | - **Static Alignment**: Layout matches design, but spacing uses hardcoded px values rather than dynamic grid variables.<br>- **Basic Aesthetics**: Standard layout with generic colors (plain gray, standard primary colors) and static fonts (no responsive scaling).<br>- **Imperfect CJK Wrap**: Text wraps normally but sometimes splits labels or CJK semantic phrases in an unpolished way.<br>- **Snapping Interactions**: Interactive elements work but change states instantly (no transition durations). Minor CLS on load. |
| **1 - 4** | **Basic / Low** | - **Broken Alignment**: Text clips boundaries, elements overlap due to fixed sizes, or borders misalign (TUI).<br>- **Raw Styling**: Browser default fonts, unstyled default inputs, raw borders, lack of negative space, chaotic structure.<br>- **Severe CJK Clipping**: Korean/Japanese/Chinese text clipped at bottom (baseline drop), missing glyphs, or wrapping results in single character orphans.<br>- **High CLS & Snapping**: Major page shifts during loading, visual assets pop in destructively. |

### How to Elevate Scores (From 6-7 to 9-10)
1. **Typography**: Replace absolute sizes (`font-size: 16px`) with fluid typography (`font-size: clamp(0.9rem, 2vw, 1.2rem)`).
2. **Colors & Transitions**: Implement dynamic CSS variables, GPU-composited animations (`opacity`, `transform`), and hover states.
3. **Grid**: Use CSS Grid or Flexbox with standard gap values (multiples of 8px). Replace arbitrary margins with standard padding tokens.
4. **Localization**: Wrap CJK text in containers with `word-break: keep-all; overflow-wrap: break-word;` to enforce natural semantic line wraps.

---

## Step 1 - Detect the Task Modality

Identify which modality checklist to load:
- **Web UI**: Web-browser rendered DOM, components, and canvas.
- **TUI**: Terminal-rendered text UI (box borders, panes, status lines).
- **Code**: Newly implemented source files, libraries, or logic.
- **Data**: Datasets, statistic logs, or analysis outputs.
- **Audio/STT**: Spoken audio files, transcriptions, or subtitle files.
- **Video**: Video recordings, keyframes, or screen captures.

If the task touches multiple modalities, run verification for all active tracks.

---

## Step 2 - Gather and Execute Verification Scripts

### Web & TUI Visual Evidence
Follow the standard `image-diff` and `tui-check` commands to capture evidence.
- Web diff: `bun "$SKILL_DIR/scripts/cli.ts" image-diff <reference.png> <actual.png>`
- TUI check: `bun "$SKILL_DIR/scripts/cli.ts" tui-check capture.txt --cols <N>`

### Non-Visual Modalities
For Code, Data, Audio, and Video, run the corresponding verification commands (compiler diagnostics, double-pass STT scripts, VAD outputs, FFmpeg frame extractions) as defined in their reference guides.

---

## Step 3 - Dispatch Two Read-Only QA Subagents in Parallel

Send both task calls in a single message. The two oracle passes must evaluate the task using the respective modality criteria and output both a verdict and a score (1-10).

### Pass A - Integrity and Logic Validation (Deeper, Strict)

```
task(subagent_type="oracle",
  run_in_background=true,
  load_skills=[],
  description="QA Pass A: Integrity and logic validation",
  prompt="""
REVIEW TYPE: INTEGRITY AND LOGIC VALIDATION (read-only)
TIER INTENT: Deeper, stricter pass. Reason exhaustively. Assume the output contains hallucinations, biases, or bugs until proven otherwise.

TASK TYPE: {web-ui | tui | code | data | audio-stt | video}

INTENT:
{User request details and expected output}

INPUTS & EVIDENCE:
{Full source code, data summaries, plain text transcriptions, frame lists, script outputs, or image diff JSON}

EVALUATION CHECKLIST:
- For Web/TUI UI: Verify real design system tokens, fluid typography compliance, 8px grid alignment, and z-index elevation.
- For Code: Verify compiler/type-checker diagnostics, API signature correctness, test-driven validation, and edge case coverage.
- For Data: Verify representativeness, check class imbalances, review outlier handling (IQR), and audit missing data.
- For Audio/STT: Verify multi-pass transcription differences, audit silence/omission segments, and check timestamp boundary synchronization.
- For Video: Verify frame extraction coverage, OCR timeline alignment, temporal action boundaries, and audio-visual consistency.

OUTPUT:
VERDICT: PASS | REVISE | FAIL
SCORE: {1-10}
CONFIDENCE: HIGH | MEDIUM | LOW
SUMMARY: 1-3 sentences
FINDINGS: for each, [severity] what is wrong, location, and the concrete fix
BLOCKING: items that must be fixed; empty if PASS
"""
)
```

### Pass B - Fidelity and Precision (Focused)

```
task(subagent_type="oracle",
  run_in_background=true,
  load_skills=[],
  description="QA Pass B: Fidelity and precision",
  prompt="""
REVIEW TYPE: FIDELITY AND PRECISION (read-only)
TIER INTENT: Focused precision pass. Direct visual, textual, and acoustic alignment audit.

TASK TYPE: {web-ui | tui | code | data | audio-stt | video}

INPUTS & EVIDENCE:
{Captures, file contents, logs, transcription comparisons, VAD timelines, frame metadata, or OCR diff JSON}

EVALUATION CHECKLIST:
- For Web/TUI UI: Match visual layout, colors, negative space, responsive wrapping, CJK semantic line breaking, and CLS scores.
- For Code: Verify compliance with existing codebase patterns, check type safety (any/ignore casts), name readability, and dependency safety.
- For Data: Verify correlation vs causation claims, check data bias skews, and audit statistical distributions.
- For Audio/STT: Catch word-level hallucinations, skipped murmurs/phrases, and timestamp drift.
- For Video: Catch visual timeline hallucinations, verify action tracking localization, and audit OCR accuracy.

OUTPUT:
VERDICT: PASS | REVISE | FAIL
SCORE: {1-10}
CONFIDENCE: HIGH | MEDIUM | LOW
SUMMARY: 1-3 sentences
EVIDENCE TRACE: mapping discrepancies to their visual/textual/audio source causes
FINDINGS: for each, [severity] what is wrong, location, and the concrete fix
BLOCKING: items that must be fixed; empty if PASS
"""
)
```

---

## Step 4 - Synthesize One Verdict and Score

Merge both passes into a single report. Calculate the final score as the minimum of Pass A and Pass B scores to ensure strict adherence to quality.

Completion gate: The task is not complete unless both passes are satisfied AND the final score is **8 or higher**. If the score is below 8, follow the "How to Elevate Scores" guides, fix the issues, and run verification again.

```markdown
# Multimodal QA - Verdict: GOOD (Score: {N}/10) | NEEDS WORK (Score: {N}/10)

| Modality / Dimension | Pass | Score (1-10) | Verdict | Evidence |
|---|---|---|---|---|
| Design & UI/UX | A+B | {score} | good/bad | ... |
| Code & Logic Integrity | A | {score} | good/bad | ... |
| Data Bias & Analysis | A+B | {score} | good/bad | ... |
| Audio & STT Precision | B | {score} | good/bad | ... |
| Video QA & Timeline | B | {score} | good/bad | ... |

## Must fix
[List of blocking issues, location, and concrete fix to elevate score to >= 8]

## Good, keep it
[Correct aspects that must not regress]

## Completion gate
[Verdict summary and final verified score]
```

---

## Step 5 - Clone-Coding Mode (Visual Design Port Only)

If the task was specifically a visual clone or Figma-to-code port, follow the mandatory pixel-perfect comparison and `lazycodex-clone-fidelity-reviewer` checklist as described in standard visual QA guidelines, ensuring the structural code quality matches a score of **8 - 10**.

## Reference evidence is not the verdict

The scripts provide raw diffs and measurements. The oracles must synthesize the raw data with cognitive verification to confirm that the code is robust, the transcriptions are clean, the data is unbiased, and the video matches the timeline. A high script similarity score is a FAIL if it hides a hallucination or a data skew. Use the numbers to target the review, then trust the synthesized score.

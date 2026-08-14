---
name: information-density
description: "Information density scoring, supply-demand topic gate, and slop/fluff elimination engine inspired by show-me-the-money v2.8.0. Triggers: density-score, topic-gate, content-craft, slop-rejection, /density-score, /topic-gate."
metadata:
  short-description: "Information density scoring, supply-demand topic gate, and fluff elimination for code and docs"
---

# information-density (High-Density Content & Code Quality Engine)

Inspired by the Supply-Demand Topic Gate and Information Density Scoring methodology introduced in `show-me-the-money` v2.8.0, this skill eliminates AI slop, filler text, boilerplate code, and redundant documentation by enforcing strict information density thresholds.

## 1. Core Operating Protocols

### A. Supply-Demand Topic Gate
Before generating documentation, proposals, or architecture specs, pass the 3-Edge Test:
1. **First-Hand Data**: Does this response present empirical test data or code execution evidence?
2. **Contrarian-but-Correct**: Does this proposal correct common misconceptions with verified evidence?
3. **Plain-Words Translation**: Does it explain complex mechanics cleanly without jargon filler?
- *Rule*: Reject generic AI summaries that explain what the top 5 search results already say.

### B. Information Density Scoring (0–100 Anchor Calibration)
Score all generated paragraphs and code comments against calibrated density anchors:
- **80–100 (High Density)**: Contains concrete metrics, code diffs, root-cause tracebacks, or non-obvious architectural tradeoffs.
- **40–79 (Moderate Density)**: Standard explanatory text with clear technical context.
- **< 40 (Low Density / Slop)**: Generic pleasantries, vague summaries, repeating the prompt, or restating trivial code logic.
- *Action*: Cut all text scored below 40. Expand or replace with empirical evidence.

### C. One-Core Resonance Rule
- Focus each module, document, or response on **one primary core mechanism**.
- Eliminate dilution, unstated assumptions, and stance drift.

## 2. Examples

- **Low Density (< 40)**:
  > "In this task, we will look into the codebase and analyze how the models are routed, and then we will update the catalog to make sure everything works smoothly."
- **High Density (80–100)**:
  > "Updated `model-catalog.json` `antigravity.current.model` to `gemini-3.7-flash-high` with `canTierRoute: true`, `hostEnforced: false`. Documented `invoke_subagent` model_tier as an agent hint. Verified 124 unit tests pass."

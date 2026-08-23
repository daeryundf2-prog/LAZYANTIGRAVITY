---
name: visual-qa
description: "Rigorous visual QA for any UI you built or changed, across BOTH web/page UIs and TUI/terminal UIs. MUST USE after building or changing any UI to verify it visually before declaring it done. Captures objective reference evidence with a bundled diff script (image-diff for screenshots, tui-check for terminal captures), then runs two parallel read-only oracle passes (design-system and functional integrity; visual fidelity and CJK precision) and synthesizes one good/bad verdict. Triggers: visual QA, visual regression, screenshot diff, pixel diff, image comparison, UI looks wrong, design system check, is this really a design system or just an image, alpha channel breakage, responsive check, CJK text, Korean/Japanese/Chinese text clipping, baseline drop, glyph drop, TUI alignment, terminal UI, tmux capture, box-drawing border misalignment, wide-character column drift. Use it even when the user does not say visual QA but asks whether a page, component, or terminal layout looks right."
---

## Antigravity Tool Mapping (default)

This plugin defaults to **Google Antigravity**. Read `../references/antigravity-tools.md`.

| Intent | Antigravity action |
| --- | --- |
| Explore / research / plan / implement / QA / review | `invoke_subagent` + TASK/DELIVERABLE/SCOPE/VERIFY + role envelope |
| Wait / poll children | Stay in parent; re-invoke incomplete lanes |
| Child model hint | Pass `Subagents[].Model`: `flash` (plan/code/research), `pro` (verify), `flash_lite` (tiny chores), `inherit` |

Use Antigravity tools only (`invoke_subagent`). Do **not** invent foreign spawn/wait/goal APIs or OpenCode kwargs.

## Purpose and when to use

- Use after you build or change any UI, before calling it done. Covers web/page UIs and TUI/terminal UIs.
- Use when output must match a mock, a baseline, or a stated design intent; when you suspect a regression; when CJK (Korean/Japanese/Chinese) text may clip or misalign; when a claimed design system might actually be a flat image; when a terminal layout may overflow or its borders may break.
- Skip when there is no rendered surface (pure backend or library logic with no visual or terminal output). For broad post-implementation review use review-work; this skill is the visual specialist.

In the commands below, `$SKILL_DIR` is this skill's own directory (the folder containing this SKILL.md). The bundled script lives at `scripts/cli.ts` inside it.

## Step 1 - Detect the surface

- Web/page UI: renders in a browser (HTML/CSS/JS, components, canvas, SVG). Evidence is screenshots.
- TUI/terminal UI: renders as text in a terminal (box-drawing, panes, status lines, REPL/TUI apps). Evidence is terminal captures.

If the change touches both, run both capture tracks and feed both into the passes.

## Empirical Vision & OCR Rules (Anti-Hallucination & Quota Independence)

1. **Mandatory Absolute Paths**: Never pass vague or relative filenames (e.g. `slide-01.png`) when dispatching visual reviews. Without absolute paths (`file:///absolute/path/to/img.png`), models risk hallucinating plausible-sounding contents that do not exist.
2. **Verbatim Title / Label Quote Proof**: Always instruct the reviewer: *"Quote the exact title and main UI labels verbatim from the image."* Mismatched quotes prove the image was not genuinely inspected.
3. **Quota Independence**: Vision / OCR inspections consume the text token bucket, NOT the image generation capacity bucket (`gemini-3.1-flash-image`). Even if image generation encounters a 429 limit, visual QA loops continue to function at full capacity.

## Step 2 - Capture objective reference evidence

### Web

Drive a REAL browser at the same viewport size as the reference. Preferred channel: the **Playwright MCP** server (`playwright` in `mcp_config.json`; opt-in via `mcp_config.playwright.example.json`, runs locally, no browser needed in the project). Fall back to the project's own Playwright/puppeteer tooling only when the MCP server is unavailable.

1. Capture a REFERENCE image: the user's mock/target, or a known-good baseline. Save as PNG.
2. Capture the ACTUAL rendered screenshot with Playwright MCP, using the accessibility-tree tools (do not guess selectors):
   - `browser_navigate` to the page URL.
   - `browser_resize` to the same width/height as the reference viewport.
   - `browser_snapshot` to get the accessibility tree and element refs; reach every state (hover, open menu, active tab) with `browser_click` / `browser_type` / `browser_wait_for` before screenshotting. Interact the way a user would.
   - `browser_take_screenshot` (fullPage when the reference covers the whole page) and save to a PNG. Confirm rendering with `browser_console_messages` for page errors.
   - Tear the context down afterwards (`browser_close`) so no QA browser is left running.
3. Run the diff and keep the JSON:

```bash
npx -y tsx "$SKILL_DIR/scripts/cli.ts" image-diff <reference.png> <actual.png>
```

Key fields: `dimensionsMatch`, `diffRatio` (0..1), `similarityScore` (0..100), `alphaChannelIntact`, `hotspots[]` (grid regions ranked by `diffRatio`).

Viewport matching matters: if the reference is 1440x900, `browser_resize(1440, 900)` before the screenshot so `dimensionsMatch` and the hotspots are meaningful.

### TUI

1. Capture plain text and an ANSI-preserving copy:

```bash
tmux capture-pane -p > capture.txt
tmux capture-pane -e -p > capture-ansi.txt
```

2. Run the check with the REAL terminal width and keep the JSON:

```bash
npx -y tsx "$SKILL_DIR/scripts/cli.ts" tui-check capture.txt --cols <N>
```

Key fields: `maxWidth`, `overflowLines[]`, `borderMisaligned`, `wideCharColumns[]`, `hasAnsi`.

This JSON (diff ratio, similarity score, hotspots or overflow lines, border alignment, wide-char columns, alpha) is REFERENCE evidence to aim the reviewers. It is not the verdict by itself.

## Step 3 - Dispatch two read-only QA passes in parallel

Send BOTH task calls in a single message so they run concurrently. Each oracle is read-only: it reviews and reports, it cannot modify files. Each returns PASS, REVISE, or FAIL with concrete, located findings.

Paste evidence directly into each prompt, because the oracle works only from the prompt text: source code, the plain-text TUI captures, the script JSON, and the screenshot paths plus your described observations for web.

### Pass A - Design-system and functional integrity (deeper, strict)

```
invoke_subagent(
  Subagents=[{
    TypeName: "self",
    Role: "Design System & Functional Integrity Reviewer",
    Model: "pro",
    Prompt: """
REVIEW TYPE: DESIGN-SYSTEM AND FUNCTIONAL INTEGRITY (read-only)
TIER INTENT: Treat this as the deeper, stricter pass. Reason exhaustively before concluding. Assume a plausible-looking surface may be faked until the source proves otherwise.

INTENT:
{What the user asked for, the mock or baseline, and the constraints.}

SURFACE: {web | tui | both}

SOURCE CODE:
{Full source of the UI: components, styles/tokens, layout, render code. Include neighboring files that show existing patterns.}

CAPTURES:
{Web: actual screenshot path(s) plus your described observations. TUI: paste capture.txt and capture-ansi.txt inline.}

SHARED SCRIPT EVIDENCE (reference, not verdict):
{Paste the image-diff or tui-check JSON. Use alphaChannelIntact for the transparency check.}

CHECK EACH:
1. Real design system vs ad-hoc: are styles driven by coherent design tokens and reused primitives, or one-off hardcoded values scattered per element?
2. Faked-with-an-image anti-pattern: is the UI a real DOM/component tree, or a pasted raster/screenshot or background-image standing in for live elements? For TUI: a real layout that reflows, or hardcoded pre-rendered text at fixed widths?
3. Alpha and transparency: handled correctly, with no unexpected opaque or black fills and correct PNG/CSS alpha? Cross-check alphaChannelIntact.
4. Code style and implementation quality.
5. Responsive and resize behavior across viewport sizes (web) or terminal resize (TUI).
6. Do the user-intended FEATURES actually work: interactions, states, navigation (web); input handling, resize, scroll (TUI)? Trace the code paths.
7. 3D & WebGL Canvas integrity: does the 3D canvas render properly without WebGL context loss, black screen fallback, or memory leaks? Are 3D elements constrained to container boundaries?

OUTPUT:
VERDICT: PASS | REVISE | FAIL
CONFIDENCE: HIGH | MEDIUM | LOW
SUMMARY: 1-3 sentences
FINDINGS: for each, [dimension] [severity] what is wrong, where (file/line or capture region), and the concrete fix
WHAT IS GOOD: correct aspects that must not regress
BLOCKING: items that must be fixed; empty if PASS
"""
  }],
  toolAction: "Reviewing design system and functional integrity",
  toolSummary: "Pass A visual review"
)
```

### Pass B - Visual fidelity and CJK precision (focused)

```
invoke_subagent(
  Subagents=[{
    TypeName: "self",
    Role: "Visual Fidelity & CJK Precision Reviewer",
    Model: "pro",
    Prompt: """
REVIEW TYPE: VISUAL FIDELITY AND CJK PRECISION (read-only)
TIER INTENT: Treat this as the focused visual pass. Anchor every claim to the script evidence and the captures.

INTENT:
{What the user requested and the mock or baseline to match.}

SURFACE: {web | tui | both}

CAPTURES:
{Web: actual and reference screenshot paths plus your described observations. TUI: paste capture.txt and capture-ansi.txt inline.}

SCRIPT EVIDENCE (required, consume every field):
{Paste the image-diff or tui-check JSON.}

USE THE EVIDENCE:
- Web (image-diff): start from diffRatio and similarityScore, then open every hotspots[] entry (gridX, gridY, x, y, width, height, diffRatio) and explain the visual cause of each flagged region.
- TUI (tui-check): inspect maxWidth vs expectedColumns, every overflowLines[] entry, borderMisaligned, and wideCharColumns[].

CHECK:
1. Does the rendered output match what the user requested: layout, spacing, color, type, alignment?
2. CJK precision:
   - Web: baseline/descender clipping, dropped glyphs (tofu), broken line-breaking, mismatched font metrics between reference and actual.
   - TUI: wide-character column drift (CJK cells counted as 1 instead of 2), box-drawing border misalignment, content overflowing past the terminal width.
3. 3D & Canvas rendering: verify canvas alpha channel transparency against page background, absence of z-fighting/flickering, and presence of graceful loading states.

OUTPUT:
VERDICT: PASS | REVISE | FAIL
CONFIDENCE: HIGH | MEDIUM | LOW
SUMMARY: 1-3 sentences
EVIDENCE TRACE: each hotspot or overflow line mapped to its visual cause
FINDINGS: for each, [severity] what is wrong, where (hotspot grid or capture line:col), and the concrete fix
BLOCKING: items that must be fixed; empty if PASS
"""
  }],
  toolAction: "Reviewing visual fidelity and CJK precision",
  toolSummary: "Pass B visual review"
)
```

### Pass C - Gemini 3.7 Flash vision pre-screen (fast, optional)

When Gemini 3.7 Flash is available as a subagent model, dispatch a fast vision pre-screen before the oracle passes. This pass uses Flash's multimodal image input capability to directly analyze the screenshot pixels, complementing the text-based oracle passes.

```
invoke_subagent(
  Subagents=[{
    TypeName: "self",
    Role: "Vision Pre-Screen Reviewer",
    Model: "flash",
    Prompt: """
REVIEW TYPE: FAST VISION PRE-SCREEN (read-only, advisory)
MODEL: Gemini 3.7 Flash — use your multimodal image input capability.

INTENT:
{What the user requested and the mock or baseline to match.}

CAPTURES (attach images directly):
{Web: attach actual and reference screenshot PNGs. TUI: paste capture.txt inline.}

SCRIPT EVIDENCE:
{Paste the image-diff or tui-check JSON for numeric reference.}

CHECK QUICKLY (this is a pre-screen, not a deep review):
1. Are there obvious visual regressions visible in the screenshot pixels? (layout shifts, color changes, missing elements, broken text)
2. For CJK text: any clipping, tofu (missing glyphs), or broken wrapping visible in the image?
3. Does the overall visual structure match the reference/baseline at a glance?

OUTPUT (advisory — does not override Pass A/B verdicts):
FLASH VERDICT: CLEAR | SUSPECT | FAIL
FLASH SUMMARY: 1-2 sentences
FLASH FLAGS: list each visual anomaly with approximate location/bounding grid (e.g. top-left, center, bottom-right nav) and CJK glyph state
"""
  }],
  toolAction: "Running vision pre-screen",
  toolSummary: "Pass C fast vision check"
)
```

Flash results are advisory. If Flash flags SUSPECT or FAIL, prioritize those regions in Pass A and Pass B. If Flash says CLEAR but Pass A/B find issues, the Pass A/B verdict wins.

## Step 4 - Synthesize one verdict

When both passes return, merge them into a single report. Per dimension, mark good or bad with evidence. For each bad item, state what is wrong, where (file/line, hotspot grid, or capture line), and the concrete fix. Call out what is genuinely good so it is not regressed later.

Completion gate: do not declare the UI done until both passes are satisfied, OR the remaining gaps are explicitly listed and accepted by the user. A high `similarityScore` with an open Pass A finding, for example a faked-image layout or a broken feature, is still a FAIL.

```markdown
# Visual QA - Verdict: GOOD | NEEDS WORK

| Dimension | Pass | Verdict | Evidence |
|---|---|---|---|
| Design system real vs faked | A | good/bad | ... |
| Features work | A | good/bad | ... |
| Responsive / resize | A | good/bad | ... |
| Alpha / transparency | A+B | good/bad | ... |
| Visual fidelity to intent | B | good/bad | ... |
| CJK precision | B | good/bad | ... |

## Must fix
[Blocking items, each with location and fix, in priority order]

## Good, keep it
[Correct aspects that must not regress]

## Completion gate
[Satisfied, or the exact remaining gaps and who accepted them]
```

## Reference evidence is not the verdict

The script quantifies pixels and columns. It cannot judge whether the result is a real design system, whether features work, or whether intent was met. A 99/100 `similarityScore` can still hide a pasted-image fake, a broken interaction, or clipped CJK descenders. Use the numbers to aim the oracles, then trust the synthesized review.

Illustrative output (locked field names):

```json
{
  "command": "image-diff",
  "dimensionsMatch": true,
  "reference": { "width": 1440, "height": 900 },
  "actual": { "width": 1440, "height": 900 },
  "totalPixels": 1296000,
  "diffPixels": 38880,
  "diffRatio": 0.03,
  "similarityScore": 97,
  "alphaChannelIntact": true,
  "hotspots": [
    { "gridX": 2, "gridY": 0, "x": 960, "y": 0, "width": 480, "height": 300, "diffRatio": 0.21 }
  ],
  "summary": "97/100 similarity; one hotspot in the top-right header region."
}
```

```json
{
  "command": "tui-check",
  "expectedColumns": 80,
  "lineCount": 24,
  "lineWidths": [80, 80, 82, 80],
  "maxWidth": 82,
  "overflowLines": [ { "line": 3, "width": 82 } ],
  "borderMisaligned": true,
  "wideCharColumns": [12, 13],
  "hasAnsi": false,
  "summary": "Line 3 overflows 80 cols by 2; borders misaligned at wide-char columns 12-13."
}
```


## References

- [ui-loopback](references/ui-loopback.md) — headless browser capture loop
- [frontend-ui-ux](references/frontend-ui-ux.md) — UI/UX review checklist

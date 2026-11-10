# Report-Gates Defect Glossary

This reference catalogs every defect code the report gates (`static`, `layout`, `visual`, `proofread`) can raise, their severity and impact, and how to repair them.

## Defect Codes by Category

### Static Gate (Content & Structure)

| Code | Severity | Integrity | What It Detects | How to Fix |
|------|----------|-----------|-----------------|-----------|
| `korean_no_keep_all` | major | false | Text containing Hangul uses default word breaking, causing character-level wrapping and orphaned characters on mobile or narrow containers. | Add "word-break: keep-all; overflow-wrap: anywhere" to the body or the slide text container. |
| `palette_off_token` | minor | false | Color values are hardcoded literals (hex, rgb) instead of design-system tokens or are missing from the design spec palette. | Replace the literal color with a design-spec token (var(--...)) or add the color to the spec palette. |
| `emoji_in_prose` | major | false | Emoji characters appear in body text, headings, or figure captions. Emoji render at inconsistent sizes and lack semantic meaning. | Remove the emoji; use an inline SVG icon or plain text. |
| `em_dash_in_prose` | major | false | Em dashes (—) are used in body text for sentence breaks or parenthetical asides. Readability and accessibility suffer without a rewrite. | Rewrite the sentence with a comma, colon, or period instead of an em dash. |
| `en_dash_in_prose` | minor | false | En dashes (–) are used incorrectly outside of numeric ranges. Only numeric ranges (e.g., "pages 5–10") should use en dashes. | Use a hyphen for compounds; keep the en dash only between numbers. |
| `heading_too_long` | minor | false | A heading exceeds one visual line: 26 Korean characters (52 display width units) or 12 English words. | Shorten the heading to one line (26 Korean characters or 12 English words). |
| `heading_generic` | minor | false | A heading uses generic labels (e.g., "Introduction", "Background") without conveying the section's specific claim or finding. | Make the heading carry the section's claim instead of a generic label. |
| `unsourced_number` | major | false | A numeric value (percentage, count, duration, ratio) appears without a source attribution, measurement tag, or derivation chain. | Tag the number MEASURED / ASSUMED / DERIVED or cite its source in the same paragraph. |
| `chart_without_figure` | major | false | An image or chart lacks a figure wrapper with a caption. Uncaptioned charts isolate visuals from narrative flow. | Wrap the image or chart in a figure container with a caption. |
| `chart_svg_no_text` | major | false | An SVG chart or diagram lacks a title, axis labels, units, or value labels. Visuals cannot stand alone without text guidance. | Give the chart a title, axis labels, units, and value labels as SVG text. |
| `chart_svg_missing_labels` | minor | false | An SVG chart has some labels (e.g., title) but is missing others (e.g., axis ticks or unit). | Add the missing title, axis ticks, or unit label to the chart. |
| `korean_serif_font` | major | false | A serif or brush Korean font family is applied to Korean text. The design spec mandates gothic (sans) Korean typefaces. | Use a gothic (sans) Korean family; serif and brush families are banned by the design spec. |
| `section_without_citation` | major | false | A major section or subsection contains no in-text citations or reference marks. Source attribution is missing. | Cite at least one source inside this section or merge it into a cited one. |
| `missing_closing_section` | blocker | true | The report lacks a closing section explaining the methodology, sources, and gate outcomes. Delivery is incomplete without narrative closure. | Add the closing section that explains how the report was made (method, sources, gates). |
| `missing_citation_section` | blocker | true | The report has no sources, references, or citation definitions (e.g., [S1], [S2]). Attribution is impossible. | Add a sources or references section, or [S<n>] definition lines. |
| `broken_asset_reference` | blocker | true | An asset file (image, diagram, spreadsheet) is missing or unreadable. The deliverable cannot be rendered or is incomplete. | Re-render or restore the missing asset file before delivery. |
| `missing_required_section` | blocker | true | A section explicitly required by the brief (e.g., via `--require-section`) is absent. | Add the section the brief requires (matched by --require-section). |
| `missing_promised_deliverable` | blocker | true | A deliverable (e.g., a slide deck, a chart, a data file) is promised in the brief but not delivered, not marked blocked_capability, and not skipped with a reason. | Produce the promised deliverable or record it as blocked_capability or skipped with a reason. |

### Reviewer checklist item next to `korean_no_keep_all` (not a gate code)

No gate raises this one; the reviewer checks it by reading the rendered lines at each checked width. Name the break and fix the container, not the wording.

| Item | What to look for | How to fix |
|------|------------------|-----------|
| `korean_orphan_particle` | A line ends or begins with a lone particle or verb ending (이, 가, 은, 는, 을, 를, 에, 도, 만, 부터, 까지, or an ending such as 요, 고) cut off from the word it belongs to, or a token (number plus unit, version, citation id) splits inside itself. | Keep `word-break: keep-all` with `overflow-wrap: anywhere`, widen the container, and drop any forced `<br>` inside a short phrase. If no named break applies, describe the break in words and invent no label. |

### Layout Gate (Rendering & Presentation)

| Code | Severity | Integrity | What It Detects | How to Fix |
|------|----------|-----------|-----------------|-----------|
| `layout_overflow` | major | false | An element exceeds its container width or height, causing horizontal scroll or content spillage in PDF, DOCX, or slide renders. | Constrain the element to its container (max-width: 100%, overflow-wrap: anywhere, or a narrower measure). |
| `layout_text_clipped` | major | false | Text is clipped or hidden by `overflow: hidden` or a fixed container height. Content is lost or unreadable. | Remove the overflow: hidden clip or give the text room to wrap. |
| `layout_scroll_container` | minor | false | A table or list is wrapped in a scrollable container for HTML deliverables. Scrolling content prints clipped in PDF or DOCX. | Scrolling content prints clipped; make the content fit or wrap the table in a scroll wrapper only for HTML deliverables. |
| `layout_image_distorted` | major | false | An image is distorted, stretched, or squeezed (aspect ratio is not preserved). The visual information is misrepresented. | Preserve the image aspect ratio (object-fit: contain inside a fixed container). |
| `layout_sibling_overlap` | major | false | Two adjacent block elements overlap (via negative margins, absolute positioning, or grid collision). Layout is broken. | Separate the overlapping elements (margins, grid, or a slide split). |

## Exit Codes

Gates emit a manifest-level outcome with one of three statuses:

| Status | Meaning |
|--------|---------|
| `pass` | All checks passed; no defects raised. |
| `fail` | One or more defects raised (blocker, major, or minor severity). Repair is required before delivery. |
| `not_run` | The gate was not invoked (e.g., no probe file provided for layout, no visual inspection conducted). |

### Layout Gate Probe File Requirement

The `layout` gate only runs when a probe file (a rendering artifact: PDF, PNG, or HTML snapshot) is provided alongside the manifest. If no probe file is available, the manifest records `layout: not_run` and the gate does not emit defects.

## Lineage and Citation Markers

Defect codes and their hints are delivered via the outcome manifest under `residualDefects` (if repair did not exhaust). Each defect entry includes:

- **code**: A string key from the table above (e.g., `"em_dash_in_prose"`)
- **message**: A human-readable narrative or location hint describing where the defect was found (e.g., "Line 42: em dash found in paragraph 2")

Citations within reports follow one of two lineage modes:

- **inline**: Source marks appear as `[Sn]` or `[Rn]` hyperlinks inline with the cited text.
- **section**: Sources are listed in a dedicated section with numbered entries ([S1], [S2], etc.).

Both modes are valid; choose based on the report's narrative flow.

## High-Risk Claims: Debate Record and Attributed-Only Status

These rules are applied by the reviewer and the leader, not raised as defect codes by a gate.

A claim is high risk when it is a number, a legal, regulatory, financial, medical or security statement, a dated "latest/current" statement, a causal claim, or a ranking that drives the recommendation. When unsure, treat it as high. A high-risk claim may be written as established fact only when all of these are recorded:

1. Two independent source domains (two pages on one domain count once).
2. One primary source that was opened, not quoted secondhand.
3. One counter-search that looked for a refutation, with its query in the log.
4. Explicit dates: source publish/update date, access date, and the date or version the claim holds for.
5. A `debate` record with at least two attacks from different perspectives (evidence quality, source independence, method, scope, alternative explanation). A repeated perspective counts once.

| claim id | attack | attacker perspective | defense | verdict (`holds` / `weakened` / `withdrawn`) | change to the claim |
|---|---|---|---|---|---|

Only one authoritative primary source can exist (a spec's own text, a vendor's own docs, a company's own filing): the second domain may be waived, with the reason written in the row. The counter-search, the dates and the debate are never waived.

Status when a step is missing:

- Counter-search could not run: the claim is `partial`. Write it only as attribution ("[S14] states that ..."), never as fact, and name the missing counter-search.
- Fewer than two debate attacks from different perspectives: the claim is `unverified` and stays in the unresolved list.
- Verdict `withdrawn`: the claim leaves the report.

Normal-risk claims keep the current rule: one opened source that supports the sentence.

Source: adapted from hypercore (MIT, alpoxdev) `skills/hyper-research/rules/claim-verification.md` and `skills/hyper-design/references/korean-break-quality.md`; see `NOTICE`.

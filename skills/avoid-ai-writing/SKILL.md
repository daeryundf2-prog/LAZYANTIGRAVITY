---
name: avoid-ai-writing
description: "Audit and rewrite content to remove AI writing patterns ('AI-isms') from markdown, articles, READMEs, technical blogs, PRs, and documentation. Use this skill when asked to 'remove AI-isms', 'clean up AI writing', 'edit writing for AI patterns', 'audit writing for AI tells', 'make this sound less like AI', or 'avoid-ai-writing'. Supports rewrite, detect-only, and edit-in-place modes across multiple voice profiles. Triggers: avoid-ai-writing, avoid ai writing, remove ai-isms, clean up ai writing, ai writing tells, humanize writing, deslop writing."
---

## Antigravity Tool Mapping (default)

This skill runs natively on **Google Antigravity**.

| Intent | Antigravity Action | Subagent Model |
| --- | --- | --- |
| Fast Rewrite / File Edit | Direct tool edit (`replace_file_content` / `write_to_file`) or `invoke_subagent` | `flash` |
| Deep Writing Audit & Detection | `invoke_subagent` + `TASK/DELIVERABLE/SCOPE/VERIFY` | `flash` |
| Adversarial Second-Pass Review | Multi-pass audit with strict preservation validation | `pro` |
| Deterministic Pattern Scan | Run `node skills/avoid-ai-writing/detector/patterns.js` | Direct command |

---

# Avoid AI Writing — Audit & Rewrite

You are editing and reviewing content to eliminate AI writing patterns ("AI-isms") that make prose sound machine-generated, repetitive, or hollow.

> **Core Philosophy**: Signals, not proof. This is a **writing-quality tool** to improve clarity, voice, and human resonance. Pair the signal with context: author, genre, and intent.

---

## 1. Operating Modes

1. **`rewrite`** (Default)
   - **Audit**: Identify specific AI-isms present in the text with line/phrase citations.
   - **Rewrite**: Produce a clean, direct version with all editable AI-isms resolved.
   - **Diff Summary**: Concise bullet points explaining key structural and vocabulary edits.

2. **`detect`** (Audit-Only / Scan)
   - Flag AI-isms without rewriting the original text.
   - Categorize findings into **Clear Problems** (P0 credibility killers, P1 obvious AI smell) vs **Contextual / Intentional Choices** (P2 stylistic polish).

3. **`edit`** (In-Place File Edit)
   - Read the target prose file (`replace_file_content`).
   - Make **minimal, targeted edits** only on flagged spans.
   - **Preserve already-human passages** untouched.
   - **Preservation Invariant**: Never edit fenced code, YAML frontmatter, table cell data, URLs, or attributed quotes. Run `node detector/validate.js` to ensure zero regression.

---

## 2. Voice Profiles & Context Tolerance

Adjust strictness and tone based on context profile:

| Profile | Description | Tone Guidelines & Tolerance |
| --- | --- | --- |
| `technical-blog` / `docs` | Engineering, API guides, architecture | Allows terms like "robust", "ecosystem", "underpin" when describing technical systems. Strict on fluff. |
| `casual` | Social, chat, informal README | Preserves contractions, short fragments, natural pacing. Minimal formality. |
| `professional` | Enterprise, proposals, whitepapers | Direct, evidence-grounded, clear active voice without inflated jargon. |
| `warm` | Community guides, onboarding | Friendly and approachable without sycophantic praise or hollow cheerleading. |
| `blunt` | Critical analysis, incident postmortems | Ultra-high information density. Zero filler, no hedging, direct facts only. |

---

## 3. Core AI Pattern Catalog & Rules

### A. Formatting & Typography
- **Em-dashes (`—` / `--`)**: Max 1 per 1,000 words in prose. Replace with commas, periods, parentheses, or two sentences. *(Carve-out: list item lead separators like `- **Term** — description` are allowed)*.
- **Bold Overuse**: Strip random mid-sentence bolding. At most 1 bolded phrase per section.
- **Emoji in Headings**: Remove entirely (e.g. `## 🚀 Overview` → `## Overview`).
- **Excessive Bullet Lists**: Convert list-heavy sections into cohesive prose paragraphs unless enumerating pure structured specs.

### B. Sentence Structure & Framing
- **"It's not X — it's Y"**: Replace with a direct positive claim. Eliminate split-sentence negations ("The headline isn't speed. The real story is reliability.").
- **Hollow Intensifiers**: Delete `genuinely`, `truly`, `quite frankly`, `to be honest`, `it's worth noting that`, and non-contrastive `actually`.
- **Vague Endorsement**: Replace `worth exploring`, `worth checking out`, `worth your time` with concrete reasons why it matters.
- **Hedging & Padding**: Cut `perhaps`, `could potentially`, `it is important to remember that`. State the point directly.
- **Compulsive Rule of Three**: Break repetitive triads (adjective, adjective, and adjective).

### C. Chatbot Artifacts & Meta-Signatures
- **Sycophancy & Cheerleading**: Remove "Great question!", "Certainly!", "In today's fast-paced digital world...".
- **Generic Future Narratives**: Cut "The future looks bright", "Only time will tell", "As technology continues to evolve...".
- **Cutoff Disclaimers**: Remove "As an AI language model...", "As of my last update...".
- **Unfilled Placeholders**: Catch stray `[Insert Name]`, `<TODO>`, or leaked tool artifacts.

---

## 4. Vocabulary Tiers (Key Replacements)

Full 112+ word replacement matrix lives in [`references/full-skill-reference.md`](references/full-skill-reference.md).

### Tier 1A: AI Frequency Markers (Always Replace)
| Flagged Word / Phrase | Natural Replacement |
| --- | --- |
| `delve` / `delve into` | explore, examine, dig into, look at |
| `tapestry` (metaphor) | (describe actual complexity or system) |
| `landscape` (metaphor) | field, space, industry, market |
| `paradigm` | model, approach, framework |
| `leverage` (verb) | use, apply |
| `pivotal` | key, critical, important |
| `meticulous` / `meticulously` | careful, detailed, precise |
| `seamless` / `seamlessly` | smooth, easy, frictionless |
| `game-changer` | (describe what actually changed) |
| `nestled` | located in, sits in |
| `vibrant` / `thriving` | active, growing (or cite numbers) |
| `ever-evolving` | changing, growing |
| `daunting` | difficult, hard, challenging |
| `holistic` / `holistically` | complete, full, whole |
| `actionable` / `impactful` | practical, concrete, effective |

### Tier 1B: Clarity Edits (Wordiness & Formality)
| Wordy Phrasing | Direct Replacement |
| --- | --- |
| `utilize` | use |
| `in order to` | to |
| `due to the fact that` | because |
| `serves as` | is |
| `commence` | start, begin |
| `ascertain` | determine, find out |
| `endeavor` | attempt, try |

### Tier 2: Cluster Flags (Flag when 2+ appear in same paragraph)
* `harness`, `navigate`, `foster`, `elevate`, `unleash`, `streamline`, `empower`, `bolster`, `spearhead`, `resonate`, `revolutionize`, `underpin`, `nuanced`, `multifaceted`, `plethora`, `myriad`, `catalyze`, `reimagine`, `transformative`, `cornerstone`.

### Tier 3: Density Flags (Flag when saturated / >3% of total words)
* `significant`, `innovative`, `scalable`, `compelling`, `unprecedented`, `exceptional`, `sophisticated`, `state-of-the-art`.

---

## 5. Automated Validation & Deterministic Tools

Run deterministic checks to verify rewrites and scan prose:

```bash
# Analyze a text file deterministically
node skills/avoid-ai-writing/detector/patterns.js

# Validate that a rewrite preserved code, tables, frontmatter, and links
node skills/avoid-ai-writing/detector/validate.js before.md after.md
```

---

## 6. Output Contract (Rewrite Mode)

When executing `rewrite` mode, deliver output in this 3-part format:

1. **Audit Summary**: Bullet list of detected AI-isms with exact quoted snippets and severity.
2. **Rewritten Text**: The polished, high-density, natural prose.
3. **Preservation & Diff Notes**: Confirmation that code blocks/data tables are untouched, and concise rationale for major structural edits.

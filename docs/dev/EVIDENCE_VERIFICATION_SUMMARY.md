# LazyAntigravity Evidence Verification System Summary

## 1. Overview
The Evidence Verification System eliminates automated false-completion and anti-hallucination paths in multi-agent workflows. It enforces strict classification of evidence states (`verified`, `partial`, `not_checked`, `inference`) and mandates explicit gap recording (`readRanges`, `unreadRanges`, `unknowns`, `inferences`).

---

## 2. Core Verification Invariants

### 1) Evidence Status Taxonomy & Purity Rules
- **`verified`**: The model has inspected 100% of the relevant scope with concrete, objective evidence.
  - **Invariant**: Must contain **zero** `unreadRanges`, **zero** `unknowns`, and **zero** `inferences`. Any presence of gaps immediately rejects verification.
- **`partial`**: Part of the scope was inspected or modified.
  - **Invariant**: Must explicitly declare remaining `unreadRanges` or `unknowns`.
- **`not_checked`**: Scope was skipped or untracked.
  - **Invariant**: Must document reason in `unknowns`.
- **`inference`**: Assumptions or unverified deductions made by the model.
  - **Invariant**: Must explicitly list all unverified assumptions under `inferences`.

### 2) Quality Gate Completion Lock (`ulw-loop`)
- The `quality_gate.completed` event is emitted **only** when evidence is valid, strictly `verified`, and gap-free.
- Any unresolved gaps, unread ranges, or missing verification will transition the workflow to `needs_user_decision` instead of automated finalization.

### 3) Active Learning Memory Provenance Gate
- Memory promotion to persistent storage (`facts.jsonl`) cannot occur with `--approve` alone.
- Promotion requires valid `--evidence-json` satisfying `status: "verified"` with zero `unknowns` or `inferences`.
- Saved fact records include `source: "active-learning"`, `evidenceStatus: "verified"`, and `evidenceSummary`.

---

## 3. Usage Example

```bash
# Evolve rules and promote learned gotchas with verified evidence
omo active-learning evolve \
  --approve \
  --evidence-json ./evidence.json
```

Sample `evidence.json`:
```json
{
  "status": "verified",
  "summary": "100% test coverage and compiler diagnostics clean",
  "readRanges": [
    { "file": "src/auth.ts", "startLine": 1, "endLine": 150 }
  ],
  "filesChanged": ["src/auth.ts"],
  "commandsRun": ["npm test"]
}
```

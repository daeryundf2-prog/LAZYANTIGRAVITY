---
name: cjk-cleaner
description: "CJK Spacing Normalizer. Cleans extraneous spaces, handles C/J spacing, decomposes Jamo to NFC, and normalizes inter-script borders. Triggers: clean cjk spacing, normalize cjk, cjk-cleaner, CJK spacing slop, clean text spacing."
metadata:
  short-description: "Clean up and normalize CJK text spacing and whitespace layout artifacts"
---
# CJK Spacing Normalizer

Explain how to run it:
- Run: `node scripts/clean-cjk-spacing.mjs <file_path>`
- Parse HWP with clean: `node scripts/convert-hwp.mjs <file_path> --clean`

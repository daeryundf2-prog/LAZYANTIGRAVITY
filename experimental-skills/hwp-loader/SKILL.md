---
name: hwp-loader
description: "HWP/HWPX Context Loader. Automatically parse Korean word processor documents (.hwp, .hwpx) into markdown files using the rhwp parser, providing rich context to the AI agent. Triggers: read hwp, parse hwp, load hwp, hwp-loader, hwp context."
metadata:
  short-description: "Extract text and structured data from .hwp/.hwpx files into workspace markdown files"
---

# hwp-loader (HWP/HWPX Context Loader)

You are equipped with the HWP/HWPX Document Reader skill. When a user provides a `.hwp` or `.hwpx` file in the workspace or requests you to parse a 한글 document, you must convert it into structured markdown text to use as context.

## 1. Core Workflow

1.  **Detect HWP Files**:
    - Regularly scan the workspace or inspect specific files requested by the user.
    - If a `.hwp` or `.hwpx` file is detected, invoke the conversion script.

2.  **Run Parse Script**:
    - Run the parser command to output text contents:
      ```bash
      node scripts/convert-hwp.mjs <relative_path_to_hwp>
      ```
    - This will generate a `.omo/hwp-cache/<filename>.md` containing the extracted text and layout structure.

3.  **Read and Bind Context**:
    - Use `view_file` to read the generated markdown cache.
    - Embed the content inside your agent context inside `<hwp-context>` tags:
      ```xml
      <hwp-context source="path/to/document.hwpx">
      [Parsed markdown content from .omo/hwp-cache/...]
      </hwp-context>
      ```

4.  **Acknowledge**:
    - Inform the user that you successfully parsed the document and are using it as context for code implementation or review.

## 2. Formatting & Rules

- Ensure you do not modify the original `.hwp`/`.hwpx` binary files.
- Stale text dumps should be prunable via standard evidence rules.
- Treat the extracted HWP text as a **sourced** claim provenance reference.

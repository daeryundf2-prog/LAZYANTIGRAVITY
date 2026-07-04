---
name: kordoc
description: "Kordoc Document Parser & Utilities. Automatically parses Korean public documents (.hwp, .hwpx, .pdf, .docx, .xlsx, etc.) into structured markdown, compares document differences (신구대조), and fills templates. Triggers: kordoc, parse hwp, load hwp, compare documents, fill form, hwp convert."
metadata:
  short-description: "Extract, compare, and modify Korean documents (HWP/HWPX/PDF/Office) using Kordoc CLI/MCP"
---

# kordoc (Korean Document Parser & AI Integration Utilities)

`kordoc` is a specialized parsing and automation utility for Korean public documents (HWP, HWPX, PDF, XLS, XLSX, DOCX) that makes them AI-readable by converting them to structured Markdown or JSON. It also supports comparing two documents (신구대조) and filling templates (양식 자동 채우기).

This skill leverages either the command-line interface via `npx -y kordoc` or the integrated MCP server tools.

---

## 1. When to Use This Skill

- **Korean Document Parsing**: Converting a `.hwp` or `.hwpx` file (or PDF, Excel, Word) in the workspace to clean Markdown so you can read and analyze it.
- **Document Comparison (신구대조)**: When the user wants to compare two versions of a document (e.g. before/after revision) and output the differences in Markdown.
- **Form Template Filling (양식 자동 채우기)**: When the user wants to populate data from a JSON object/file into a `.hwpx` form/template.
- **Table Extraction**: Pulling tables from a complex document format into clean Markdown tables.

---

## 2. Integrated MCP Server Tools

With `kordoc` configured as an MCP server, you can use these tools directly:

- `parse_document`: Convert any supported document file to markdown text.
  - **Arguments**: `{ "path": "relative/path/to/doc.hwpx" }`
- `compare_documents`: Compare two documents side-by-side.
  - **Arguments**: `{ "path1": "path/to/old.hwpx", "path2": "path/to/new.hwpx" }`
- `fill_form`: Populate variables in a template document.
  - **Arguments**: `{ "templatePath": "path/to/template.hwpx", "dataPath": "path/to/data.json", "outputPath": "path/to/output.hwpx" }`
- `parse_table`: Extract a specific table from the document as JSON or Markdown.
  - **Arguments**: `{ "path": "path/to/doc.hwpx", "tableIndex": 0 }`
- `detect_format`: Identify the format of a document file.
  - **Arguments**: `{ "path": "path/to/doc.hwpx" }`

---

## 3. CLI Command Cheat Sheet

If the MCP tools are not running or if direct shell execution is preferred:

### Document Conversion
```bash
# Convert to stdout (markdown)
npx -y kordoc document.hwpx

# Convert and save as markdown file
npx -y kordoc document.hwp -o converted.md

# Batch convert files in folder
npx -y kordoc *.pdf -d ./converted/
```

### Document Comparison (신구대조)
```bash
npx -y kordoc compare_documents old_doc.hwpx new_doc.hwpx -o diff.md
```

### Form Filling (양식 자동 채우기)
```bash
npx -y kordoc fill_form template.hwpx --data data.json -o result.hwpx
```

### Extracting Images
```bash
npx -y kordoc document.hwpx --image-dir ./extracted_images/
```

---

## 4. Workflow Integration

### Document Parsing & Reading:
1. **Detect**: Locate the target file (e.g., `agenda.hwpx`).
2. **Execute**: Run `node scripts/convert-hwp.mjs agenda.hwpx` (which uses `kordoc` as its primary engine).
3. **Cache Access**: The script writes a markdown cache to `.omo/hwp-cache/agenda.hwpx.md`.
4. **Context Injection**: Use `view_file` to read the cached markdown file, and wrap it in your response context like:
   ```xml
   <kordoc-context source="agenda.hwpx">
   [Parsed content here...]
   </kordoc-context>
   ```

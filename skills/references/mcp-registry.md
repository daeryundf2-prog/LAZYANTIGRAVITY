# LazyAntigravity MCP Registry & Grounding Catalog

This registry documents the available MCP servers configured in `mcp_config.json` and `.mcp.json`.

## Grounding & Factuality MCP Servers

### 1. NotebookLM MCP Server (`notebooklm`) - Feature 04
- **Command**: `npx -y notebooklm-mcp`
- **Purpose**: Zero-hallucination document and codebase Q&A grounded by Google NotebookLM.
- **Workflow**:
  1. Synchronize project documents, whitepapers, or contracts into NotebookLM.
  2. Queries routed to `notebooklm` enforce citation footnotes bound strictly to the notebook corpus.
  3. Prohibits parametric guessing when answering questions from internal documentation.

### 2. Korean Law & Statute MCP Server (`korean_law`) - Feature 14
- **Runtime**: `./korean-law-mcp/dist/cli.js`
- **Tools**:
  - `lookup_statute`: Retrieve verified text for Korean statutes (민법, 형법, 개인정보보호법, 정보통신망법, 전자문서법 등). Returns `[INSUFFICIENT_DATA]` if an article does not exist.
  - `lookup_precedent`: Verify landmark Korean Supreme Court rulings and formal precedent case number formats (e.g. `2023다XXXXX`).
- **Purpose**: Eliminates fake statute article hallucination (`민법 제OO조`) and fake judicial precedent citations.

### 3. Research MCP Server (`research`) - Features 03 & 13
- **Runtime**: `./research-mcp/dist/cli.js`
- **Tools**:
  - `web_read`: Extract clean markdown from web pages via Jina Reader.
  - `web_search`: Search provider chain with `dynamic_threshold` (default 0.3) and `grounding_metadata` (supports, chunks).
  - `fetch_json`: SSRF-protected developer API querying.
  - `cross_lingual_query`: Korean-to-English query expansion targeting 1st-party global sources (RFC, GitHub, official docs, arXiv).
  - `render_grounding_citations`: Gemini API / research search grounding metadata parser & footnote citation renderer (Section 4.1).

### 4. Local Developer MCP Servers
- `ast_grep`: High-precision AST search and replacement.
- `git_bash`: Workspace-confined read-only git queries.
- `lsp`: LSP diagnostics and symbol lookups.
- `workspace`: Active memory facts, IPC blackboard, and session tree.
- `media`: Audio/image/video metadata analysis.

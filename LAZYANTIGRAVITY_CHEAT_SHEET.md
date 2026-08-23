# ⚡ LazyAntigravity Emergency Operations & Cheat Sheet

## 🚀 1. Essential Commands Quick Reference

| Action | Command | Purpose |
| :--- | :--- | :--- |
| **Full Build & Sync** | `npm run build` | Compile all 15 components, sync MCP runtimes & mirror |
| **Verify Reproducibility** | `npm run verify:reproducible` | Ensure dist artifacts match TypeScript source 100% |
| **Run Complete Test Suite**| `npm run check` | Execute all 560+ unit, integration & contract tests |
| **Search Active Memory** | `node components/memory/dist/cli.js search "auth"` | Search learned gotchas & facts across sessions |
| **Run Self-Audit Confession**| `node components/ulw-loop/dist/self-audit.js report` | Audit trajectory ledger for drift or fabricated claims |
| **Atomic Rollback** | `node components/ulw-loop/dist/self-audit.js rollback` | Revert to last verified clean state |

---

## 🛡️ 2. Emergency Recovery & HITL Resolution SOP

### Situation A: Rework Limit Hit (`needs_user_decision`)
```bash
# 1. Check last ledger events
omo ulw-loop ledger --last 10

# 2. Inspect conflict reason and resume with fix
omo ulw-loop resume --goal-id G001
```

### Situation B: Ground-Truth File Mismatch
```bash
# 1. Audit real file SHA-256
shasum -a 256 <file_path>

# 2. Verify evidence schema
node -e 'const { validateStrictEvidence } = require("./components/ulw-loop/dist/evidence-contract.js"); console.log(validateStrictEvidence(require("./evidence.json")));'
```

### Situation C: Daemon IPC Socket Stale Lock
```bash
# Clean up stale socket & lock
rm -f /tmp/lazyantigravity-daemon.sock /tmp/lazyantigravity-daemon.token
```

---

## 🎯 3. Model Routing Matrix
- **Plan, Code & Fast Refactor**: Gemini 3.7 Flash (`Model: "flash"`)
- **Adversarial Audit & Security Gate**: Gemini 3.1 Pro (`Model: "pro"`)
- **Small Lint & Format Checks**: `Model: "flash_lite"`

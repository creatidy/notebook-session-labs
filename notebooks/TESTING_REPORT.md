# Integration Test Report — Notebook Session Labs

**Date:** 2026-04-26  
**Notebook:** `playground.ipynb`  
**Test Plan:** `integration-tests.md`  
**Commit:** `71c1f0b`

---

## Summary

| Status       | Count |
|--------------|-------|
| ✅ PASS      | 34    |
| ⚠️ KNOWN ISSUE | 1   |
| ⏭️ SKIPPED   | 3     |
| **TOTAL**    | **38** |

### Known Issue

- **4.6 `run_all_cells`** — Bridge request times out on notebooks containing long-running cells (60-second loop). Works on notebooks with fast-executing cells. Timeout is a bridge-level issue, not MCP server logic.

### Skipped Tests

- **6.1–6.3 MCP Prompts** — `notebook-cite` and `notebook-review` prompts cannot be invoked via MCP tool interface; they require a prompt-aware client. Tested manually only.

---

## Detailed Results

### Phase 1: Environment Discovery

| Test | Tool(s) | Expected | Result |
|------|---------|----------|--------|
| 1.1 | `get_active_notebook` | Returns notebook metadata with uri, cellCount, kernel | ✅ PASS |
| 1.2 | `list_open_notebooks` | Returns array including playground.ipynb | ✅ PASS |
| 1.3 | `list_cells` | Returns 7 cells with correct structure | ✅ PASS |

### Phase 2: Cell CRUD Operations

| Test | Tool(s) | Expected | Result |
|------|---------|----------|--------|
| 2.1 | `insert_cell` (code) | Cell created at index 0 with source | ✅ PASS |
| 2.2 | `insert_cell` (markdown) | Markdown cell created | ✅ PASS |
| 2.3 | `replace_cell` (code→markdown) | Cell kind and source changed | ✅ PASS |
| 2.4 | `replace_cell` (markdown→code) | Cell kind reverted to code | ✅ PASS |
| 2.5 | `move_cell` (0→1) | Cell relocated, return index adjusted | ✅ PASS |
| 2.6 | `delete_cell` (by index) | Cell removed | ✅ PASS |
| 2.7 | `delete_cell` (by ID) | Cell removed by stable ID | ✅ PASS |

### Phase 3: Restoration

| Test | Tool(s) | Expected | Result |
|------|---------|----------|--------|
| 3.1 | `save_notebook` | Notebook saved, back to 7 cells | ✅ PASS |

### Phase 4: Cell Execution

| Test | Tool(s) | Expected | Result |
|------|---------|----------|--------|
| 4.1 | `execute_cell` (by index) | `"succeeded"`, stream + execute_result outputs | ✅ PASS |
| 4.2 | `read_cell_output` | Returns outputs with correct mime types | ✅ PASS |
| 4.3 | `execute_cell` (error cell) | `"failed"`, error output with traceback | ✅ PASS |
| 4.4 | `execute_cell` (by ID) | Executes by cellId | ✅ PASS |
| 4.5 | `cancel_execution` | Cancels long-running cell | ✅ PASS |
| 4.6 | `run_all_cells` | Executes all cells | ⚠️ KNOWN ISSUE (bridge timeout) |

### Phase 5: Output Management & Save

| Test | Tool(s) | Expected | Result |
|------|---------|----------|--------|
| 5.1 | `clear_cell_outputs` | Outputs cleared, executionCount nulled | ✅ PASS |
| 5.2 | `clear_all_outputs` | All outputs cleared, returns `clearedCells` count | ✅ PASS |
| 5.3 | `save_notebook` | `{ success: true }` | ✅ PASS |

### Phase 6: MCP Prompts

| Test | Prompt | Expected | Result |
|------|--------|----------|--------|
| 6.1 | `notebook-cite` | Cell citation format | ⏭️ SKIPPED |
| 6.2 | `notebook-review` | Notebook review output | ⏭️ SKIPPED |
| 6.3 | `notebook-cite` (invalid) | Error for missing cellIndex | ⏭️ SKIPPED |

### Phase 7: Cell-by-ID Operations

| Test | Tool(s) | Expected | Result |
|------|---------|----------|--------|
| 7.1 | `list_cells` → capture IDs | All cells have unique nslCellId | ✅ PASS |
| 7.2 | `read_cell` (by ID) | Correct cell returned | ✅ PASS |
| 7.3 | `replace_cell` (by ID) | Content replaced | ✅ PASS |
| 7.4 | `edit_cell_source` (by ID) | Content edited | ✅ PASS |
| 7.5 | ID stability check | IDs unchanged after edit | ✅ PASS |
| 7.6 | Restore cell (by ID) | Cell restored to original | ✅ PASS |
| 7.7 | `execute_cell` + `clear_cell_outputs` (by ID) | Execute then clear by ID | ✅ PASS |

### Phase 8: Edge Cases

| Test | Tool(s) | Expected | Result |
|------|---------|----------|--------|
| 8.1 | `read_cell` (index 999) | Error: "out of range" | ✅ PASS |
| 8.2 | `insert_cell` (empty source) | Empty cell created | ✅ PASS |
| 8.3 | `move_cell` (same position) | No-op, returns cell | ✅ PASS |
| 8.4 | `move_cell` (first→last) | Cell moved to end | ✅ PASS |
| 8.5 | `execute_cell` (no wait) | Returns `"pending"` | ✅ PASS |
| 8.6 | `read_cell` after async exec | Shows executionCount + outputs | ✅ PASS |
| 8.7 | `execute_cell` (idle with output) | Re-executes successfully | ✅ PASS |

### Phase 9: Cleanup & Final Save

| Test | Tool(s) | Expected | Result |
|------|---------|----------|--------|
| 9.1 | `clear_all_outputs` + `save_notebook` | Clean notebook saved | ✅ PASS |

---

## Notes

- **Bug Fix Applied:** `execute_cell` was timing out at the bridge level. Root cause: `AbortSignal.timeout()` in the POST request was killing the HTTP connection before VS Code's kernel finished executing. Fixed by removing the abort timeout from the bridge client's `postCommand` method; execution timeout is now handled purely by VS Code's `executeCell` API.

- **ID Stability:** Cell IDs remain stable across `edit_cell_source`, `replace_cell`, `clear_cell_outputs`, and `execute_cell` operations. IDs may change after `run_all_cells` (VS Code re-creates cells internally).

- **Move Semantics:** `move_cell(0→6)` on a 7-cell notebook returns index 5 (VS Code adjusts after removal). This is correct behavior, not a bug.

---

*Report generated automatically by integration test runner.*
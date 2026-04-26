# Notebook Session Labs — MCP Integration Tests

**Purpose:** Pre-release integration test prompt for the Notebook Session Labs MCP server.
**Target notebook:** `notebooks/playground.ipynb` (must be open and active in VS Code).
**Prerequisites:** VS Code extension installed and bridge running; MCP server connected.

---

## Instructions for the Test Runner

You are the test runner. Execute each phase in order. For every test:

1. Call the MCP tool with the specified parameters.
2. Verify the assertions listed.
3. Record **PASS** or **FAIL** with a brief note in the results table at the end.
4. If a test fails, note the actual vs expected behavior but **continue to the next test**.
5. After all phases, restore the notebook to its original state if needed.
6. Produce the final test report.

**Known issues to be aware of:**
- **Issue 11:** `execute_cell` may fail if the kernel hasn't been initialized (run a cell manually first or accept as expected failure).
- **Issue 12:** `run_all_cells` may time out at the MCP transport layer for long-running notebooks.

---

## Phase 1: Discovery (Read-Only)

These tests are safe and do not modify the notebook.

### Test 1.1: `get_active_notebook`

Call `get_active_notebook` with no parameters.

**Assert:**
- Result is not an error.
- Response contains `id` (non-empty string).
- Response contains `fileName` (string containing `playground.ipynb`).
- Response contains `cellCount` (number >= 6, the original cell count).
- Response contains `kernelStatus` (string, one of: `idle`, `unknown`, `busy`).
- Response contains `isDirty` (boolean).

### Test 1.2: `list_open_notebooks`

Call `list_open_notebooks` with no parameters.

**Assert:**
- Result is an array with at least one entry.
- At least one entry has `fileName` containing `playground.ipynb`.
- Each entry has: `id`, `uri`, `fileName`, `cellCount`, `kernelStatus`, `isDirty`.

### Test 1.3: `list_cells`

Call `list_cells` with no parameters (targets active notebook).

**Assert:**
- Result is an array.
- Array length equals the `cellCount` from Test 1.1.
- Each cell has: `index`, `id`, `kind`, `sourcePreview`, `executionCount`, `executionStatus`, `hasOutput`.
- Cell at index 0 has `kind` = `"code"`.
- Cell at index 1 has `kind` = `"code"`.
- Cell at index 2 has `kind` = `"markdown"`.
- Cell indices are sequential starting from 0.

### Test 1.4: `read_notebook`

Call `read_notebook` with no parameters.

**Assert:**
- Response contains all fields from Test 1.1 plus: `cells` (array), `kernelDisplayName`, `metadata`.
- `cells` array length matches `cellCount`.
- Each cell in `cells` has the full set of `CellSummary` fields.

### Test 1.5: `read_cell` (by index)

Call `read_cell` with `{ cellIndex: 0 }`.

**Assert:**
- Response contains: `index` = 0, `id`, `kind` = `"code"`, `source` (string containing `Hello from Notebook Session Labs`), `language` = `"python"`.
- `source` is the full source text (not truncated).
- Response contains `outputs` (array) and `metadata` (object).

### Test 1.6: `read_cell` (by ID)

First, call `list_cells` and capture the `id` of cell at index 1. Then call `read_cell` with `{ cellId: "<captured_id>" }`.

**Assert:**
- Response `index` = 1.
- Response `source` contains `import sys` and `import platform`.
- Response `id` matches the captured ID.

### Test 1.7: `read_cell_output`

Call `read_cell_output` with `{ cellIndex: 0 }`.

**Assert:**
- Response is an array (may be empty if cell hasn't been executed yet, which is acceptable).
- If the array is non-empty, each entry has: `id`, `outputKind`, `items`, `metadata`.

### Test 1.8: `get_selection`

Call `get_selection` with no parameters.

**Assert:**
- Response contains: `notebookId` (non-empty string), `selectedCellIndex` (number or null), `selectedCellRange` (tuple or null), `focusedCellId` (string or null).

---

## Phase 2: Editing (Modifies Notebook)

⚠️ These tests modify `playground.ipynb`. The notebook will be restored after all editing tests.

**Before starting:** Call `read_notebook` and save the complete response. You will need the original cell count and structure for restoration.

### Test 2.1: `insert_cell` (code cell)

Call `insert_cell` with:
```json
{
  "index": 0,
  "kind": "code",
  "source": "# INTEGRATION TEST: inserted code cell\nprint(\"test_insert\")"
}
```

**Assert:**
- Response is not an error.
- Call `list_cells` — total cell count should be **original count + 1**.
- Cell at index 0 should have `sourcePreview` containing `INTEGRATION TEST: inserted code cell`.
- Cell at index 0 should have `kind` = `"code"`.

### Test 2.2: `insert_cell` (markdown cell)

Call `insert_cell` with:
```json
{
  "index": 1,
  "kind": "markdown",
  "source": "**INTEGRATION TEST: inserted markdown cell**"
}
```

**Assert:**
- Call `list_cells` — total cell count should be **original count + 2**.
- Cell at index 1 should have `kind` = `"markdown"`.
- Cell at index 1 should have `sourcePreview` containing `INTEGRATION TEST: inserted markdown`.

### Test 2.3: `replace_cell` (change kind and content)

Call `replace_cell` with:
```json
{
  "cellIndex": 0,
  "source": "# REPLACED: this was a code cell, now markdown",
  "kind": "markdown"
}
```

**Assert:**
- Call `read_cell` with `{ cellIndex: 0 }`.
- Response `kind` = `"markdown"`.
- Response `source` = `"# REPLACED: this was a code cell, now markdown"`.

### Test 2.4: `edit_cell_source` (update source only)

Call `edit_cell_source` with:
```json
{
  "cellIndex": 1,
  "source": "**EDITED: markdown content updated via edit_cell_source**"
}
```

**Assert:**
- Call `read_cell` with `{ cellIndex: 1 }`.
- Response `source` = `"**EDITED: markdown content updated via edit_cell_source**"`.

### Test 2.5: `move_cell` (move cell down)

Call `move_cell` with:
```json
{
  "fromIndex": 0,
  "toIndex": 2
}
```

**Assert:**
- Call `read_cell` with `{ cellIndex: 0 }` — should no longer have the REPLACED content.
- Call `read_cell` with `{ cellIndex: 2 }` — should have `source` containing `REPLACED: this was a code cell, now markdown`.

### Test 2.6: `delete_cell`

Call `delete_cell` with:
```json
{
  "cellIndex": 0
}
```

**Assert:**
- Call `list_cells` — cell count should be **original count + 1** (inserted 2, deleted 1).
- Cell at index 0 should not contain `EDITED: markdown content updated via edit_cell_source`.

### Test 2.7: `delete_cell` (by ID)

Call `list_cells` and capture the `id` of the cell at index 1 (the EDITED markdown cell). Then call `delete_cell` with:
```json
{
  "cellId": "<captured_id>"
}
```

**Assert:**
- Call `list_cells` — cell count should be **original count** (back to original).

---

## Phase 3: Notebook Restoration

After all editing tests, restore the notebook to its original state.

**Step 3.1:** Call `list_cells` and verify the cell count matches the original. If the notebook structure doesn't match:

1. Delete any remaining test-inserted cells.
2. Re-insert any cells that were removed during testing.
3. Use `edit_cell_source` to restore original cell content.

**Step 3.2:** Call `save_notebook` to persist the restored state.

**Step 3.3:** Call `read_notebook` and verify:
- `isDirty` = `false` (after save).
- Cell count matches original.
- Cell 0 source contains `Hello from Notebook Session Labs`.

---

## Phase 4: Execution

⚠️ These tests execute cells. The kernel must be available. If Issue 11 applies (kernel not initialized after restart), mark execution tests as EXPECTED FAIL and continue.

### Test 4.1: `execute_cell` (simple code, by index)

Call `execute_cell` with:
```json
{
  "cellIndex": 0,
  "waitForCompletion": true,
  "timeoutMs": 30000
}
```

**Assert:**
- Response is not an error (unless Issue 11 applies — then mark EXPECTED FAIL).
- Response contains: `cellId`, `status` = `"succeeded"`, `executionCount` (number >= 1), `outputs` (non-empty array), `durationMs` (number >= 0), `error` = `null`.
- At least one output item has `mime` = `"text/plain"` or contains `Hello from Notebook Session Labs`.

### Test 4.2: Verify execution output via `read_cell_output`

Call `read_cell_output` with `{ cellIndex: 0 }`.

**Assert:**
- Response is a non-empty array.
- At least one output has `outputKind` = `"stream"` or `"execute_result"`.
- Output text contains `Hello from Notebook Session Labs`.

### Test 4.3: `execute_cell` (error cell, by index)

Call `execute_cell` with:
```json
{
  "cellIndex": 3,
  "waitForCompletion": true,
  "timeoutMs": 15000
}
```

Cell 3 contains `1 / 0` which should produce an error.

**Assert:**
- Response is not a transport error (bridge-level).
- Response `status` = `"failed"` OR `error` is non-null (the division by zero should be captured).
- Output contains error information (traceback or error message mentioning `ZeroDivisionError` or `division by zero`).

### Test 4.4: `execute_cell` (by ID)

Call `list_cells`, capture the `id` of cell at index 1. Call `execute_cell` with:
```json
{
  "cellId": "<captured_id>",
  "waitForCompletion": true,
  "timeoutMs": 30000
}
```

**Assert:**
- Response `status` = `"succeeded"`.
- Output contains Python/platform info.

### Test 4.5: `cancel_execution` (long-running cell)

Call `execute_cell` with:
```json
{
  "cellIndex": 5,
  "waitForCompletion": false
}
```

Wait 2 seconds, then call `cancel_execution` with no parameters.

**Assert:**
- `cancel_execution` response is not an error.
- Call `read_cell` with `{ cellIndex: 5 }` — `executionStatus` should be `"idle"` or `"cancelled"` (not `"executing"`).

### Test 4.6: `run_all_cells` (optional — may hit Issue 12)

Call `run_all_cells` with:
```json
{
  "timeoutMs": 60000
}
```

**Assert:**
- If response is received without timeout: all cells should have executed.
- If timeout occurs: mark as **KNOWN ISSUE (Issue 12)** and PASS conditionally.
- Response should contain execution results or a timeout-related message.

---

## Phase 5: Utility Tools

### Test 5.1: `clear_cell_outputs`

Call `clear_cell_outputs` with `{ cellIndex: 0 }`.

**Assert:**
- Response is not an error.
- Call `read_cell_output` with `{ cellIndex: 0 }` — response should be an empty array.
- Call `read_cell` with `{ cellIndex: 0 }` — `executionStatus` should be `"idle"`, `hasOutput` should be `false` or outputs empty.

### Test 5.2: `clear_all_outputs`

Call `clear_all_outputs` with no parameters.

**Assert:**
- Response is not an error.
- Call `list_cells` — all cells should have `hasOutput` = `false`.
- Call `read_cell_output` for cells 1–5 — all should return empty arrays.

### Test 5.3: `save_notebook`

Call `save_notebook` with no parameters.

**Assert:**
- Response is not an error.
- Call `read_notebook` — `isDirty` should be `false`.

---

## Phase 6: Prompts

### Test 6.1: `notebook-cite` prompt

Use the `notebook-cite` prompt with:
```json
{
  "cellIndex": 0
}
```

**Assert:**
- Response contains `messages` array with at least one message.
- Message content includes the notebook file name or cell reference.
- Message content includes the source preview of cell 0.

### Test 6.2: `notebook-cite` prompt (with notebookId)

Call `get_active_notebook` to get the notebook ID. Then use the `notebook-cite` prompt with:
```json
{
  "cellIndex": 3,
  "notebookId": "<notebook_id>"
}
```

**Assert:**
- Response contains citation for cell 3 (the error cell `1 / 0`).
- No error in the response.

### Test 6.3: `notebook-review` prompt

Use the `notebook-review` prompt with no parameters.

**Assert:**
- Response contains `messages` array with at least one message.
- Message content includes a header like `# Notebook Review:`.
- Message content includes cell counts (total, code, markdown).
- Message content mentions failed cells if any execution failed.

---

## Phase 7: Cell-by-ID Operations (Stable IDs)

These tests verify that stable `cellId` references work correctly for all cell operations.

### Test 7.1: Setup — capture cell IDs

Call `list_cells` and capture the `id` for cells at indices 0, 1, 2, 3. Save these as `id0`, `id1`, `id2`, `id3`.

**Assert:**
- All four IDs are non-empty strings.
- All four IDs are unique.

### Test 7.2: `read_cell` by ID

Call `read_cell` with `{ cellId: id0 }`.

**Assert:**
- Response `index` = 0.
- Response `id` = `id0`.

### Test 7.3: `replace_cell` by ID

Call `replace_cell` with:
```json
{
  "cellId": "<id1>",
  "source": "# CELL-BY-ID: replaced content",
  "kind": "markdown"
}
```

**Assert:**
- Call `read_cell` with `{ cellId: id1 }` — `source` should be `"# CELL-BY-ID: replaced content"`, `kind` should be `"markdown"`.

### Test 7.4: `edit_cell_source` by ID

Call `edit_cell_source` with:
```json
{
  "cellId": "<id1>",
  "source": "# CELL-BY-ID: edited content"
}
```

**Assert:**
- Call `read_cell` with `{ cellId: id1 }` — `source` should be `"# CELL-BY-ID: edited content"`.

### Test 7.5: Verify ID stability after edit

Call `list_cells`. Verify that cell at index 1 still has `id` = `id1` (ID did not change after edit).

**Assert:**
- Cell at index 1 has `id` = `id1`.

### Test 7.6: Restore cell 1

Call `edit_cell_source` with:
```json
{
  "cellId": "<id1>",
  "source": "# Cell 1: Variables and data\nimport sys\nimport platform\n\ninfo = {\n    \"python\": sys.version,\n    \"platform\": platform.platform(),\n    \"implementation\": platform.python_implementation(),\n}\n\nfor key, value in info.items():\n    print(f\"{key}: {value}\")"
}
```

Then call `replace_cell` with:
```json
{
  "cellId": "<id1>",
  "source": "# Cell 1: Variables and data\nimport sys\nimport platform\n\ninfo = {\n    \"python\": sys.version,\n    \"platform\": platform.platform(),\n    \"implementation\": platform.python_implementation(),\n}\n\nfor key, value in info.items():\n    print(f\"{key}: {value}\")",
  "kind": "code"
}
```

### Test 7.7: `clear_cell_outputs` by ID

Call `execute_cell` with `{ cellId: id0 }` (wait for completion). Then call `clear_cell_outputs` with:
```json
{
  "cellId": "<id0>"
}
```

**Assert:**
- Response is not an error.
- Call `read_cell_output` with `{ cellId: id0 }` — should return empty array.

---

## Phase 8: Edge Cases

### Test 8.1: `read_cell` with invalid index

Call `read_cell` with `{ cellIndex: 999 }`.

**Assert:**
- Response is an error (bridge error or MCP error).
- Error message indicates the cell was not found or index is out of range.

### Test 8.2: `insert_cell` with empty source

Call `insert_cell` with:
```json
{
  "index": 0,
  "kind": "code",
  "source": ""
}
```

**Assert:**
- Response is not an error (empty source is valid).
- Call `read_cell` with `{ cellIndex: 0 }` — `source` should be `""`.

Clean up: call `delete_cell` with `{ cellIndex: 0 }`.

### Test 8.3: `move_cell` to same position

Call `move_cell` with:
```json
{
  "fromIndex": 0,
  "toIndex": 0
}
```

**Assert:**
- Response is not an error (no-op move should succeed).
- Call `list_cells` — cell count unchanged, cell 0 content unchanged.

### Test 8.4: `move_cell` to last position

Call `list_cells` to get the count. Then call `move_cell` with:
```json
{
  "fromIndex": 0,
  "toIndex": <last_index>
}
```

**Assert:**
- Cell that was at index 0 is now at the last index.
- Other cells shifted accordingly.

Restore: call `move_cell` with `{ fromIndex: <last_index>, toIndex: 0 }`.

### Test 8.5: `execute_cell` with waitForCompletion = false

Call `execute_cell` with:
```json
{
  "cellIndex": 0,
  "waitForCompletion": false
}
```

**Assert:**
- Response is not an error.
- Response may contain partial or no execution results (fire-and-forget).

### Test 8.6: `list_cells` for non-active notebook (if multiple open)

If `list_open_notebooks` shows more than one notebook, call `list_cells` with the `notebookId` of a non-active notebook.

**Assert:**
- Response contains cells from the specified notebook (not the active one).
- Cell data structure matches the expected schema.

If only one notebook is open, mark this test as SKIPPED.

### Test 8.7: `delete_cell` with both cellIndex and cellId omitted

Call `delete_cell` with `{}` (no cell identifier).

**Assert:**
- Response is an error (must specify either cellIndex or cellId).

---

## Phase 9: Final Restoration & Report

### Step 9.1: Restore notebook

Call `read_notebook`. Compare the current state with the original:
- Cell count should be 6 (original playground.ipynb).
- Cell 0: `Hello from Notebook Session Labs!`
- Cell 1: `import sys`
- Cell 2: `## Error Handling Test` (markdown)
- Cell 3: `1 / 0`
- Cell 4: `import json`
- Cell 5: `import time`

If any cells differ, use `edit_cell_source` / `replace_cell` / `insert_cell` / `delete_cell` to fix, then `save_notebook`.

### Step 9.2: Generate Test Report

Fill in the results table below.

---

## Test Results Template

| # | Test | Tool(s) | Status | Notes |
|---|---|---|---|---|
| 1.1 | get_active_notebook | `get_active_notebook` | ⬜ | |
| 1.2 | list_open_notebooks | `list_open_notebooks` | ⬜ | |
| 1.3 | list_cells | `list_cells` | ⬜ | |
| 1.4 | read_notebook | `read_notebook` | ⬜ | |
| 1.5 | read_cell (by index) | `read_cell` | ⬜ | |
| 1.6 | read_cell (by ID) | `read_cell`, `list_cells` | ⬜ | |
| 1.7 | read_cell_output | `read_cell_output` | ⬜ | |
| 1.8 | get_selection | `get_selection` | ⬜ | |
| 2.1 | insert_cell (code) | `insert_cell`, `list_cells` | ⬜ | |
| 2.2 | insert_cell (markdown) | `insert_cell`, `list_cells` | ⬜ | |
| 2.3 | replace_cell (kind change) | `replace_cell`, `read_cell` | ⬜ | |
| 2.4 | edit_cell_source | `edit_cell_source`, `read_cell` | ⬜ | |
| 2.5 | move_cell | `move_cell`, `read_cell` | ⬜ | |
| 2.6 | delete_cell (by index) | `delete_cell`, `list_cells` | ⬜ | |
| 2.7 | delete_cell (by ID) | `delete_cell`, `list_cells` | ⬜ | |
| 3.1 | Notebook restoration | multiple | ⬜ | |
| 3.2 | Save after restore | `save_notebook` | ⬜ | |
| 3.3 | Verify restoration | `read_notebook` | ⬜ | |
| 4.1 | execute_cell (simple) | `execute_cell` | ⬜ | |
| 4.2 | Verify execution output | `read_cell_output` | ⬜ | |
| 4.3 | execute_cell (error) | `execute_cell` | ⬜ | |
| 4.4 | execute_cell (by ID) | `execute_cell`, `list_cells` | ⬜ | |
| 4.5 | cancel_execution | `execute_cell`, `cancel_execution` | ⬜ | |
| 4.6 | run_all_cells | `run_all_cells` | ⬜ | May hit Issue 12 |
| 5.1 | clear_cell_outputs | `clear_cell_outputs`, `read_cell_output` | ⬜ | |
| 5.2 | clear_all_outputs | `clear_all_outputs`, `list_cells` | ⬜ | |
| 5.3 | save_notebook | `save_notebook`, `read_notebook` | ⬜ | |
| 6.1 | notebook-cite prompt | `notebook-cite` | ⬜ | |
| 6.2 | notebook-cite (with ID) | `notebook-cite` | ⬜ | |
| 6.3 | notebook-review prompt | `notebook-review` | ⬜ | |
| 7.1 | Capture cell IDs | `list_cells` | ⬜ | |
| 7.2 | read_cell by ID | `read_cell` | ⬜ | |
| 7.3 | replace_cell by ID | `replace_cell`, `read_cell` | ⬜ | |
| 7.4 | edit_cell_source by ID | `edit_cell_source`, `read_cell` | ⬜ | |
| 7.5 | ID stability after edit | `list_cells` | ⬜ | |
| 7.6 | Restore cell 1 | `edit_cell_source`, `replace_cell` | ⬜ | |
| 7.7 | clear_cell_outputs by ID | `clear_cell_outputs`, `read_cell_output` | ⬜ | |
| 8.1 | Invalid cell index | `read_cell` | ⬜ | |
| 8.2 | Empty source insert | `insert_cell`, `delete_cell` | ⬜ | |
| 8.3 | Move to same position | `move_cell`, `list_cells` | ⬜ | |
| 8.4 | Move to last position | `move_cell`, `list_cells` | ⬜ | |
| 8.5 | Execute with waitForCompletion=false | `execute_cell` | ⬜ | |
| 8.6 | list_cells for non-active notebook | `list_cells` | ⬜ | Skipped if single notebook |
| 8.7 | delete_cell without identifier | `delete_cell` | ⬜ | |
| 9.1 | Final restoration check | `read_notebook` | ⬜ | |
| 9.2 | Report generation | — | ⬜ | |

**Status legend:** ✅ PASS | ❌ FAIL | ⚠️ EXPECTED FAIL (known issue) | ⏭️ SKIPPED

---

## Summary Block

After completing all tests, fill in:

```
Total tests:    __
Passed:         __
Failed:         __
Expected fail:  __
Skipped:        __

Discovery tools (7):  __/7 passed
Editing tools (7):    __/7 passed
Execution tools (6):  __/6 passed
Utility tools (3):    __/3 passed
Prompts (3):          __/3 passed
Cell-by-ID (7):       __/7 passed
Edge cases (7):       __/7 passed

Blocking issues for release: <list or "none">
Non-blocking issues: <list or "none">
```

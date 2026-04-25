# Notebook Session Labs — MCP Testing Report

**Date:** 2026-04-25 (updated — live verification round)
**Extension version:** 0.2.0
**MCP server tested via:** Docker MCP container (`ghcr.io/creatidy/notebook-session-labs-mcp:latest`) connected to VS Code bridge
**Active notebook during test:** `notebooks/playground.ipynb` (7 cells, Jupyter kernel — Python 3.12.3 / ipykernel 7.2.0)

---

## Test Summary

| Category | Tests Run | Passed | Issues Found |
|---|---|---|---|
| Discovery | 7 | 7 | 0 |
| Editing | 8 | 8 | 0 |
| Execution | 3 | 0 | 3 |
| Edge Cases | 2 | 2 | 0 |
| Output Capture | 4 | 4 | 0 |
| New Tools | 3 | 3 | 0 |
| Live Verification (2026-04-25) | 12 | 10 | 1 re-confirmed |
| **Total** | **27 + 12** | **24 + 10** | **3** |

---

## ✅ What Works Well

### Discovery Tools (all passed)
- **`get_active_notebook`** — Returns correct notebook metadata with SHA-256-based IDs. `kernelStatus` now uses `ExecutionMonitor` for accurate detection (P5 ✅ live verified: correctly reports `"unknown"` for fresh sessions).
- **`list_open_notebooks`** — Lists all open notebooks with accurate cell counts.
- **`list_cells`** — Returns full cell listing with source previews, execution counts, and status.
- **`read_cell`** — Returns complete cell source, metadata, language, and outputs.
- **`read_notebook`** — Returns full notebook detail with all cells and metadata.
- **`get_selection`** — Correctly reports selected cell index, range, and focused cell ID.

### Editing Tools (all passed, including advanced scenarios)
- **`insert_cell`** — Successfully inserts code/markdown cells at any position (including 0); returns full cell detail.
- **`edit_cell_source`** — Replaces cell source text cleanly.
- **`replace_cell`** — Replaces cell content including kind changes. **Kind switching verified:**
  - markdown → code: language auto-detected to `"python"` (kernel default) ✅
  - code → markdown: language set to `"markdown"` ✅
  - Round-trip (md→code→md→code): language correctly toggles each time ✅
- **`move_cell`** — Sequential edit approach works correctly:
  - Forward move (0→5): returns index 4 (toIndex-1 after deletion) ✅
  - Backward move (last→first): returns index 0 ✅
  - Same-index (0→0): no-op, returns same cell ✅
  - Adjacent (0→1): effectively no-op (insertIndex = toIndex-1 = 0) ✅
- **`delete_cell`** — Deletes cells and returns confirmation.
- **`clear_cell_outputs`** — Clears outputs for a single cell, resets executionCount to null.
- **`clear_all_outputs`** — Clears outputs for all cells, returns `{ clearedCells: N }`.

### Output Capture (all passed)
- **stdout** — Correctly decoded from VS Code internal MIME types: `"Hello from Notebook Session Labs!\n"`.
- **execute_result** — Expression results captured: `"4"` from `2 + 2`.
- **stream output** — Multi-line stdout (platform info) captured with real newlines.
- **error output** — Captured with both text representation and structured `originalError` metadata (ename, evalue, traceback). Error parsing correctly handles both Jupyter `{ename, evalue, traceback}` and JavaScript `{name, message, stack}` field naming conventions.

### New Tools (all passed)
- **`clear_cell_outputs`** — Works correctly. Note: resets `executionCount` to null since the cell is recreated via `replaceCells`.
- **`clear_all_outputs`** — Iterates all cells and clears those with outputs. Returns accurate count.
- **`save_notebook`** — Successfully saves after edits.

### Edge Cases (all passed)
- **Out-of-bounds index** — Returns clear error: `"Cell index 999 out of range (0-6)"`.
- **Invalid notebook ID** — Returns clear error: `"Notebook not found: nonexistent-id"`.

---

## ✅ Previously Reported Bugs — All Fixed

All 10 bugs from previous testing reports have been resolved:

| Bug | Description | Status |
|---|---|---|
| Bug 1 | Duplicate Cell IDs (truncated base64) | ✅ Fixed — SHA-256 hash generates unique 32-char hex IDs |
| Bug 2 | Notebook ID Collisions | ✅ Fixed — SHA-256 hash for notebook IDs too |
| Bug 3 | VS Code Internal MIME Types Not Handled | ✅ Fixed — stdout/stderr/error all decoded correctly |
| Bug 4 | MCP Server Version Mismatch (0.1.0) | ✅ Fixed — Version imported from `package.json` |
| Bug 5 | `execute_cell` Timeout with Unavailable Kernel | ✅ Fixed — Grace period + clear error message |
| Bug 6 | `run_all_cells` Does Not Wait for Completion | ✅ Fixed — Per-cell polling with timeout |
| Bug 7 | `read_cell_output` Returns Raw URI Instead of Hash for `cellId` | ✅ Fixed — Now uses `cellId(cell)` consistently |
| Bug 8 | Error Output Text Uses Wrong Field Names | ✅ Fixed — Checks both Jupyter and JS naming conventions |
| Bug 9 | `replace_cell` Doesn't Update Language on kind Switch | ✅ Fixed — Detects kind changes, uses kernel default language |
| Bug 10 | `move_cell` Returns Wrong Cell Due to Atomic WorkspaceEdit | ✅ Fixed — Split into sequential delete + insert |

---

## 🐛 New Issues Found

### Issue 11: `execute_cell` Fails After Kernel Restart Despite `kernelStatus: "idle"` (HIGH) — ❌ NOT FIXED (live verified 2026-04-25)

**Severity:** High · **File:** `packages/vscode-extension/src/notebookService.ts`

**Original symptom:** After manually restarting the Jupyter kernel, `execute_cell` consistently failed with `"Kernel not available or execution did not start."` Meanwhile, `get_active_notebook` reported `kernelStatus: "idle"`.

**Code changes applied (P1/P4/P5) — verified via live MCP testing on 2026-04-25:**
1. Added `ExecutionMonitor` class that listens to `vscode.notebooks.onDidChangeNotebookCellExecutionState` events to track actual kernel activity in real-time.
2. `getKernelStatus()` now uses `ExecutionMonitor.hasKernelActivity()` to detect real kernel availability instead of inferring from stale execution history.
3. `waitForCellCompletion()` uses event-driven monitoring as primary mechanism with polling fallback.
4. Grace period extended from 3s to 10s to accommodate kernel reconnection after restart.
5. `runAllCells()` sets up event-driven completion listeners for all code cells alongside polling fallback.

**Live test result (2026-04-25):** Issue NOT resolved. When `kernelStatus` is `"unknown"` (fresh session, no prior execution), `execute_cell` still fails after the 10s grace period with `"Kernel not available or execution did not start. Ensure a notebook kernel is selected."` (durationMs: 10003). The `ExecutionMonitor` correctly reports "unknown" status (no kernel activity detected), but the `notebook.cell.execute` VS Code command does not start execution when the kernel hasn't been initialized. The fix improved diagnostics (correct "unknown" vs stale "idle") but did not solve the fundamental issue of the kernel not being triggered from MCP.

**Remaining root cause:** VS Code's `notebook.cell.execute` command may require the kernel to be explicitly selected/started before it can execute cells. MCP cannot do this through the current command-based approach. Possible solutions:
- Use `vscode.notebookKernelExecutionService` or equivalent API to force kernel startup.
- Call `vscode.commands.executeCommand('notebook.selectKernel', ...)` before execution.
- Detect "unknown" kernel status and return a more actionable error message directing the user to run a cell manually first.

---

### Issue 12: `run_all_cells` Times Out at MCP Transport Layer (MEDIUM)

**Severity:** Medium
**File:** `packages/mcp-server/src/client.ts` (bridge client timeout), `packages/vscode-extension/src/bridge/server.ts` (no request timeout)
**Symptom:** `run_all_cells` with default 120s timeout causes `"Bridge request timed out"` error after ~30 seconds, even though cells are still executing.

**Root cause:** The MCP client (Docker container → bridge) has a built-in ~30s HTTP request timeout. The bridge server (`server.ts`) has no request-level timeout — it waits indefinitely for `handleRequest` to resolve. The `run_all_cells` handler polls for up to 120s, which exceeds the transport-level timeout.

**Proposed fix:**
1. Increase MCP client HTTP timeout to at least 180s for long-running operations.
2. Or make bridge request timeout configurable via environment variable.
3. Or implement streaming/progress reporting for long operations so the connection stays alive.

---

### Issue 13: Cell IDs Are Not Stable Across `clear_cell_outputs` and `replace_cell` (LOW) — ✅ FIXED (live verified 2026-04-25)

**Severity:** Low · **File:** `packages/vscode-extension/src/notebookService.ts`

**Original symptom:** After calling `clear_cell_outputs` or `replace_cell`, the cell's ID changed because `NotebookEdit.replaceCells()` creates a new VS Code internal URI, and `cellId()` was a SHA-256 hash of that URI.

**Code changes applied (P3) — verified via live MCP testing on 2026-04-25:**
1. Added `nslCellId` metadata key for persisting stable IDs across cell replacement operations.
2. `cellId()` now checks cell metadata for a persisted `nslCellId` first, falling back to URI hash for legacy cells without metadata.
3. `insertCell()` assigns a new random stable ID via metadata on creation.
4. `replaceCell()`, `clearCellOutputs()`, `clearAllOutputs()`, and `moveCell()` all preserve the existing `nslCellId` through the replacement cycle.

**Live test results (2026-04-25):**
- **`replace_cell` (×2):** Cell ID `c1e36eb5b71cff44f0466e7192f7ac18` remained stable through two consecutive replacements ✅
- **`clear_cell_outputs`:** Cell ID preserved after clearing ✅
- **`move_cell` (forward 1→4):** Cell ID preserved after move to new index ✅
- **Kind switching (code→markdown):** Cell ID preserved through kind change ✅
- **New cell insertion:** Fresh `nslCellId` assigned on creation (`4f7594d9adb5989fab2c3156e4d112cf`) ✅
- **Legacy cells:** Cells without `nslCellId` metadata get a new one assigned on first replacement (one-time ID change, then stable) ✅

---

## 📋 Conclusions

### Overall Assessment

The v0.2.0 release is **solid for all discovery, editing, and output capture operations**. All 10 previously identified bugs have been fixed and verified. The core MCP bridge works reliably for:

1. **Notebook and cell discovery** — Comprehensive metadata, SHA-256 IDs, correct status reporting.
2. **Cell editing** — All operations work including advanced scenarios (kind switching, multi-position moves, round-trips).
3. **Output capture** — All output types correctly decoded (stdout, stderr, execute_result, error) with proper MIME handling.
4. **New tools** — `clear_cell_outputs`, `clear_all_outputs`, and `save_notebook` all work correctly.

**Execution reliability** (P1/P4/P5) was live-tested on 2026-04-25. The `ExecutionMonitor` correctly reports kernel status ("unknown" for fresh sessions), but `execute_cell` still fails because VS Code's `notebook.cell.execute` command does not trigger kernel initialization from MCP. The 10s grace period expires without execution starting. See Issue 11 for details and proposed solutions.

**Stable cell IDs (P3)** and **cell-by-ID operations (P6)** are both ✅ **live verified** on 2026-04-25. Cell IDs remain stable across all replacement operations, and all 6 tested cell-by-ID operations work correctly. Issue 12 (MCP transport timeout) remains open — see P2.

### Architecture Quality

- **Clean separation:** Handler → service → VS Code API layering is well-designed.
- **Type safety:** Zod schemas and TypeScript types are comprehensive and well-aligned.
- **Error handling:** JSON-RPC error codes are consistent and descriptive.
- **ID generation:** Stable cell IDs via `nslCellId` metadata (P3) — ✅ live verified. Falls back to SHA-256 URI hash for legacy cells.
- **Sequential edits for moves:** The two-step delete+insert approach correctly handles index shifts.

---

## 🚀 Proposals for Improvement

### P1: Fix Execution Reliability After Kernel Restart — ❌ NOT FIXED (live verified 2026-04-25)

**Priority:** High · **Scope:** `packages/vscode-extension/src/notebookService.ts`

Code changes via `ExecutionMonitor` class verified via live MCP testing on 2026-04-25:
1. Listens to `onDidChangeNotebookCellExecutionState` events to detect actual execution state changes in real-time.
2. Tracks kernel activity per notebook — knows if a kernel has ever been active, not just if cells have historical execution counts.
3. Grace period extended from 3s to 10s for kernel reconnection after restart.
4. `getKernelStatus()` uses `ExecutionMonitor.hasKernelActivity()` instead of inferring from execution history.

**Live test result:** The `ExecutionMonitor` correctly reports `"unknown"` kernel status when no kernel activity has been detected (improvement over stale `"idle"`). However, `execute_cell` still fails because `notebook.cell.execute` does not trigger kernel initialization from MCP. The 10s grace period expires without execution starting. See Issue 11 for remaining root cause analysis.

### P2: Configurable MCP Client Timeout — ⏳ Open

**Priority:** High · **Scope:** `packages/mcp-server/src/client.ts`

The MCP bridge client timeout (~30s) is too short for long-running operations. Related to Issue 12. Proposals:
1. Make timeout configurable via environment variable (`NSL_BRIDGE_TIMEOUT_MS`).
2. Default to 180s to accommodate most notebook workloads.
3. Add per-request timeout override for known long operations (`run_all_cells`).
4. Consider implementing progress reporting (MCP `notifications/progress`) for operations that take >5s.

### P3: Stable Cell IDs — ✅ VERIFIED (live verified 2026-04-25)

**Priority:** Medium · **Scope:** `packages/vscode-extension/src/notebookService.ts`

Code changes via `nslCellId` cell metadata verified via live MCP testing on 2026-04-25:
1. `cellId()` checks cell metadata for persisted `nslCellId` first, falls back to URI hash for legacy cells.
2. `insertCell()` assigns a new random 32-char hex ID via metadata on creation.
3. `replaceCell()`, `clearCellOutputs()`, `clearAllOutputs()`, `moveCell()` all preserve the existing `nslCellId` through the replacement cycle.

**Live test result:** Cell IDs remain stable across all replacement operations (`replace_cell` ×2, `clear_cell_outputs`, `move_cell`, kind switching). New cells get fresh `nslCellId` on creation. Legacy cells get a new ID assigned on first replacement (one-time change, then stable). MCP consumers can maintain stable references across editing operations.

### P4: Event-Driven Execution Monitoring — ⚠️ Partially verified (live verified 2026-04-25)

**Priority:** Medium · **Scope:** `packages/vscode-extension/src/notebookService.ts`

Code changes via `ExecutionMonitor` class partially verified via live MCP testing on 2026-04-25:
```typescript
vscode.notebooks.onDidChangeNotebookCellExecutionState((e) => {
  // Track cell execution state changes
});
```
**Live test result:** The `ExecutionMonitor` correctly detects when no kernel activity has occurred (reports `"unknown"` status). However, the event-driven completion path could not be tested because `execute_cell` fails to start execution when the kernel hasn't been initialized. The monitoring infrastructure is in place and working for detection, but the completion benefits (event-driven wait, lower CPU) cannot be verified until Issue 11 is resolved.

### P5: Kernel Status via VS Code API — ✅ VERIFIED (live verified 2026-04-25)

**Priority:** Medium · **Scope:** `packages/vscode-extension/src/notebookService.ts`

Code changes via `ExecutionMonitor` class verified via live MCP testing on 2026-04-25:
- `getKernelStatus()` now calls `ExecutionMonitor.hasKernelActivity()` to detect real kernel availability.
- Tracks actual execution state events per notebook rather than inferring from historical execution counts.

**Live test result:** Kernel status correctly reports `"unknown"` for a fresh session with no prior kernel activity (no cells executed). This is an improvement over the previous behavior which would incorrectly report `"idle"` based on stale execution history. The diagnostic improvement is verified, though it doesn't solve Issue 11 (kernel still can't be started from MCP).

### P6: Cell-by-ID Operations — ✅ VERIFIED (live verified 2026-04-25)

**Priority:** Low · **Scope:** All packages

Code changes across all three packages verified via live MCP testing on 2026-04-25:
- **Shared schemas:** Added optional `cellId` parameter to 7 param schemas (`ReadCell`, `ReadCellOutput`, `ReplaceCell`, `EditCellSource`, `DeleteCell`, `ExecuteCell`, `ClearCellOutputs`).
- **Handlers:** Added `resolveCellIndex(doc, params)` helper that accepts either `cellIndex` or `cellId`, with `cellIndex` taking precedence.
- **MCP server:** Added `cellId` parameter to 7 tool definitions with description explaining it as a stable identifier.
- **Service:** Added `findCellIndexById(doc, id)` for cell lookup by stable ID.

**Live test results (all 6 tested operations passed):**
- `read_cell` by cellId ✅ — Correctly found cell at index 3 after move
- `edit_cell_source` by cellId ✅ — Source updated correctly
- `replace_cell` by cellId ✅ — Full replacement with kind switching works
- `clear_cell_outputs` by cellId ✅ — Outputs cleared, ID preserved
- `read_cell_output` by cellId ✅ — Returns correct outputs
- `delete_cell` by cellId ✅ — Cell deleted successfully
- `execute_cell` by cellId — ❌ Could not test (blocked by Issue 11)

Cell-by-ID operations successfully prevent index-shift bugs when cells are added/removed between calls.

### P7: Add Undo Support

**Priority:** Low · **Scope:** New tool

Add an `undo_edit` tool wrapping `vscode.commands.executeCommand('undo')`. Allows MCP consumers to revert accidental edits.

### P8: Batch Editing Operations

**Priority:** Low · **Scope:** All packages

Currently each edit is an independent `WorkspaceEdit`. Add batch support:
- `insert_cells` — Insert multiple cells in one operation.
- `edit_cells` — Edit multiple cells in one operation.
- Ensures atomic multi-cell changes and reduces round-trips.

### P9: Notebook Metadata Enrichment

**Priority:** Low · **Scope:** `packages/vscode-extension/src/notebookService.ts`

Add more useful metadata to notebook discovery:
- Last modified timestamp.
- File size.
- Dirty state tracking (currently reported but could be richer).
- Number of code vs markdown cells.
- Kernel display name (currently only `notebookType`).

### P10: Configurable Output Truncation

**Priority:** Low · **Scope:** `packages/mcp-server/src/index.ts`, `packages/vscode-extension/src/bridge/server.ts`

The `maxOutputSize` is currently hardcoded. Make it configurable via:
- MCP tool parameters (per-call override).
- Environment variables (default limit).
- Bridge configuration (server startup).

---

## Test Environment Notes

- Testing was performed against `notebooks/playground.ipynb` with 7 cells (markdown and code).
- Kernel: Python 3.12.3 with ipykernel 7.2.0 in a local `.venv`.
- All discovery, editing, output capture, and new tool tests passed.
- **Execution tests failed** after manual kernel restart. `execute_cell` returned "Kernel not available" despite `kernelStatus: "idle"`. The kernel needed to be warmed up via VS Code UI before MCP execution could work.
- `run_all_cells` successfully executed cells when called from a fresh session (previous test round) but timed out at MCP transport layer (~30s) when the total execution exceeded the client timeout.
- All editing operations were verified by reading back the notebook state after each operation.
- The long-running cell (60s sleep) was not tested to avoid blocking the test session.
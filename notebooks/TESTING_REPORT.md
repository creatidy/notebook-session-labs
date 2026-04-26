# Notebook Session Labs — MCP Testing Report

**Date:** 2026-04-26 (updated — cleaned up verified items, added security audit)
**Extension version:** 0.2.0
**MCP server tested via:** Docker MCP container (`ghcr.io/creatidy/notebook-session-labs-mcp:latest`) connected to VS Code bridge

---

## Test Summary

| Category | Status |
|---|---|
| Discovery (7 tools) | ✅ All passed |
| Editing (8 tools) | ✅ All passed |
| Execution (3 tools) | ⚠️ 2 issues open |
| Edge Cases (2 tests) | ✅ All passed |
| Output Capture (4 tests) | ✅ All passed |
| Utility (3 tools) | ✅ All passed |
| Stable Cell IDs (P3) | ✅ Live verified |
| Cell-by-ID Operations (P6) | ✅ Live verified (6/7; 7th blocked by Issue 11) |
| Kernel Status (P5) | ✅ Live verified |

**Previous bugs (1–10 + Issue 13):** All fixed and live verified. Removed from this report.

---

## 🐛 Open Issues

### Issue 11: `execute_cell` Fails After Kernel Restart Despite `kernelStatus: "idle"` (HIGH) — ❌ NOT FIXED

**Severity:** High · **File:** `packages/vscode-extension/src/notebookService.ts`

**Symptom:** After manually restarting the Jupyter kernel, `execute_cell` consistently fails with `"Kernel not available or execution did not start."` Meanwhile, `get_active_notebook` reports `kernelStatus: "idle"`.

**Code changes applied (P1/P4/P5) — verified via live MCP testing on 2026-04-25:**
1. Added `ExecutionMonitor` class that listens to `vscode.notebooks.onDidChangeNotebookCellExecutionState` events.
2. `getKernelStatus()` now uses `ExecutionMonitor.hasKernelActivity()` for real kernel detection.
3. Grace period extended from 3s to 10s for kernel reconnection after restart.
4. `runAllCells()` sets up event-driven completion listeners alongside polling fallback.

**Live test result (2026-04-25):** Issue NOT resolved. When `kernelStatus` is `"unknown"` (fresh session), `execute_cell` still fails after the 10s grace period. The `ExecutionMonitor` correctly reports "unknown" but `notebook.cell.execute` does not start execution when the kernel hasn't been initialized.

**Remaining root cause:** VS Code's `notebook.cell.execute` may require the kernel to be explicitly selected/started first. Possible solutions:
- Use `vscode.notebookKernelExecutionService` or equivalent API to force kernel startup.
- Call `vscode.commands.executeCommand('notebook.selectKernel', ...)` before execution.
- Detect "unknown" kernel status and return a more actionable error message directing the user to run a cell manually first.

---

### Issue 12: `run_all_cells` Times Out at MCP Transport Layer (MEDIUM)

**Severity:** Medium
**File:** `packages/mcp-server/src/client.ts` (bridge client timeout), `packages/vscode-extension/src/bridge/server.ts` (no request timeout)

**Symptom:** `run_all_cells` with default 120s timeout causes `"Bridge request timed out"` error after ~30 seconds, even though cells are still executing.

**Root cause:** The MCP client (Docker container → bridge) has a built-in ~30s HTTP request timeout. The bridge server has no request-level timeout — it waits indefinitely for `handleRequest` to resolve. The `run_all_cells` handler polls for up to 120s, exceeding the transport-level timeout.

**Proposed fix:**
1. Increase MCP client HTTP timeout to at least 180s for long-running operations.
2. Make bridge request timeout configurable via environment variable (`NSL_BRIDGE_TIMEOUT_MS`).
3. Implement streaming/progress reporting for long operations so the connection stays alive.

---

## 🚀 Open Proposals

### P1: Fix Execution Reliability After Kernel Restart — ❌ NOT FIXED

**Priority:** High · **Scope:** `packages/vscode-extension/src/notebookService.ts`

`ExecutionMonitor` class implemented and live verified. Correctly reports `"unknown"` for fresh sessions. However, `execute_cell` still fails because `notebook.cell.execute` does not trigger kernel initialization from MCP. See Issue 11 for remaining root cause.

### P2: Configurable MCP Client Timeout — ⏳ Open

**Priority:** High · **Scope:** `packages/mcp-server/src/client.ts`

The MCP bridge client timeout (~30s) is too short for long-running operations. Related to Issue 12. Proposals:
1. Make timeout configurable via environment variable (`NSL_REQUEST_TIMEOUT`).
2. Default to 180s to accommodate most notebook workloads.
3. Add per-request timeout override for known long operations (`run_all_cells`).
4. Consider implementing progress reporting (MCP `notifications/progress`) for operations that take >5s.

### P4: Event-Driven Execution Monitoring — ⚠️ Partially Verified

**Priority:** Medium · **Scope:** `packages/vscode-extension/src/notebookService.ts`

`ExecutionMonitor` correctly detects when no kernel activity has occurred (reports `"unknown"`). However, the event-driven completion path could not be fully tested because `execute_cell` fails to start execution when the kernel hasn't been initialized. The monitoring infrastructure is in place and working for detection, but the completion benefits cannot be verified until Issue 11 is resolved.

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
- Dirty state tracking (richer).
- Number of code vs markdown cells.
- Kernel display name (currently only `notebookType`).

### P10: Configurable Output Truncation

**Priority:** Low · **Scope:** `packages/mcp-server/src/index.ts`, `packages/vscode-extension/src/bridge/server.ts`

Make `maxOutputSize` configurable via:
- MCP tool parameters (per-call override).
- Environment variables (default limit).
- Bridge configuration (server startup).

---

## 🔒 Security Audit (2026-04-26)

### Audit Scope
- `packages/vscode-extension/src/bridge/auth.ts` — Token generation and validation
- `packages/vscode-extension/src/bridge/server.ts` — HTTP bridge server
- `packages/vscode-extension/src/bridge/handlers.ts` — JSON-RPC request handlers
- `packages/vscode-extension/src/notebookService.ts` — Notebook operations
- `packages/mcp-server/src/client.ts` — Bridge HTTP client
- `packages/mcp-server/src/index.ts` — MCP server entry point
- `packages/shared/src/` — Shared schemas and types

### ✅ What's Done Well

| Area | Implementation | Assessment |
|---|---|---|
| Network binding | `127.0.0.1` only, never `0.0.0.0` | ✅ Strong |
| Token authentication | Always-on 256-bit ephemeral bearer token (`crypto.randomBytes(32)`) | ✅ Strong |
| Timing attack prevention | `crypto.timingSafeEqual` for token comparison | ✅ Strong |
| Token lifecycle | Generated at startup, invalidated on shutdown, never persisted beyond port file | ✅ Strong |
| Port file permissions | `0600` (owner-only read/write) | ✅ Strong |
| State directory | Sticky bit (`01777`), stale file cleanup | ✅ Good |
| Auth mode bypass | Setting `"none"` is silently upgraded to `"token"` | ✅ Strong |
| Request validation | Zod schema validation (`JsonRpcRequestSchema`) on all incoming requests | ✅ Good |
| No shell execution | No `exec`, `spawn`, or shell commands exposed through tools | ✅ Strong |
| Output size limits | Configurable `maxOutputSize` prevents memory exhaustion | ✅ Good |
| No telemetry | No external data transmission | ✅ Strong |
| Logging | Tokens and cell content not logged at info level | ✅ Good |
| Health endpoint | `/health` requires no auth, returns only status/uptime | ✅ Acceptable |

### 🔶 Minor Observations (Non-Critical)

#### S1: No HTTP Request Body Size Limit (LOW)
**File:** `packages/vscode-extension/src/bridge/server.ts` (`handleHttpRequest`)
**Observation:** The bridge reads the entire request body with no size limit (`for await (const chunk of req) { body += chunk; }`). A malicious local process could send an extremely large body before authentication is checked. However, authentication IS verified after body parsing — the risk is memory pressure from a large body, not unauthorized access.
**Recommendation:** Add a `Content-Length` check before reading the body (e.g., reject requests > 10MB). This is low priority since the attacker would need local access and the port + token.

#### S2: Docker Container Reads Port File as Root (LOW)
**File:** `packages/vscode-extension/src/bridge/server.ts` (port file writing), `packages/mcp-server/src/index.ts` (port file reading)
**Observation:** When Docker runs the MCP container, it typically runs as root. The container reads the port file (which contains the auth token) via the volume mount. On multi-user systems, if Docker runs as root, it could theoretically read any user's port file. The `0600` permissions protect against other non-root users but not root.
**Recommendation:** Document this behavior for multi-user systems. Consider adding a `NSL_STATE_DIR` that points to a user-specific path.

#### S3: State Directory World-Writable (LOW)
**File:** `packages/vscode-extension/src/bridge/server.ts` (`writePortFile`)
**Observation:** The state directory is set to `0o1777` (world-writable with sticky bit, like `/tmp`). This allows any local user to create files in the directory. While the sticky bit prevents deletion of other users' files, a malicious local user could create fake port files.
**Recommendation:** Low risk since the token is required and not guessable. For higher-security environments, recommend using `NSL_STATE_DIR` to point to a user-owned directory with restricted permissions.

#### S4: Token in Port File Persists Until Shutdown (INFORMATIONAL)
**File:** `packages/vscode-extension/src/bridge/server.ts`
**Observation:** The auth token is written to the port file and persists until the bridge shuts down. If a user walks away from their machine, the token remains accessible to any process that can read the port file.
**Recommendation:** Acceptable for a local development tool. The token is invalidated on bridge shutdown and the file is removed.

### Overall Security Assessment: ✅ Strong

No critical or high-severity issues found. The security model is well-designed for a local development tool: loopback-only binding, always-on token auth, proper file permissions, no external data transmission, and no shell execution exposed. The minor observations above are informational and do not require immediate action.

---

## 📋 Conclusions

### Overall Assessment

The v0.2.0 release is **solid for all discovery, editing, and output capture operations**. All previously identified bugs have been fixed and verified. The core MCP bridge works reliably for:

1. **Notebook and cell discovery** — Comprehensive metadata, SHA-256 IDs, correct status reporting.
2. **Cell editing** — All operations work including advanced scenarios (kind switching, multi-position moves, round-trips).
3. **Output capture** — All output types correctly decoded with proper MIME handling.
4. **Utility tools** — `clear_cell_outputs`, `clear_all_outputs`, and `save_notebook` all work correctly.
5. **Stable cell IDs** — IDs remain stable across all replacement operations.
6. **Cell-by-ID operations** — All tested operations work correctly with stable IDs.

**Two open issues remain:**
- **Issue 11 (HIGH):** `execute_cell` fails when kernel hasn't been initialized. The `ExecutionMonitor` improves diagnostics but doesn't solve the fundamental VS Code API limitation.
- **Issue 12 (MEDIUM):** `run_all_cells` times out at MCP transport layer for long-running operations.

**Security:** No critical issues. The local bridge architecture with always-on token auth is appropriate and well-implemented.

---

## Test Environment Notes

- Testing was performed against `notebooks/playground.ipynb`.
- Kernel: Python 3.12.3 with ipykernel 7.2.0.
- All discovery, editing, output capture, and utility tool tests passed.
- Execution tests failed after kernel restart (see Issue 11).
- `run_all_cells` timed out at MCP transport layer for long operations (see Issue 12).

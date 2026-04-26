/**
 * Notebook Service - wraps VS Code notebook APIs behind a clean interface.
 *
 * This service is the source of truth for notebook access in the extension.
 * All VS Code API surface is concentrated here; the bridge handlers never
 * touch VS Code APIs directly.
 */
import * as vscode from "vscode";
import { createHash, randomBytes } from "crypto";
import { getLogger } from "./utils/logger.js";
import type {
  NotebookSummary,
  NotebookDetail,
  CellSummary,
  CellDetail,
  CellOutput,
  OutputItem,
  CellExecutionStatus,
  SelectionState,
  ExecutionResult,
} from "@notebook-session-labs/shared";
import {
  DEFAULT_MAX_OUTPUT_SIZE,
  MAX_OUTPUT_ITEMS_PER_CELL,
  TRUNCATION_MARKER,
} from "@notebook-session-labs/shared";

const log = getLogger();

// ── Stable Cell ID (P3) ──

/** Metadata key used to persist stable cell IDs across cell replacements */
const NSL_CELL_ID_META_KEY = "nslCellId";

/**
 * Generate a random stable cell ID (32-char hex).
 */
function randomCellId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Generate a stable ID for a notebook document.
 * Uses SHA-256 hash of the URI to avoid collisions from shared prefixes.
 */
function notebookId(doc: vscode.NotebookDocument): string {
  return createHash("sha256").update(doc.uri.toString()).digest("hex").slice(0, 32);
}

/**
 * Get the stable ID for a cell.
 * Checks metadata first for the persisted nslCellId; falls back to URI hash
 * for legacy cells that were created before stable IDs were introduced.
 */
export function cellId(cell: vscode.NotebookCell): string {
  const meta = cell.metadata as Record<string, unknown> | undefined;
  const metaId = meta?.[NSL_CELL_ID_META_KEY];
  if (typeof metaId === "string" && metaId.length > 0) {
    return metaId;
  }
  // Legacy fallback: hash of cell URI (not stable across replacements)
  return createHash("sha256").update(cell.document.uri.toString()).digest("hex").slice(0, 32);
}

// ── Execution Monitor (P4 — Event-Driven Execution Monitoring) ──

interface CellExecutionCompletion {
  cellIndex: number;
  success: boolean;
  executionOrder: number | undefined;
}

/**
 * Tracks cell execution state changes via VS Code's
 * `onDidChangeNotebookCellExecutionState` event. Provides event-driven
 * alternatives to polling for execution completion.
 */
class ExecutionMonitor implements vscode.Disposable {
  private _subscription: vscode.Disposable;
  /** notebook URI → (cell index → completion resolver queue) */
  private _pendingCells = new Map<string, Map<number, Array<(r: CellExecutionCompletion) => void>>>();
  /** notebook URI → timestamp of most recent execution-start */
  private _activeNotebooks = new Map<string, number>();
  private _disposed = false;
  /** Whether the proposed API is available */
  private _hasEventApi: boolean;

  constructor() {
    // onDidChangeNotebookCellExecutionState is a proposed API and may not
    // be available in all VS Code versions. Guard against its absence.
    if (typeof vscode.notebooks.onDidChangeNotebookCellExecutionState === "function") {
      this._hasEventApi = true;
      this._subscription = vscode.notebooks.onDidChangeNotebookCellExecutionState(
        this._onStateChange.bind(this),
      );
    } else {
      this._hasEventApi = false;
      this._subscription = { dispose() { /* noop */ } };
    }
  }

  // ---- private helpers ----

  private _nbKey(doc: vscode.NotebookDocument): string {
    return doc.uri.toString();
  }

  private _onStateChange(
    event: vscode.NotebookCellExecutionStateChangeEvent,
  ): void {
    if (this._disposed) return;

    const { cell, state } = event;
    const doc = cell.notebook;
    const nbKey = this._nbKey(doc);
    const idx = cell.index;

    // Track that this notebook has a working kernel
    if (state === vscode.NotebookCellExecutionState.Executing) {
      this._activeNotebooks.set(nbKey, Date.now());
    }

    // When cell transitions to Idle, resolve pending promises
    if (state === vscode.NotebookCellExecutionState.Idle) {
      const cellMap = this._pendingCells.get(nbKey);
      if (!cellMap) return;
      const resolvers = cellMap.get(idx);
      if (!resolvers) return;

      cellMap.delete(idx);
      if (cellMap.size === 0) this._pendingCells.delete(nbKey);

      const result: CellExecutionCompletion = {
        cellIndex: idx,
        success: cell.executionSummary?.success ?? true,
        executionOrder: cell.executionSummary?.executionOrder,
      };
      for (const resolve of resolvers) {
        resolve(result);
      }
    }
  }

  // ---- public API ----

  /**
   * Whether the event-driven API is available.
   */
  get hasEventApi(): boolean {
    return this._hasEventApi;
  }

  /**
   * Return a Promise that resolves when the given cell finishes executing,
   * or rejects after `timeoutMs`.
   */
  waitForCellCompletion(
    doc: vscode.NotebookDocument,
    cellIndex: number,
    timeoutMs: number,
  ): Promise<CellExecutionCompletion> {
    // If the event API is not available, return immediately with a placeholder
    if (!this._hasEventApi) {
      return Promise.resolve({
        cellIndex,
        success: true,
        executionOrder: undefined,
      });
    }

    return new Promise((resolve) => {
      const nbKey = this._nbKey(doc);
      let cellMap = this._pendingCells.get(nbKey);
      if (!cellMap) {
        cellMap = new Map();
        this._pendingCells.set(nbKey, cellMap);
      }
      let resolvers = cellMap.get(cellIndex);
      if (!resolvers) {
        resolvers = [];
        cellMap.set(cellIndex, resolvers);
      }

      // Timeout fallback
      const timer = setTimeout(() => {
        // Remove this resolver from the queue
        const current = this._pendingCells.get(nbKey)?.get(cellIndex);
        if (current) {
          const pos = current.indexOf(resolve);
          if (pos >= 0) current.splice(pos, 1);
          if (current.length === 0) {
            this._pendingCells.get(nbKey)?.delete(cellIndex);
          }
        }
        resolve({
          cellIndex,
          success: false,
          executionOrder: undefined,
        });
      }, timeoutMs);

      // Wrap resolve to clear the timeout
      const wrappedResolve = (r: CellExecutionCompletion) => {
        clearTimeout(timer);
        resolve(r);
      };
      resolvers.push(wrappedResolve);
    });
  }

  /**
   * Whether the notebook has ever been observed executing a cell.
   * Used to infer kernel availability.
   */
  hasKernelActivity(doc: vscode.NotebookDocument): boolean {
    return this._activeNotebooks.has(this._nbKey(doc));
  }

  dispose(): void {
    this._disposed = true;
    this._subscription.dispose();
    this._pendingCells.clear();
    this._activeNotebooks.clear();
  }
}

// Module-level singleton
let _executionMonitor: ExecutionMonitor | null = null;

/**
 * Initialise the shared execution monitor.
 * Call once during extension activation; returns the Disposable.
 */
export function initExecutionMonitor(): vscode.Disposable {
  _executionMonitor = new ExecutionMonitor();
  log.info("Execution monitor initialized");
  return _executionMonitor;
}

function getExecutionMonitor(): ExecutionMonitor {
  if (!_executionMonitor) {
    // Auto-init safety net
    _executionMonitor = new ExecutionMonitor();
    log.warn("Execution monitor auto-initialized (should be initialised during activation)");
  }
  return _executionMonitor;
}

// ── Cell execution status inference ──

/**
 * Map a cell's execution summary to our execution status.
 * Note: VS Code removed NotebookCellExecutionState in API v1.90+.
 * We infer status from the cell's executionSummary instead.
 */
function inferExecutionStatus(
  cell: vscode.NotebookCell,
): CellExecutionStatus {
  if (cell.executionSummary?.success === false) {
    return "failed";
  }
  if (cell.executionSummary?.executionOrder !== undefined) {
    return "idle";
  }
  return "idle";
}

/**
 * VS Code internal MIME types for notebook cell outputs.
 * These are used by VS Code to represent stdout, stderr, and error streams
 * but are not standard Jupyter MIME types.
 */
const VSCODE_INTERNAL_STREAM_MIMES = new Set([
  "application/vnd.code.notebook.stdout",
  "application/vnd.code.notebook.stderr",
]);

const VSCODE_INTERNAL_ERROR_MIME = "application/vnd.code.notebook.error";

/**
 * Detect kernel status for a notebook.
 * Uses the execution monitor for accurate detection; falls back to
 * execution-history inference for legacy cells.
 */
function getKernelStatus(
  doc: vscode.NotebookDocument,
): "idle" | "busy" | "unknown" {
  const monitor = getExecutionMonitor();
  if (monitor.hasKernelActivity(doc)) {
    return "idle";
  }
  // Legacy fallback: check execution history
  for (let i = 0; i < doc.cellCount; i++) {
    const cell = doc.cellAt(i);
    if (cell.executionSummary?.executionOrder !== undefined) {
      return "idle";
    }
  }
  return "unknown";
}

/**
 * Convert a VS Code cell output to our CellOutput type.
 */
function convertOutput(
  output: vscode.NotebookCellOutput,
  maxOutputSize: number,
  includeImages: boolean,
): CellOutput {
  const items: OutputItem[] = [];

  // Determine output kind from VS Code output type
  let outputKind: CellOutput["outputKind"] = "display_data";
  const metadata = output.metadata as Record<string, unknown> | undefined;
  if (metadata?.outputType === "error" || metadata?.outputType === "execute_result" || metadata?.outputType === "stream" || metadata?.outputType === "display_data") {
    outputKind = metadata.outputType as CellOutput["outputKind"];
  }

  // Cast output items - in newer VS Code API, items is NotebookCellOutputItem[]
  const outputItems = output.items as vscode.NotebookCellOutputItem[];

  for (const item of outputItems) {
    const mime = item.mime;

    // Skip image outputs if configured
    if (!includeImages && (mime === "image/png" || mime === "image/jpeg")) {
      items.push({
        mime,
        data: "[image output disabled]",
        truncated: false,
        originalSize: 0,
      });
      continue;
    }

    // Handle text-based outputs
    if (
      mime === "text/plain" ||
      mime === "text/markdown" ||
      mime === "text/html" ||
      mime === "application/json"
    ) {
      const text = Buffer.from(item.data).toString("utf-8");
      const truncated = text.length > maxOutputSize;
      const data = truncated
        ? text.slice(0, maxOutputSize) + TRUNCATION_MARKER
        : text;
      items.push({
        mime,
        data,
        truncated,
        originalSize: text.length,
      });
    } else if (mime === "image/png" || mime === "image/jpeg") {
      // Base64 encode image data
      const base64 = Buffer.from(item.data).toString("base64");
      const truncated = base64.length > maxOutputSize;
      const data = truncated
        ? base64.slice(0, maxOutputSize) + TRUNCATION_MARKER
        : base64;
      items.push({
        mime,
        data,
        truncated,
        originalSize: base64.length,
      });
    } else if (VSCODE_INTERNAL_STREAM_MIMES.has(mime)) {
      // VS Code internal stdout/stderr MIME types — decode as text
      const text = Buffer.from(item.data).toString("utf-8");
      const truncated = text.length > maxOutputSize;
      const data = truncated
        ? text.slice(0, maxOutputSize) + TRUNCATION_MARKER
        : text;
      items.push({
        mime: "text/plain",
        data,
        truncated,
        originalSize: text.length,
      });
    } else if (mime === VSCODE_INTERNAL_ERROR_MIME) {
      // VS Code internal error MIME type — decode error output
      const rawText = Buffer.from(item.data).toString("utf-8");
      let errorText = rawText;

      // Try to parse structured error from data.
      // VS Code error MIME may use Jupyter convention (ename/evalue/traceback)
      // or JavaScript convention (name/message/stack).
      try {
        const parsed = JSON.parse(rawText);
        const errorName = parsed.ename ?? parsed.name;
        const errorMsg = parsed.evalue ?? parsed.message;
        if (errorName || errorMsg) {
          const trace = parsed.traceback
            ? (Array.isArray(parsed.traceback) ? parsed.traceback.join("\n") : String(parsed.traceback))
            : (parsed.stack ? String(parsed.stack) : "");
          errorText = [
            trace,
            `${errorName ?? "Error"}: ${errorMsg ?? ""}`,
          ].filter(Boolean).join("\n");
        }
      } catch {
        // Not JSON — use raw text as-is
      }

      const truncated = errorText.length > maxOutputSize;
      const data = truncated
        ? errorText.slice(0, maxOutputSize) + TRUNCATION_MARKER
        : errorText;
      items.push({
        mime: "text/plain",
        data,
        truncated,
        originalSize: errorText.length,
      });
    } else {
      // Unknown mime type - include as metadata only
      items.push({
        mime,
        data: `[unsupported mime type: ${mime}]`,
        truncated: false,
        originalSize: 0,
      });
    }

    // Limit output items per cell
    if (items.length >= MAX_OUTPUT_ITEMS_PER_CELL) {
      break;
    }
  }

  return {
    id: crypto.randomUUID(),
    outputKind,
    items,
    metadata: output.metadata as Record<string, unknown> ?? {},
  };
}

// ── Public API ──

/**
 * Get the active notebook editor, or undefined if none is active.
 */
export function getActiveNotebook(): vscode.NotebookDocument | undefined {
  return vscode.window.activeNotebookEditor?.notebook;
}

/**
 * List all open notebook documents.
 */
export function listOpenNotebooks(): readonly vscode.NotebookDocument[] {
  return vscode.workspace.notebookDocuments;
}

/**
 * Get a notebook summary for a VS Code notebook document.
 */
export function getNotebookSummary(doc: vscode.NotebookDocument): NotebookSummary {
  return {
    id: notebookId(doc),
    uri: doc.uri.toString(),
    fileName: doc.uri.path.split("/").pop() || "untitled",
    cellCount: doc.cellCount,
    kernelStatus: getKernelStatus(doc),
    isDirty: doc.isDirty,
  };
}

/**
 * Get detailed notebook information.
 */
export async function getNotebookDetail(
  doc: vscode.NotebookDocument,
  _maxOutputSize: number = DEFAULT_MAX_OUTPUT_SIZE,
  _includeImages: boolean = true,
): Promise<NotebookDetail> {
  const cells: CellSummary[] = doc.getCells().map((cell, index) =>
    getCellSummary(cell, index),
  );

  const kernelStatus = getKernelStatus(doc);
  const kernelDisplayName = doc.notebookType || "unknown";

  return {
    id: notebookId(doc),
    uri: doc.uri.toString(),
    fileName: doc.uri.path.split("/").pop() || "untitled",
    isDirty: doc.isDirty,
    kernelStatus,
    kernelDisplayName,
    cells,
    metadata: doc.metadata as Record<string, unknown> ?? {},
  };
}

/**
 * Get a cell summary from a VS Code notebook cell.
 */
export function getCellSummary(
  cell: vscode.NotebookCell,
  index: number,
): CellSummary {
  const sourcePreview =
    cell.document.getText().slice(0, 200) +
    (cell.document.getText().length > 200 ? "..." : "");

  return {
    index,
    id: cellId(cell),
    kind: cell.kind === vscode.NotebookCellKind.Code ? "code" : "markdown",
    sourcePreview,
    executionCount:
      cell.kind === vscode.NotebookCellKind.Code
        ? (cell.executionSummary?.executionOrder ?? null)
        : null,
    executionStatus: inferExecutionStatus(cell),
    hasOutput: cell.outputs.length > 0,
  };
}

/**
 * Get detailed cell information.
 */
export function getCellDetail(
  cell: vscode.NotebookCell,
  index: number,
  maxOutputSize: number = DEFAULT_MAX_OUTPUT_SIZE,
  includeImages: boolean = true,
): CellDetail {
  const outputs: CellOutput[] = cell.outputs.map((output) =>
    convertOutput(output, maxOutputSize, includeImages),
  );

  const executionStatus: CellExecutionStatus = cell.executionSummary?.success === false
    ? "failed"
    : "idle";

  return {
    index,
    id: cellId(cell),
    kind: cell.kind === vscode.NotebookCellKind.Code ? "code" : "markdown",
    source: cell.document.getText(),
    executionCount:
      cell.kind === vscode.NotebookCellKind.Code
        ? (cell.executionSummary?.executionOrder ?? null)
        : null,
    executionStatus,
    outputs,
    metadata: cell.metadata as Record<string, unknown> ?? {},
    language: cell.document.languageId,
  };
}

/**
 * Get cell outputs only.
 */
export function getCellOutputs(
  cell: vscode.NotebookCell,
  maxOutputSize: number = DEFAULT_MAX_OUTPUT_SIZE,
  includeImages: boolean = true,
): CellOutput[] {
  return cell.outputs.map((output) =>
    convertOutput(output, maxOutputSize, includeImages),
  );
}

/**
 * Get the current selection state.
 */
export function getSelection(
  doc: vscode.NotebookDocument,
): SelectionState {
  const editor = vscode.window.activeNotebookEditor;
  if (!editor || editor.notebook !== doc) {
    return {
      notebookId: notebookId(doc),
      selectedCellIndex: null,
      selectedCellRange: null,
      focusedCellId: null,
    };
  }

  const selections = editor.selections;
  const focusedCell = editor.selections.length > 0
    ? editor.selections[0]
    : undefined;

  return {
    notebookId: notebookId(doc),
    selectedCellIndex: focusedCell?.start ?? null,
    selectedCellRange:
      selections.length > 0
        ? [selections[0].start, selections[0].end - 1]
        : null,
    focusedCellId:
      focusedCell
        ? cellId(doc.cellAt(focusedCell.start))
        : null,
  };
}

/**
 * Find a notebook by ID.
 */
export function findNotebookById(
  id: string,
): vscode.NotebookDocument | undefined {
  return vscode.workspace.notebookDocuments.find(
    (doc) => notebookId(doc) === id,
  );
}

/**
 * Resolve a notebook reference: if notebookId is provided, find it;
 * otherwise return the active notebook.
 */
export function resolveNotebook(
  notebookId?: string,
): vscode.NotebookDocument | undefined {
  if (notebookId) {
    return findNotebookById(notebookId);
  }
  return getActiveNotebook();
}

/**
 * Find a cell index by its stable ID within a notebook.
 * Returns null if no cell matches.
 */
export function findCellIndexById(
  doc: vscode.NotebookDocument,
  id: string,
): number | null {
  for (let i = 0; i < doc.cellCount; i++) {
    const cell = doc.cellAt(i);
    if (cellId(cell) === id) {
      return i;
    }
  }
  return null;
}

/**
 * Insert a new cell into a notebook.
 */
export async function insertCell(
  doc: vscode.NotebookDocument,
  index: number,
  kind: "code" | "markdown",
  source: string,
  language?: string,
): Promise<CellDetail> {
  const wsEdit = new vscode.WorkspaceEdit();
  const cellKind =
    kind === "code"
      ? vscode.NotebookCellKind.Code
      : vscode.NotebookCellKind.Markup;

  // Determine language for code cells
  const cellLanguage = kind === "code"
    ? (language || getDefaultKernelLanguage(doc))
    : "markdown";

  const newCell = new vscode.NotebookCellData(cellKind, source, cellLanguage);
  newCell.metadata = { [NSL_CELL_ID_META_KEY]: randomCellId() };

  wsEdit.set(
    doc.uri,
    [vscode.NotebookEdit.insertCells(index, [newCell])],
  );

  await vscode.workspace.applyEdit(wsEdit);

  // Return the newly inserted cell
  const insertedCell = doc.cellAt(index);
  return getCellDetail(insertedCell, index);
}

/**
 * Replace a cell's content.
 */
export async function replaceCell(
  doc: vscode.NotebookDocument,
  cellIndex: number,
  source: string,
  kind?: "code" | "markdown",
  language?: string,
): Promise<CellDetail> {
  if (cellIndex < 0 || cellIndex >= doc.cellCount) {
    throw new Error(`Cell index ${cellIndex} out of range`);
  }

  const existingCell = doc.cellAt(cellIndex);
  const cellKind = kind
    ? kind === "code"
      ? vscode.NotebookCellKind.Code
      : vscode.NotebookCellKind.Markup
    : existingCell.kind;

  const isKindChange = kind !== undefined &&
    ((kind === "code") !== (existingCell.kind === vscode.NotebookCellKind.Code));
  const cellLanguage = cellKind === vscode.NotebookCellKind.Code
    ? (language || (isKindChange ? getDefaultKernelLanguage(doc) : existingCell.document.languageId))
    : "markdown";

  const wsEdit = new vscode.WorkspaceEdit();
  const newCell = new vscode.NotebookCellData(cellKind, source, cellLanguage);
  // Preserve existing metadata and ensure stable ID is kept
  const existingMeta = (existingCell.metadata as Record<string, unknown>) ?? {};
  newCell.metadata = {
    ...existingMeta,
    // Keep existing nslCellId, or generate a new one if somehow missing
    [NSL_CELL_ID_META_KEY]: (existingMeta[NSL_CELL_ID_META_KEY] as string) || randomCellId(),
  };

  wsEdit.set(
    doc.uri,
    [vscode.NotebookEdit.replaceCells(
      new vscode.NotebookRange(cellIndex, cellIndex + 1),
      [newCell],
    )],
  );

  await vscode.workspace.applyEdit(wsEdit);

  const updatedCell = doc.cellAt(cellIndex);
  return getCellDetail(updatedCell, cellIndex);
}

/**
 * Edit a cell's source text.
 */
export async function editCellSource(
  doc: vscode.NotebookDocument,
  cellIndex: number,
  source: string,
): Promise<CellDetail> {
  if (cellIndex < 0 || cellIndex >= doc.cellCount) {
    throw new Error(`Cell index ${cellIndex} out of range`);
  }

  const cell = doc.cellAt(cellIndex);
  const wsEdit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    cell.document.lineAt(0).range.start,
    cell.document.lineAt(cell.document.lineCount - 1).range.end,
  );
  wsEdit.replace(cell.document.uri, fullRange, source);
  await vscode.workspace.applyEdit(wsEdit);

  return getCellDetail(doc.cellAt(cellIndex), cellIndex);
}

/**
 * Delete a cell from a notebook.
 */
export async function deleteCell(
  doc: vscode.NotebookDocument,
  cellIndex: number,
): Promise<void> {
  if (cellIndex < 0 || cellIndex >= doc.cellCount) {
    throw new Error(`Cell index ${cellIndex} out of range`);
  }

  const wsEdit = new vscode.WorkspaceEdit();
  wsEdit.set(
    doc.uri,
    [vscode.NotebookEdit.deleteCells(
      new vscode.NotebookRange(cellIndex, cellIndex + 1),
    )],
  );
  await vscode.workspace.applyEdit(wsEdit);
}

/**
 * Clear outputs for a specific cell.
 */
export async function clearCellOutputs(
  doc: vscode.NotebookDocument,
  cellIndex: number,
): Promise<CellDetail> {
  if (cellIndex < 0 || cellIndex >= doc.cellCount) {
    throw new Error(`Cell index ${cellIndex} out of range`);
  }

  const cell = doc.cellAt(cellIndex);
  if (cell.outputs.length === 0) {
    return getCellDetail(cell, cellIndex);
  }

  const existingMeta = (cell.metadata as Record<string, unknown>) ?? {};
  const cellData = new vscode.NotebookCellData(
    cell.kind,
    cell.document.getText(),
    cell.document.languageId,
  );
  // Preserve metadata including stable ID
  cellData.metadata = {
    ...existingMeta,
    [NSL_CELL_ID_META_KEY]: (existingMeta[NSL_CELL_ID_META_KEY] as string) || randomCellId(),
  };
  // No outputs — cleared

  const wsEdit = new vscode.WorkspaceEdit();
  wsEdit.set(
    doc.uri,
    [vscode.NotebookEdit.replaceCells(
      new vscode.NotebookRange(cellIndex, cellIndex + 1),
      [cellData],
    )],
  );
  await vscode.workspace.applyEdit(wsEdit);

  return getCellDetail(doc.cellAt(cellIndex), cellIndex);
}

/**
 * Clear outputs for all cells in a notebook.
 */
export async function clearAllOutputs(
  doc: vscode.NotebookDocument,
): Promise<{ clearedCells: number }> {
  let clearedCells = 0;

  for (let i = 0; i < doc.cellCount; i++) {
    const cell = doc.cellAt(i);
    if (cell.outputs.length > 0) {
      const existingMeta = (cell.metadata as Record<string, unknown>) ?? {};
      const cellData = new vscode.NotebookCellData(
        cell.kind,
        cell.document.getText(),
        cell.document.languageId,
      );
      // Preserve metadata including stable ID
      cellData.metadata = {
        ...existingMeta,
        [NSL_CELL_ID_META_KEY]: (existingMeta[NSL_CELL_ID_META_KEY] as string) || randomCellId(),
      };

      const wsEdit = new vscode.WorkspaceEdit();
      wsEdit.set(
        doc.uri,
        [vscode.NotebookEdit.replaceCells(
          new vscode.NotebookRange(i, i + 1),
          [cellData],
        )],
      );
      // eslint-disable-next-line no-await-in-loop
      await vscode.workspace.applyEdit(wsEdit);
      clearedCells++;
    }
  }

  return { clearedCells };
}

/**
 * Move a cell from one position to another.
 */
export async function moveCell(
  doc: vscode.NotebookDocument,
  fromIndex: number,
  toIndex: number,
): Promise<CellDetail> {
  if (fromIndex < 0 || fromIndex >= doc.cellCount) {
    throw new Error(`Source cell index ${fromIndex} out of range`);
  }
  if (toIndex < 0 || toIndex >= doc.cellCount) {
    throw new Error(`Target cell index ${toIndex} out of range`);
  }

  // No-op if same index
  if (fromIndex === toIndex) {
    return getCellDetail(doc.cellAt(fromIndex), fromIndex);
  }

  const cell = doc.cellAt(fromIndex);
  const existingMeta = (cell.metadata as Record<string, unknown>) ?? {};
  const cellData = new vscode.NotebookCellData(
    cell.kind,
    cell.document.getText(),
    cell.document.languageId,
  );
  // Preserve metadata including stable ID
  cellData.metadata = {
    ...existingMeta,
    [NSL_CELL_ID_META_KEY]: (existingMeta[NSL_CELL_ID_META_KEY] as string) || randomCellId(),
  };
  cellData.outputs = cell.outputs.map(
    (o) => new vscode.NotebookCellOutput(o.items),
  );

  // Step 1: Remove from old position
  const deleteEdit = new vscode.WorkspaceEdit();
  deleteEdit.set(
    doc.uri,
    [vscode.NotebookEdit.deleteCells(
      new vscode.NotebookRange(fromIndex, fromIndex + 1),
    )],
  );
  await vscode.workspace.applyEdit(deleteEdit);

  // Step 2: Insert at new position (after deletion shifted indices)
  const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
  const insertEdit = new vscode.WorkspaceEdit();
  insertEdit.set(
    doc.uri,
    [vscode.NotebookEdit.insertCells(insertIndex, [cellData])],
  );
  await vscode.workspace.applyEdit(insertEdit);

  const movedCell = doc.cellAt(insertIndex);
  return getCellDetail(movedCell, insertIndex);
}

/**
 * Execute a single cell.
 *
 * Always dispatches execution and returns immediately with status "pending".
 * Use `getExecutionStatus` to poll for completion, or the caller may
 * implement their own waiting strategy.
 */
export async function executeCell(
  doc: vscode.NotebookDocument,
  cellIndex: number,
  _timeoutMs?: number,
  _waitForCompletion?: boolean,
): Promise<ExecutionResult> {
  if (cellIndex < 0 || cellIndex >= doc.cellCount) {
    throw new Error(`Cell index ${cellIndex} out of range`);
  }

  const cell = doc.cellAt(cellIndex);
  const startTime = Date.now();
  const previousExecutionOrder = cell.executionSummary?.executionOrder;

  // Store the previous execution order on the cell metadata so we can detect
  // when execution completes (new executionOrder differs from this).
  const existingMeta = (cell.metadata as Record<string, unknown>) ?? {};
  const wsEdit = new vscode.WorkspaceEdit();
  const cellData = new vscode.NotebookCellData(
    cell.kind,
    cell.document.getText(),
    cell.document.languageId,
  );
  cellData.metadata = {
    ...existingMeta,
    [NSL_CELL_ID_META_KEY]: (existingMeta[NSL_CELL_ID_META_KEY] as string) || randomCellId(),
    _nslPrevExecOrder: previousExecutionOrder ?? null,
  };
  cellData.outputs = [...cell.outputs];
  wsEdit.set(
    doc.uri,
    [vscode.NotebookEdit.replaceCells(
      new vscode.NotebookRange(cellIndex, cellIndex + 1),
      [cellData],
    )],
  );
  await vscode.workspace.applyEdit(wsEdit);

  log.info({ cellIndex, notebookId: notebookId(doc), previousExecutionOrder }, "Executing cell (async)");

  try {
    // Show the notebook and select the target cell to ensure it's the active editor.
    await vscode.window.showNotebookDocument(doc, {
      selections: [new vscode.NotebookRange(cellIndex, cellIndex + 1)],
    });

    // Give the editor time to activate and kernel time to connect on first use.
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Dispatch cell execution. Uses { ranges, document } argument format.
    void vscode.commands.executeCommand(
      "notebook.cell.execute",
      {
        ranges: [{ start: cellIndex, end: cellIndex + 1 }],
        document: doc.uri,
      },
    );

    // Return immediately with pending status
    return {
      cellId: cellId(doc.cellAt(cellIndex)),
      status: "pending",
      executionCount: null,
      outputs: [],
      durationMs: null,
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error({ error, cellIndex }, "Cell execution dispatch failed");
    return {
      cellId: cellId(doc.cellAt(cellIndex)),
      status: "failed",
      executionCount: null,
      outputs: [],
      durationMs: Date.now() - startTime,
      error,
    };
  }
}

/**
 * Get the current execution status of a cell.
 * Compares current executionOrder against the stored previous value
 * to determine if execution has completed.
 */
export function getExecutionStatus(
  doc: vscode.NotebookDocument,
  cellIndex: number,
): ExecutionResult {
  if (cellIndex < 0 || cellIndex >= doc.cellCount) {
    throw new Error(`Cell index ${cellIndex} out of range`);
  }

  const cell = doc.cellAt(cellIndex);
  const currentOrder = cell.executionSummary?.executionOrder;
  const meta = cell.metadata as Record<string, unknown> | undefined;
  const previousOrder = meta?._nslPrevExecOrder as number | null | undefined;
  const startTime = meta?._nslExecStart as number | null | undefined;

  // If executionOrder changed from the stored previous value, execution completed
  if (currentOrder !== undefined && currentOrder !== previousOrder) {
    const outputs = getCellOutputs(cell);
    const hasError = cell.executionSummary?.success === false;
    return {
      cellId: cellId(cell),
      status: hasError ? "failed" : "succeeded",
      executionCount: currentOrder ?? null,
      outputs,
      durationMs: startTime ? Date.now() - startTime : null,
      error: hasError ? extractErrorMessage(outputs) : null,
    };
  }

  // Still pending (or hasn't started yet)
  return {
    cellId: cellId(cell),
    status: "pending",
    executionCount: null,
    outputs: [],
    durationMs: startTime ? Date.now() - startTime : null,
    error: null,
  };
}

/**
 * Run all cells in a notebook (fire-and-forget dispatch).
 *
 * Stores previous execution orders on cell metadata so that
 * `getExecutionStatus` can detect completion, then dispatches
 * `notebook.execute` and returns immediately.
 * The caller is expected to poll `getExecutionStatus` for each
 * code cell to determine when execution finishes.
 */
export async function runAllCells(
  doc: vscode.NotebookDocument,
  _timeoutMs?: number,
): Promise<{ dispatched: boolean; codeCellIndices: number[] }> {
  log.info({ notebookId: notebookId(doc) }, "Dispatching run-all-cells");

  // Record previous execution orders for all code cells via metadata
  const codeCellIndices: number[] = [];
  for (let i = 0; i < doc.cellCount; i++) {
    const cell = doc.cellAt(i);
    if (cell.kind === vscode.NotebookCellKind.Code) {
      codeCellIndices.push(i);
    }
  }

  if (codeCellIndices.length === 0) {
    return { dispatched: false, codeCellIndices: [] };
  }

  // Store _nslPrevExecOrder on each code cell so getExecutionStatus
  // can detect when execution completes (executionOrder changes).
  for (const idx of codeCellIndices) {
    const cell = doc.cellAt(idx);
    const existingMeta = (cell.metadata as Record<string, unknown>) ?? {};
    const wsEdit = new vscode.WorkspaceEdit();
    const cellData = new vscode.NotebookCellData(
      cell.kind,
      cell.document.getText(),
      cell.document.languageId,
    );
    cellData.metadata = {
      ...existingMeta,
      [NSL_CELL_ID_META_KEY]: (existingMeta[NSL_CELL_ID_META_KEY] as string) || randomCellId(),
      _nslPrevExecOrder: cell.executionSummary?.executionOrder ?? null,
    };
    cellData.outputs = [...cell.outputs];
    wsEdit.set(
      doc.uri,
      [vscode.NotebookEdit.replaceCells(
        new vscode.NotebookRange(idx, idx + 1),
        [cellData],
      )],
    );
    // eslint-disable-next-line no-await-in-loop
    await vscode.workspace.applyEdit(wsEdit);
  }

  // Fire-and-forget: dispatch notebook execution
  void vscode.commands.executeCommand("notebook.execute", doc.uri);

  return { dispatched: true, codeCellIndices };
}

/**
 * Cancel notebook execution.
 */
export async function cancelExecution(
  doc: vscode.NotebookDocument,
): Promise<void> {
  log.info({ notebookId: notebookId(doc) }, "Cancelling execution");
  await vscode.commands.executeCommand(
    "notebook.cancelExecution",
    doc.uri,
  );
}

/**
 * Save a notebook.
 */
export async function saveNotebook(
  doc: vscode.NotebookDocument,
): Promise<boolean> {
  log.info({ notebookId: notebookId(doc) }, "Saving notebook");
  return doc.save();
}

// ── Internal helpers ──

/**
 * Wait for a cell execution to complete.
 *
 * Uses the event-driven ExecutionMonitor as primary mechanism,
 * with polling as a safety fallback.
 */
async function waitForCellCompletion(
  doc: vscode.NotebookDocument,
  cellIndex: number,
  startTime: number,
  previousExecutionOrder: number | undefined,
  timeoutMs: number,
): Promise<ExecutionResult> {
  const cell = doc.cellAt(cellIndex);
  const deadline = startTime + timeoutMs;
  const pollInterval = 500;
  const kernelGracePeriod = 10_000; // 10s grace for kernel to start (P1: extended from 3s)
  const kernelCheckTime = startTime + kernelGracePeriod;
  let kernelCheckDone = false;

  // Set up event-driven completion
  const monitor = getExecutionMonitor();
  const eventTimeout = Math.min(timeoutMs, deadline - Date.now());
  const eventPromise = monitor.waitForCellCompletion(doc, cellIndex, eventTimeout);
  let eventResolved = false;
  void eventPromise.then((result) => {
    eventResolved = true;
  });

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const currentCell = doc.cellAt(cellIndex);
    const currentExecutionOrder = currentCell.executionSummary?.executionOrder;

    // Check if execution completed (execution order changed from previous)
    if (currentExecutionOrder !== undefined && currentExecutionOrder !== previousExecutionOrder) {
      const outputs = getCellOutputs(currentCell);
      const hasError = currentCell.executionSummary.success === false;
      const durationMs = Date.now() - startTime;

      return {
        cellId: cellId(currentCell),
        status: hasError ? "failed" : "succeeded",
        executionCount: currentExecutionOrder ?? null,
        outputs,
        durationMs,
        error: hasError
          ? extractErrorMessage(outputs)
          : null,
      };
    }

    // After grace period, check if kernel started the execution at all.
    // NOTE: We only abort early if the event-driven API is available AND
    // confirms no execution was observed. If the event API is not available,
    // we rely on polling alone and wait the full timeout.
    if (!kernelCheckDone && Date.now() >= kernelCheckTime) {
      kernelCheckDone = true;
      if (currentExecutionOrder === previousExecutionOrder && monitor.hasEventApi) {
        // Execution order hasn't changed AND we have the event API.
        // Check if the event monitor observed ANY execution start for this notebook.
        if (!monitor.hasKernelActivity(doc)) {
          // No execution activity detected via events — kernel likely not connected.
          // But before giving up, try re-dispatching the command once more — the
          // kernel may have just finished connecting.
          log.info("No kernel activity detected, re-dispatching execution command");
          void vscode.commands.executeCommand(
            "notebook.cell.execute",
            {
              ranges: [{ start: cellIndex, end: cellIndex + 1 }],
              document: doc.uri,
            },
          );
          // Continue waiting — don't abort yet. If still no activity after
          // another grace period, we'll time out naturally.
        }
      }
    }
  }

  // Timeout
  return {
    cellId: cellId(cell),
    status: "pending",
    executionCount: null,
    outputs: [],
    durationMs: Date.now() - startTime,
    error: "Execution timed out",
  };
}

/**
 * Extract error message from cell outputs.
 */
function extractErrorMessage(outputs: CellOutput[]): string | null {
  for (const output of outputs) {
    if (output.outputKind === "error") {
      const textItem = output.items.find(
        (item) => item.mime === "text/plain" || item.mime === "application/json",
      );
      if (textItem) {
        return textItem.data.slice(0, 500);
      }
    }
  }
  return null;
}

/**
 * Get the default language for code cells in a notebook.
 */
function getDefaultKernelLanguage(doc: vscode.NotebookDocument): string {
  // Try to infer from existing code cells
  for (let i = 0; i < doc.cellCount; i++) {
    const cell = doc.cellAt(i);
    if (cell.kind === vscode.NotebookCellKind.Code) {
      return cell.document.languageId;
    }
  }
  return "python";
}
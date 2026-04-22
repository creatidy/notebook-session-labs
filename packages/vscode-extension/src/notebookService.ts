/**
 * Notebook Service - wraps VS Code notebook APIs behind a clean interface.
 *
 * This service is the source of truth for notebook access in the extension.
 * All VS Code API surface is concentrated here; the bridge handlers never
 * touch VS Code APIs directly.
 */
import * as vscode from "vscode";
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

/**
 * Generate a stable ID for a notebook document.
 */
function notebookId(doc: vscode.NotebookDocument): string {
  return Buffer.from(doc.uri.toString()).toString("base64url").slice(0, 32);
}

/**
 * Generate a stable ID for a cell.
 */
function cellId(cell: vscode.NotebookCell): string {
  return Buffer.from(cell.document.uri.toString()).toString("base64url").slice(0, 16);
}

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
    kernelStatus: "unknown", // Will be populated when kernel info is available
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

  const kernelStatus = "unknown";
  let kernelDisplayName = "unknown";

  // Attempt to get kernel info
  try {
    const kernel = doc.notebookType;
    kernelDisplayName = kernel || "unknown";
  } catch {
    // Kernel info not available
  }

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
  newCell.metadata = {};

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

  const cellLanguage = cellKind === vscode.NotebookCellKind.Code
    ? (language || existingCell.document.languageId)
    : "markdown";

  const wsEdit = new vscode.WorkspaceEdit();
  const newCell = new vscode.NotebookCellData(cellKind, source, cellLanguage);
  newCell.metadata = existingCell.metadata as Record<string, unknown> ?? {};

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

  const cell = doc.cellAt(fromIndex);
  const cellData = new vscode.NotebookCellData(
    cell.kind,
    cell.document.getText(),
    cell.document.languageId,
  );
  cellData.metadata = cell.metadata as Record<string, unknown> ?? {};
  cellData.outputs = cell.outputs.map(
    (o) => new vscode.NotebookCellOutput(o.items),
  );

  const wsEdit = new vscode.WorkspaceEdit();

  // Remove from old position
  wsEdit.set(
    doc.uri,
    [vscode.NotebookEdit.deleteCells(
      new vscode.NotebookRange(fromIndex, fromIndex + 1),
    )],
  );

  // Insert at new position (adjust for removal shift)
  const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
  wsEdit.set(
    doc.uri,
    [vscode.NotebookEdit.insertCells(adjustedIndex, [cellData])],
  );

  await vscode.workspace.applyEdit(wsEdit);

  const movedCell = doc.cellAt(adjustedIndex);
  return getCellDetail(movedCell, adjustedIndex);
}

/**
 * Execute a single cell.
 */
export async function executeCell(
  doc: vscode.NotebookDocument,
  cellIndex: number,
  timeoutMs?: number,
  waitForCompletion: boolean = true,
): Promise<ExecutionResult> {
  if (cellIndex < 0 || cellIndex >= doc.cellCount) {
    throw new Error(`Cell index ${cellIndex} out of range`);
  }

  const cell = doc.cellAt(cellIndex);
  const startTime = Date.now();

  log.info({ cellIndex, notebookId: notebookId(doc) }, "Executing cell");

  try {
    // Use VS Code command to execute the cell
    void vscode.commands.executeCommand(
      "notebook.cell.execute",
      {
        notebookEditor: { notebookUri: doc.uri },
        cell: cell.document.uri,
      },
    );

    if (waitForCompletion) {
      // Wait for execution to complete by polling cell state
      const timeout = timeoutMs || 60_000;
      const result = await waitForCellCompletion(
        doc,
        cellIndex,
        startTime,
        timeout,
      );
      return result;
    } else {
      // Fire-and-forget mode
      return {
        cellId: cellId(cell),
        status: "pending",
        executionCount: null,
        outputs: [],
        durationMs: null,
        error: null,
      };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error({ error, cellIndex }, "Cell execution failed");
    return {
      cellId: cellId(cell),
      status: "failed",
      executionCount: null,
      outputs: [],
      durationMs: Date.now() - startTime,
      error,
    };
  }
}

/**
 * Run all cells in a notebook.
 */
export async function runAllCells(
  doc: vscode.NotebookDocument,
  _timeoutMs?: number,
): Promise<ExecutionResult[]> {
  log.info({ notebookId: notebookId(doc) }, "Running all cells");

  await vscode.commands.executeCommand(
    "notebook.execute",
    doc.uri,
  );

  // Return pending results for all code cells
  const results: ExecutionResult[] = [];
  for (let i = 0; i < doc.cellCount; i++) {
    const cell = doc.cellAt(i);
    if (cell.kind === vscode.NotebookCellKind.Code) {
      results.push({
        cellId: cellId(cell),
        status: "pending",
        executionCount: null,
        outputs: [],
        durationMs: null,
        error: null,
      });
    }
  }

  return results;
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
 * Wait for a cell execution to complete by polling.
 */
async function waitForCellCompletion(
  doc: vscode.NotebookDocument,
  cellIndex: number,
  startTime: number,
  timeoutMs: number,
): Promise<ExecutionResult> {
  const cell = doc.cellAt(cellIndex);
  const deadline = startTime + timeoutMs;
  const pollInterval = 500;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    // Check if the cell has completed execution
    const currentCell = doc.cellAt(cellIndex);
    if (currentCell.executionSummary?.executionOrder !== undefined) {
      const outputs = getCellOutputs(currentCell);
      const hasError = currentCell.executionSummary.success === false;
      const durationMs = Date.now() - startTime;

      return {
        cellId: cellId(currentCell),
        status: hasError ? "failed" : "succeeded",
        executionCount: currentCell.executionSummary.executionOrder ?? null,
        outputs,
        durationMs,
        error: hasError
          ? extractErrorMessage(outputs)
          : null,
      };
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
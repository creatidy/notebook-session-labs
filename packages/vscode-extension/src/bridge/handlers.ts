/**
 * JSON-RPC request handlers for the local bridge.
 *
 * Each handler corresponds to a bridge method and delegates to the
 * notebookService. Handlers never touch VS Code APIs directly.
 */
import {
  BRIDGE_METHODS,
  ErrorCode,
  createJsonRpcError,
  createJsonRpcResult,
  JsonRpcRequestSchema,
} from "@notebook-session-labs/shared";
import type { BridgeMethod } from "@notebook-session-labs/shared";
import * as notebookService from "../notebookService.js";
import { getLogger } from "../utils/logger.js";

const log = getLogger();

/**
 * Route a parsed JSON-RPC request to the appropriate handler.
 */
export async function handleRequest(
  body: unknown,
  maxOutputSize: number,
  includeImages: boolean,
): Promise<unknown> {
  // Validate the request structure
  const parseResult = JsonRpcRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return createJsonRpcError(
      null,
      ErrorCode.INVALID_REQUEST,
      "Invalid JSON-RPC request",
      parseResult.error.issues,
    );
  }

  const { id, method, params } = parseResult.data;
  const requestId = id ?? null;

  log.debug({ requestId, method }, "Handling bridge request");

  try {
    if (!isKnownMethod(method)) {
      return createJsonRpcError(
        requestId,
        ErrorCode.METHOD_NOT_FOUND,
        `Method not found: ${method}`,
      );
    }

    const result = await dispatch(method as BridgeMethod, params ?? {}, maxOutputSize, includeImages);
    return createJsonRpcResult(requestId, result);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error({ err, method, requestId }, "Handler error");
    return createJsonRpcError(requestId, ErrorCode.INTERNAL_ERROR, error);
  }
}

/**
 * Check if a method name is recognized.
 */
function isKnownMethod(method: string): boolean {
  return Object.values(BRIDGE_METHODS).includes(method as BridgeMethod);
}

/**
 * Dispatch to the appropriate handler.
 */
async function dispatch(
  method: BridgeMethod,
  params: Record<string, unknown>,
  maxOutputSize: number,
  includeImages: boolean,
): Promise<unknown> {
  switch (method) {
    // ── Session / Discovery ──
    case BRIDGE_METHODS.HEALTH_CHECK:
      return handleHealthCheck();

    case BRIDGE_METHODS.GET_ACTIVE_NOTEBOOK:
      return handleGetActiveNotebook();

    case BRIDGE_METHODS.LIST_OPEN_NOTEBOOKS:
      return handleListOpenNotebooks();

    case BRIDGE_METHODS.LIST_CELLS:
      return handleListCells(params);

    case BRIDGE_METHODS.READ_NOTEBOOK:
      return handleReadNotebook(params, maxOutputSize, includeImages);

    case BRIDGE_METHODS.READ_CELL:
      return handleReadCell(params, maxOutputSize, includeImages);

    case BRIDGE_METHODS.READ_CELL_OUTPUT:
      return handleReadCellOutput(params, maxOutputSize, includeImages);

    case BRIDGE_METHODS.GET_SELECTION:
      return handleGetSelection();

    // ── Editing ──
    case BRIDGE_METHODS.INSERT_CELL:
      return handleInsertCell(params);

    case BRIDGE_METHODS.REPLACE_CELL:
      return handleReplaceCell(params);

    case BRIDGE_METHODS.EDIT_CELL_SOURCE:
      return handleEditCellSource(params);

    case BRIDGE_METHODS.DELETE_CELL:
      return handleDeleteCell(params);

    case BRIDGE_METHODS.MOVE_CELL:
      return handleMoveCell(params);

    case BRIDGE_METHODS.CLEAR_CELL_OUTPUTS:
      return handleClearCellOutputs(params);

    case BRIDGE_METHODS.CLEAR_ALL_OUTPUTS:
      return handleClearAllOutputs(params);

    // ── Execution ──
    case BRIDGE_METHODS.EXECUTE_CELL:
      return handleExecuteCell(params);

    case BRIDGE_METHODS.RUN_ALL_CELLS:
      return handleRunAllCells(params);

    case BRIDGE_METHODS.CANCEL_EXECUTION:
      return handleCancelExecution(params);

    // ── Utility ──
    case BRIDGE_METHODS.SAVE_NOTEBOOK:
      return handleSaveNotebook(params);

    default:
      throw new Error(`Unhandled method: ${method}`);
  }
}

// ── Session / Discovery handlers ──

function handleHealthCheck() {
  return {
    status: "ok" as const,
    protocolVersion: "1.0.0",
    uptime: process.uptime(),
    activeNotebooks: notebookService.listOpenNotebooks().length,
  };
}

function handleGetActiveNotebook() {
  const doc = notebookService.getActiveNotebook();
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NO_ACTIVE_NOTEBOOK,
      "No active notebook",
    );
  }
  return notebookService.getNotebookSummary(doc);
}

function handleListOpenNotebooks() {
  return notebookService
    .listOpenNotebooks()
    .map((doc) => notebookService.getNotebookSummary(doc));
}

function handleListCells(params: Record<string, unknown>) {
  const notebookId = params.notebookId as string | undefined;
  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  return doc
    .getCells()
    .map((cell, index) => notebookService.getCellSummary(cell, index));
}

async function handleReadNotebook(
  params: Record<string, unknown>,
  maxOutputSize: number,
  includeImages: boolean,
) {
  const notebookId = params.notebookId as string | undefined;
  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  return notebookService.getNotebookDetail(doc, maxOutputSize, includeImages);
}

function handleReadCell(
  params: Record<string, unknown>,
  maxOutputSize: number,
  includeImages: boolean,
) {
  const cellIndex = params.cellIndex as number;
  const notebookId = params.notebookId as string | undefined;
  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  if (cellIndex < 0 || cellIndex >= doc.cellCount) {
    throw new BridgeHandlerError(
      ErrorCode.INVALID_CELL_INDEX,
      `Cell index ${cellIndex} out of range (0-${doc.cellCount - 1})`,
    );
  }
  const cell = doc.cellAt(cellIndex);
  return notebookService.getCellDetail(cell, cellIndex, maxOutputSize, includeImages);
}

function handleReadCellOutput(
  params: Record<string, unknown>,
  maxOutputSize: number,
  includeImages: boolean,
) {
  const cellIndex = params.cellIndex as number;
  const notebookId = params.notebookId as string | undefined;
  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  if (cellIndex < 0 || cellIndex >= doc.cellCount) {
    throw new BridgeHandlerError(
      ErrorCode.INVALID_CELL_INDEX,
      `Cell index ${cellIndex} out of range`,
    );
  }
  const cell = doc.cellAt(cellIndex);
  return {
    cellIndex,
    cellId: notebookService.cellId(cell),
    outputs: notebookService.getCellOutputs(cell, maxOutputSize, includeImages),
  };
}

function handleGetSelection() {
  const doc = notebookService.getActiveNotebook();
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NO_ACTIVE_NOTEBOOK,
      "No active notebook",
    );
  }
  return notebookService.getSelection(doc);
}

// ── Editing handlers ──

async function handleInsertCell(params: Record<string, unknown>) {
  const notebookId = params.notebookId as string | undefined;
  const index = params.index as number;
  const kind = (params.kind as "code" | "markdown") || "code";
  const source = (params.source as string) || "";
  const language = params.language as string | undefined;

  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  return notebookService.insertCell(doc, index, kind, source, language);
}

async function handleReplaceCell(params: Record<string, unknown>) {
  const notebookId = params.notebookId as string | undefined;
  const cellIndex = params.cellIndex as number;
  const source = params.source as string;
  const kind = params.kind as "code" | "markdown" | undefined;
  const language = params.language as string | undefined;

  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  return notebookService.replaceCell(doc, cellIndex, source, kind, language);
}

async function handleEditCellSource(params: Record<string, unknown>) {
  const notebookId = params.notebookId as string | undefined;
  const cellIndex = params.cellIndex as number;
  const source = params.source as string;

  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  return notebookService.editCellSource(doc, cellIndex, source);
}

async function handleDeleteCell(params: Record<string, unknown>) {
  const notebookId = params.notebookId as string | undefined;
  const cellIndex = params.cellIndex as number;

  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  await notebookService.deleteCell(doc, cellIndex);
  return { success: true, cellIndex };
}

async function handleMoveCell(params: Record<string, unknown>) {
  const notebookId = params.notebookId as string | undefined;
  const fromIndex = params.fromIndex as number;
  const toIndex = params.toIndex as number;

  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  return notebookService.moveCell(doc, fromIndex, toIndex);
}

// ── Execution handlers ──

async function handleExecuteCell(params: Record<string, unknown>) {
  const notebookId = params.notebookId as string | undefined;
  const cellIndex = params.cellIndex as number;
  const timeoutMs = params.timeoutMs as number | undefined;
  const waitForCompletion = (params.waitForCompletion as boolean) ?? true;

  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  return notebookService.executeCell(doc, cellIndex, timeoutMs, waitForCompletion);
}

async function handleRunAllCells(params: Record<string, unknown>) {
  const notebookId = params.notebookId as string | undefined;
  const timeoutMs = params.timeoutMs as number | undefined;

  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  return notebookService.runAllCells(doc, timeoutMs);
}

async function handleCancelExecution(params: Record<string, unknown>) {
  const notebookId = params.notebookId as string | undefined;
  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  await notebookService.cancelExecution(doc);
  return { success: true };
}

async function handleSaveNotebook(params: Record<string, unknown>) {
  const notebookId = params.notebookId as string | undefined;
  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  const saved = await notebookService.saveNotebook(doc);
  return { success: saved };
}

async function handleClearCellOutputs(params: Record<string, unknown>) {
  const notebookId = params.notebookId as string | undefined;
  const cellIndex = params.cellIndex as number;

  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  return notebookService.clearCellOutputs(doc, cellIndex);
}

async function handleClearAllOutputs(params: Record<string, unknown>) {
  const notebookId = params.notebookId as string | undefined;

  const doc = notebookService.resolveNotebook(notebookId);
  if (!doc) {
    throw new BridgeHandlerError(
      ErrorCode.NOTEBOOK_NOT_FOUND,
      notebookId
        ? `Notebook not found: ${notebookId}`
        : "No active notebook",
    );
  }
  return notebookService.clearAllOutputs(doc);
}

// ── Error class ──

class BridgeHandlerError extends Error {
  public readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "BridgeHandlerError";
    this.code = code;
  }
}
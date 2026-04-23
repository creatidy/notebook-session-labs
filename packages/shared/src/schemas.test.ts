/**
 * Unit tests for shared schemas and validation.
 */
import { describe, it, expect } from "vitest";
import {
  JsonRpcRequestSchema,
  NotebookSummarySchema,
  CellSummarySchema,
  CellDetailSchema,
  CellOutputSchema,
  OutputItemSchema,
  SelectionStateSchema,
  ExecutionResultSchema,
} from "./schemas.js";
import {
  createJsonRpcResult,
  createJsonRpcError,
  ErrorCode,
} from "./errors.js";
import {
  BRIDGE_METHODS,
  DEFAULT_MAX_OUTPUT_SIZE,
  MAX_OUTPUT_ITEMS_PER_CELL,
  TRUNCATION_MARKER,
  DEFAULT_BRIDGE_AUTH_MODE,
  type BridgeMethod,
} from "./constants.js";

function isKnownBridgeMethod(method: string): boolean {
  return Object.values(BRIDGE_METHODS).includes(method as BridgeMethod);
}

describe("JsonRpcRequestSchema", () => {
  it("accepts a valid JSON-RPC request", () => {
    const result = JsonRpcRequestSchema.safeParse({
      jsonrpc: "2.0",
      id: 1,
      method: "health_check",
      params: {},
    });
    expect(result.success).toBe(true);
  });

  it("accepts a request without params", () => {
    const result = JsonRpcRequestSchema.safeParse({
      jsonrpc: "2.0",
      id: "abc",
      method: "health_check",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a request without id", () => {
    const result = JsonRpcRequestSchema.safeParse({
      jsonrpc: "2.0",
      method: "health_check",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a request without jsonrpc version", () => {
    const result = JsonRpcRequestSchema.safeParse({
      id: 1,
      method: "health_check",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a request with wrong jsonrpc version", () => {
    const result = JsonRpcRequestSchema.safeParse({
      jsonrpc: "1.0",
      id: 1,
      method: "health_check",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a request without method", () => {
    const result = JsonRpcRequestSchema.safeParse({
      jsonrpc: "2.0",
      id: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("NotebookSummarySchema", () => {
  it("accepts a valid notebook summary", () => {
    const result = NotebookSummarySchema.safeParse({
      id: "abc123",
      uri: "file:///test.ipynb",
      fileName: "test.ipynb",
      cellCount: 3,
      kernelStatus: "idle",
      isDirty: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a summary without required fields", () => {
    const result = NotebookSummarySchema.safeParse({
      id: "abc123",
    });
    expect(result.success).toBe(false);
  });
});

describe("CellSummarySchema", () => {
  it("accepts a valid cell summary", () => {
    const result = CellSummarySchema.safeParse({
      index: 0,
      id: "cell1",
      kind: "code",
      sourcePreview: "print('hello')",
      executionCount: 1,
      executionStatus: "idle",
      hasOutput: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a markdown cell", () => {
    const result = CellSummarySchema.safeParse({
      index: 1,
      id: "cell2",
      kind: "markdown",
      sourcePreview: "# Title",
      executionCount: null,
      executionStatus: "idle",
      hasOutput: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("CellDetailSchema", () => {
  it("accepts a valid cell detail", () => {
    const result = CellDetailSchema.safeParse({
      index: 0,
      id: "cell1",
      kind: "code",
      source: "print('hello')",
      executionCount: 1,
      executionStatus: "idle",
      outputs: [],
      metadata: {},
      language: "python",
    });
    expect(result.success).toBe(true);
  });
});

describe("OutputItemSchema", () => {
  it("accepts a text output item", () => {
    const result = OutputItemSchema.safeParse({
      mime: "text/plain",
      data: "hello world",
      truncated: false,
      originalSize: 11,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a truncated output item", () => {
    const result = OutputItemSchema.safeParse({
      mime: "text/plain",
      data: "hel..." + TRUNCATION_MARKER,
      truncated: true,
      originalSize: 10000,
    });
    expect(result.success).toBe(true);
  });
});

describe("CellOutputSchema", () => {
  it("accepts a valid cell output", () => {
    const result = CellOutputSchema.safeParse({
      id: "out1",
      outputKind: "display_data",
      items: [
        { mime: "text/plain", data: "result", truncated: false, originalSize: 6 },
      ],
      metadata: {},
    });
    expect(result.success).toBe(true);
  });
});

describe("SelectionStateSchema", () => {
  it("accepts a selection state with selection", () => {
    const result = SelectionStateSchema.safeParse({
      notebookId: "nb1",
      selectedCellIndex: 0,
      selectedCellRange: [0, 2],
      focusedCellId: "cell1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a selection state without selection", () => {
    const result = SelectionStateSchema.safeParse({
      notebookId: "nb1",
      selectedCellIndex: null,
      selectedCellRange: null,
      focusedCellId: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("ExecutionResultSchema", () => {
  it("accepts a succeeded result", () => {
    const result = ExecutionResultSchema.safeParse({
      cellId: "cell1",
      status: "succeeded",
      executionCount: 1,
      outputs: [],
      durationMs: 500,
      error: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a pending result", () => {
    const result = ExecutionResultSchema.safeParse({
      cellId: "cell1",
      status: "pending",
      executionCount: null,
      outputs: [],
      durationMs: null,
      error: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a failed result", () => {
    const result = ExecutionResultSchema.safeParse({
      cellId: "cell1",
      status: "failed",
      executionCount: 1,
      outputs: [],
      durationMs: 1000,
      error: "SyntaxError: invalid syntax",
    });
    expect(result.success).toBe(true);
  });
});

describe("createJsonRpcResult", () => {
  it("creates a valid JSON-RPC success response", () => {
    const result = createJsonRpcResult(1, { status: "ok" });
    expect(result).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { status: "ok" },
    });
  });

  it("handles null id", () => {
    const result = createJsonRpcResult(null, {});
    expect(result.id).toBeNull();
  });
});

describe("createJsonRpcError", () => {
  it("creates a valid JSON-RPC error response", () => {
    const result = createJsonRpcError(1, ErrorCode.INTERNAL_ERROR, "test error");
    expect(result).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "test error",
      },
    });
  });

  it("includes data when provided", () => {
    const result = createJsonRpcError(1, ErrorCode.INVALID_REQUEST, "bad", ["extra"]);
    expect(result.error.data).toEqual(["extra"]);
  });
});

describe("BRIDGE_METHODS", () => {
  it("contains all expected methods", () => {
    const expected = [
      "HEALTH_CHECK",
      "GET_ACTIVE_NOTEBOOK",
      "LIST_OPEN_NOTEBOOKS",
      "LIST_CELLS",
      "READ_NOTEBOOK",
      "READ_CELL",
      "READ_CELL_OUTPUT",
      "GET_SELECTION",
      "INSERT_CELL",
      "REPLACE_CELL",
      "EDIT_CELL_SOURCE",
      "DELETE_CELL",
      "MOVE_CELL",
      "EXECUTE_CELL",
      "RUN_ALL_CELLS",
      "CANCEL_EXECUTION",
      "SAVE_NOTEBOOK",
    ];
    for (const method of expected) {
      expect(BRIDGE_METHODS).toHaveProperty(method);
    }
  });
});

describe("isKnownBridgeMethod", () => {
  it("returns true for known methods", () => {
    expect(isKnownBridgeMethod("health_check")).toBe(true);
    expect(isKnownBridgeMethod("get_active_notebook")).toBe(true);
    expect(isKnownBridgeMethod("execute_cell")).toBe(true);
  });

  it("returns false for unknown methods", () => {
    expect(isKnownBridgeMethod("unknown_method")).toBe(false);
    expect(isKnownBridgeMethod("")).toBe(false);
  });
});

describe("Constants", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_MAX_OUTPUT_SIZE).toBeGreaterThan(0);
    expect(MAX_OUTPUT_ITEMS_PER_CELL).toBeGreaterThan(0);
    expect(TRUNCATION_MARKER).toContain("truncated");
  });

  it("defaults bridge auth mode to none", () => {
    expect(DEFAULT_BRIDGE_AUTH_MODE).toBe("none");
  });
});

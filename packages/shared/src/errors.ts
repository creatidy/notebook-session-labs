/**
 * Structured error types for Notebook Session Labs.
 * All errors include a machine-readable code and a human-readable message.
 */

/** Standard error codes used across bridge and MCP boundaries */
export enum ErrorCode {
  // General
  INTERNAL_ERROR = -32603,
  INVALID_PARAMS = -32602,
  METHOD_NOT_FOUND = -32601,
  INVALID_REQUEST = -32600,
  SERVER_ERROR = -32000,

  // Notebook domain
  NO_ACTIVE_NOTEBOOK = 4001,
  NOTEBOOK_NOT_FOUND = 4002,
  CELL_NOT_FOUND = 4003,
  INVALID_CELL_INDEX = 4004,
  INVALID_CELL_KIND = 4005,

  // Execution
  EXECUTION_FAILED = 5001,
  EXECUTION_TIMEOUT = 5002,
  EXECUTION_CANCELLED = 5003,
  KERNEL_NOT_AVAILABLE = 5004,

  // Bridge
  BRIDGE_NOT_CONNECTED = 6001,
  BRIDGE_AUTH_FAILED = 6002,
  BRIDGE_UNAVAILABLE = 6003,
}

/** Structured error payload */
export interface BridgeError {
  code: ErrorCode;
  message: string;
  data?: unknown;
}

/** Custom error class for bridge errors */
export class NotebookSessionError extends Error {
  public readonly code: ErrorCode;
  public readonly data?: unknown;

  constructor(code: ErrorCode, message: string, data?: unknown) {
    super(message);
    this.name = "NotebookSessionError";
    this.code = code;
    this.data = data;
  }

  toJSON(): BridgeError {
    return {
      code: this.code,
      message: this.message,
      ...(this.data !== undefined && { data: this.data }),
    };
  }
}

/** Helper to create a JSON-RPC error response */
export function createJsonRpcError(
  id: string | number | null,
  code: ErrorCode,
  message: string,
  data?: unknown,
) {
  return {
    jsonrpc: "2.0" as const,
    id,
    error: { code, message, ...(data !== undefined && { data }) },
  };
}

/** Helper to create a successful JSON-RPC response */
export function createJsonRpcResult(
  id: string | number | null,
  result: unknown,
) {
  return {
    jsonrpc: "2.0" as const,
    id,
    result,
  };
}
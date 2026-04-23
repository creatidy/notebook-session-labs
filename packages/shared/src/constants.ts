/**
 * Protocol and configuration constants for Notebook Session Labs.
 */

/** Bridge protocol version */
export const BRIDGE_PROTOCOL_VERSION = "1.0.0";

/** Default bridge host (loopback only) */
export const DEFAULT_BRIDGE_HOST = "127.0.0.1";

/** Default bridge port (0 = ephemeral) */
export const DEFAULT_BRIDGE_PORT = 0;

/** Default bridge auth mode (no token required for local loopback) */
export const DEFAULT_BRIDGE_AUTH_MODE = "none" as const;

/** JSON-RPC version string */
export const JSON_RPC_VERSION = "2.0";

/** Default request timeout in milliseconds */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Default max output size in bytes */
export const DEFAULT_MAX_OUTPUT_SIZE = 100_000;

/** Default cell execution timeout in milliseconds */
export const DEFAULT_EXECUTION_TIMEOUT_MS = 60_000;

/** Default polling interval for execution status in milliseconds */
export const DEFAULT_POLL_INTERVAL_MS = 500;

/** Maximum number of output items to return per cell */
export const MAX_OUTPUT_ITEMS_PER_CELL = 100;

/** Truncation marker appended to truncated outputs */
export const TRUNCATION_MARKER = "\n... [truncated]";

/** Supported cell types */
export const CELL_TYPES = ["code", "markdown"] as const;

/** Supported output mime types */
export const SUPPORTED_OUTPUT_MIMES = [
  "text/plain",
  "text/markdown",
  "application/json",
  "image/png",
  "image/jpeg",
  "text/html",
  // VS Code internal MIME types (decoded as text/plain by the extension)
  "application/vnd.code.notebook.stdout",
  "application/vnd.code.notebook.stderr",
  "application/vnd.code.notebook.error",
] as const;

/** Bridge method names */
export const BRIDGE_METHODS = {
  // Session / Discovery
  GET_ACTIVE_NOTEBOOK: "get_active_notebook",
  LIST_OPEN_NOTEBOOKS: "list_open_notebooks",
  LIST_CELLS: "list_cells",
  READ_NOTEBOOK: "read_notebook",
  READ_CELL: "read_cell",
  READ_CELL_OUTPUT: "read_cell_output",
  GET_SELECTION: "get_selection",

  // Editing
  INSERT_CELL: "insert_cell",
  REPLACE_CELL: "replace_cell",
  EDIT_CELL_SOURCE: "edit_cell_source",
  DELETE_CELL: "delete_cell",
  MOVE_CELL: "move_cell",
  CLEAR_CELL_OUTPUTS: "clear_cell_outputs",
  CLEAR_ALL_OUTPUTS: "clear_all_outputs",

  // Execution
  EXECUTE_CELL: "execute_cell",
  RUN_ALL_CELLS: "run_all_cells",
  CANCEL_EXECUTION: "cancel_execution",

  // Utility
  HEALTH_CHECK: "health_check",
  SAVE_NOTEBOOK: "save_notebook",
} as const;

export type BridgeMethod = (typeof BRIDGE_METHODS)[keyof typeof BRIDGE_METHODS];
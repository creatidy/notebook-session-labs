/**
 * Core TypeScript types for Notebook Session Labs.
 * These types represent the domain model independent of transport or API.
 */

/** Unique identifier for a notebook within the session */
export type NotebookId = string;

/** Unique identifier for a cell within a notebook */
export type CellId = string;

/** Cell kind: code or markdown */
export type CellKind = "code" | "markdown";

/** Execution status of a cell */
export type CellExecutionStatus =
  | "idle"
  | "pending"
  | "executing"
  | "succeeded"
  | "failed"
  | "cancelled";

/** Summary of a notebook */
export interface NotebookSummary {
  id: NotebookId;
  uri: string;
  fileName: string;
  cellCount: number;
  kernelStatus: string;
  isDirty: boolean;
}

/** Detailed notebook information */
export interface NotebookDetail {
  id: NotebookId;
  uri: string;
  fileName: string;
  isDirty: boolean;
  kernelStatus: string;
  kernelDisplayName: string;
  cells: CellSummary[];
  metadata: Record<string, unknown>;
}

/** Summary of a single cell */
export interface CellSummary {
  index: number;
  id: CellId;
  kind: CellKind;
  sourcePreview: string;
  executionCount: number | null;
  executionStatus: CellExecutionStatus;
  hasOutput: boolean;
}

/** Detailed cell information including full source and outputs */
export interface CellDetail {
  index: number;
  id: CellId;
  kind: CellKind;
  source: string;
  executionCount: number | null;
  executionStatus: CellExecutionStatus;
  outputs: CellOutput[];
  metadata: Record<string, unknown>;
  language: string;
}

/** Cell output item */
export interface CellOutput {
  id: string;
  outputKind: "success" | "error" | "display_data" | "execute_result" | "stream";
  items: OutputItem[];
  metadata: Record<string, unknown>;
}

/** Single output item with mime type */
export interface OutputItem {
  mime: string;
  data: string;
  truncated: boolean;
  originalSize: number;
}

/** Current selection state in a notebook */
export interface SelectionState {
  notebookId: NotebookId;
  selectedCellIndex: number | null;
  selectedCellRange: [number, number] | null;
  focusedCellId: CellId | null;
}

/** Result of a cell execution */
export interface ExecutionResult {
  cellId: CellId;
  status: CellExecutionStatus;
  executionCount: number | null;
  outputs: CellOutput[];
  durationMs: number | null;
  error: string | null;
}

/**
 * Bridge authentication mode.
 *
 * **Security note:** Token authentication is always enforced at the bridge
 * server level. The "none" value is accepted for backward compatibility but
 * is silently upgraded to "token" — a 256-bit ephemeral bearer token is
 * generated at startup and written to the port file for MCP client discovery.
 */
export type BridgeAuthMode = "none" | "token";

/** Bridge configuration */
export interface BridgeConfig {
  host: string;
  port: number;
  authMode: BridgeAuthMode;
  /** Ephemeral bearer token — always populated at runtime */
  token?: string;
  enabled: boolean;
}

/** MCP server configuration */
export interface McpServerConfig {
  bridgeUrl: string;
  /** Bearer token — auto-discovered from port file or set via NSL_BRIDGE_TOKEN */
  bridgeToken?: string;
  authMode: BridgeAuthMode;
  requestTimeoutMs: number;
  maxOutputSize: number;
  includeImages: boolean;
  logLevel: string;
}

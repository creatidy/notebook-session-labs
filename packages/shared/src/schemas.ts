/**
 * Zod schemas for all API boundary validation.
 * These schemas validate data at the bridge and MCP server boundaries.
 */
import { z } from "zod";
import {
  BRIDGE_PROTOCOL_VERSION,
  SUPPORTED_OUTPUT_MIMES,
} from "./constants.js";

// ── Primitive schemas ──

export const NotebookIdSchema = z.string().min(1);
export const CellIdSchema = z.string().min(1);
export const CellKindSchema = z.enum(["code", "markdown"]);
export const CellExecutionStatusSchema = z.enum([
  "idle",
  "pending",
  "executing",
  "succeeded",
  "failed",
  "cancelled",
]);

// ── Output schemas ──

export const OutputItemSchema = z.object({
  mime: z.enum(SUPPORTED_OUTPUT_MIMES),
  data: z.string(),
  truncated: z.boolean(),
  originalSize: z.number().nonnegative(),
});

export const CellOutputSchema = z.object({
  id: z.string(),
  outputKind: z.enum([
    "success",
    "error",
    "display_data",
    "execute_result",
    "stream",
  ]),
  items: z.array(OutputItemSchema),
  metadata: z.record(z.unknown()),
});

// ── Notebook schemas ──

export const NotebookSummarySchema = z.object({
  id: NotebookIdSchema,
  uri: z.string().min(1),
  fileName: z.string().min(1),
  cellCount: z.number().int().nonnegative(),
  kernelStatus: z.string(),
  isDirty: z.boolean(),
});

export const CellSummarySchema = z.object({
  index: z.number().int().nonnegative(),
  id: CellIdSchema,
  kind: CellKindSchema,
  sourcePreview: z.string(),
  executionCount: z.number().int().nonnegative().nullable(),
  executionStatus: CellExecutionStatusSchema,
  hasOutput: z.boolean(),
});

export const CellDetailSchema = z.object({
  index: z.number().int().nonnegative(),
  id: CellIdSchema,
  kind: CellKindSchema,
  source: z.string(),
  executionCount: z.number().int().nonnegative().nullable(),
  executionStatus: CellExecutionStatusSchema,
  outputs: z.array(CellOutputSchema),
  metadata: z.record(z.unknown()),
  language: z.string(),
});

export const NotebookDetailSchema = z.object({
  id: NotebookIdSchema,
  uri: z.string().min(1),
  fileName: z.string().min(1),
  isDirty: z.boolean(),
  kernelStatus: z.string(),
  kernelDisplayName: z.string(),
  cells: z.array(CellSummarySchema),
  metadata: z.record(z.unknown()),
});

// ── Selection schema ──

export const SelectionStateSchema = z.object({
  notebookId: NotebookIdSchema,
  selectedCellIndex: z.number().int().nonnegative().nullable(),
  selectedCellRange: z
    .tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
    .nullable(),
  focusedCellId: CellIdSchema.nullable(),
});

// ── Execution schemas ──

export const ExecutionResultSchema = z.object({
  cellId: CellIdSchema,
  status: CellExecutionStatusSchema,
  executionCount: z.number().int().nonnegative().nullable(),
  outputs: z.array(CellOutputSchema),
  durationMs: z.number().nonnegative().nullable(),
  error: z.string().nullable(),
});

// ── JSON-RPC schemas ──

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

export const JsonRpcErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.unknown().optional(),
  error: JsonRpcErrorSchema.optional(),
});

// ── Tool parameter schemas (MCP input) ──

export const GetActiveNotebookParamsSchema = z.object({});

export const ListOpenNotebooksParamsSchema = z.object({});

export const ListCellsParamsSchema = z.object({
  notebookId: NotebookIdSchema.optional(),
});

export const ReadNotebookParamsSchema = z.object({
  notebookId: NotebookIdSchema.optional(),
});

export const ReadCellParamsSchema = z.object({
  cellIndex: z.number().int().nonnegative().optional(),
  cellId: CellIdSchema.optional(),
  notebookId: NotebookIdSchema.optional(),
});

export const ReadCellOutputParamsSchema = z.object({
  cellIndex: z.number().int().nonnegative().optional(),
  cellId: CellIdSchema.optional(),
  notebookId: NotebookIdSchema.optional(),
});

export const GetSelectionParamsSchema = z.object({});

export const InsertCellParamsSchema = z.object({
  notebookId: NotebookIdSchema.optional(),
  index: z.number().int().nonnegative(),
  kind: CellKindSchema.default("code"),
  source: z.string().default(""),
  language: z.string().optional(),
});

export const ReplaceCellParamsSchema = z.object({
  notebookId: NotebookIdSchema.optional(),
  cellIndex: z.number().int().nonnegative().optional(),
  cellId: CellIdSchema.optional(),
  source: z.string(),
  kind: CellKindSchema.optional(),
  language: z.string().optional(),
});

export const EditCellSourceParamsSchema = z.object({
  notebookId: NotebookIdSchema.optional(),
  cellIndex: z.number().int().nonnegative().optional(),
  cellId: CellIdSchema.optional(),
  source: z.string(),
});

export const DeleteCellParamsSchema = z.object({
  notebookId: NotebookIdSchema.optional(),
  cellIndex: z.number().int().nonnegative().optional(),
  cellId: CellIdSchema.optional(),
});

export const MoveCellParamsSchema = z.object({
  notebookId: NotebookIdSchema.optional(),
  fromIndex: z.number().int().nonnegative(),
  toIndex: z.number().int().nonnegative(),
});

export const ExecuteCellParamsSchema = z.object({
  notebookId: NotebookIdSchema.optional(),
  cellIndex: z.number().int().nonnegative().optional(),
  cellId: CellIdSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
  waitForCompletion: z.boolean().default(true),
});

export const RunAllCellsParamsSchema = z.object({
  notebookId: NotebookIdSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const CancelExecutionParamsSchema = z.object({
  notebookId: NotebookIdSchema.optional(),
});

export const SaveNotebookParamsSchema = z.object({
  notebookId: NotebookIdSchema.optional(),
});

export const ClearCellOutputsParamsSchema = z.object({
  cellIndex: z.number().int().nonnegative().optional(),
  cellId: CellIdSchema.optional(),
  notebookId: NotebookIdSchema.optional(),
});

export const ClearAllOutputsParamsSchema = z.object({
  notebookId: NotebookIdSchema.optional(),
});

// ── Health check response ──

export const HealthCheckResponseSchema = z.object({
  status: z.literal("ok"),
  protocolVersion: z.literal(BRIDGE_PROTOCOL_VERSION),
  uptime: z.number().nonnegative(),
  activeNotebooks: z.number().int().nonnegative(),
});
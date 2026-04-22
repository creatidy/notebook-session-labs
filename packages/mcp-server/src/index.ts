/**
 * Notebook Session Labs - MCP Server
 *
 * Entry point for the MCP server that bridges to the VS Code extension
 * for live notebook session interaction.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  BRIDGE_METHODS,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "@notebook-session-labs/shared";
import { callBridge, checkHealth, type BridgeClientConfig } from "./client.js";
import pino, { type Logger } from "pino";

// ── Configuration ──

function getConfig(): BridgeClientConfig {
  const host = process.env.NSL_BRIDGE_HOST || "127.0.0.1";
  const port = parseInt(process.env.NSL_BRIDGE_PORT || "0", 10);
  const token = process.env.NSL_BRIDGE_TOKEN || "";
  const timeoutMs = parseInt(
    process.env.NSL_REQUEST_TIMEOUT || String(DEFAULT_REQUEST_TIMEOUT_MS),
    10,
  );

  if (!token) {
    console.error(
      "ERROR: NSL_BRIDGE_TOKEN environment variable is required. " +
      "Start the VS Code extension bridge first and copy the token.",
    );
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }

  if (!port) {
    console.error(
      "ERROR: NSL_BRIDGE_PORT environment variable is required. " +
      "Start the VS Code extension bridge first and copy the port.",
    );
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }

  return { host, port, token, timeoutMs };
}

const config = getConfig();

const logger: Logger = pino({
  name: "notebook-session-labs-mcp",
  level: process.env.NSL_LOG_LEVEL || "info",
});

// ── MCP Server ──

const server = new McpServer({
  name: "notebook-session-labs",
  version: "0.1.0",
});

// Helper to call the bridge with config
function bridge(method: keyof typeof BRIDGE_METHODS, params?: Record<string, unknown>) {
  return callBridge(config, BRIDGE_METHODS[method], params, logger);
}

// Helper to format result as text content
function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// ── Reusable Zod shapes ──

const NotebookIdParam = z.string().min(1).optional().describe(
  "Notebook ID (uses active notebook if omitted)",
);

const CellIndexParam = z.number().int().nonnegative().describe(
  "Zero-based index of the cell",
);

// ── Session / Discovery Tools ──

server.tool("get_active_notebook", "Get information about the currently active notebook in VS Code", {}, async () => {
  return textResult(await bridge("GET_ACTIVE_NOTEBOOK"));
});

server.tool("list_open_notebooks", "List all notebooks currently open in VS Code", {}, async () => {
  return textResult(await bridge("LIST_OPEN_NOTEBOOKS"));
});

server.tool("list_cells", "List all cells in the active or specified notebook", {
  notebookId: NotebookIdParam,
}, async ({ notebookId }) => {
  return textResult(await bridge("LIST_CELLS", { notebookId }));
});

server.tool("read_notebook", "Read full details of the active or specified notebook including all cells", {
  notebookId: NotebookIdParam,
}, async ({ notebookId }) => {
  return textResult(await bridge("READ_NOTEBOOK", { notebookId }));
});

server.tool("read_cell", "Read the full source and metadata of a specific cell", {
  cellIndex: CellIndexParam,
  notebookId: NotebookIdParam,
}, async ({ cellIndex, notebookId }) => {
  return textResult(await bridge("READ_CELL", { cellIndex, notebookId }));
});

server.tool("read_cell_output", "Read the outputs of a specific cell", {
  cellIndex: CellIndexParam,
  notebookId: NotebookIdParam,
}, async ({ cellIndex, notebookId }) => {
  return textResult(await bridge("READ_CELL_OUTPUT", { cellIndex, notebookId }));
});

server.tool("get_selection", "Get the current cell selection state in the active notebook", {}, async () => {
  return textResult(await bridge("GET_SELECTION"));
});

// ── Editing Tools ──

server.tool("insert_cell", "Insert a new cell at the specified index", {
  index: z.number().int().nonnegative().describe("Zero-based position to insert the cell"),
  kind: z.enum(["code", "markdown"]).default("code").describe("Cell type"),
  source: z.string().default("").describe("Cell source content"),
  language: z.string().optional().describe("Language for code cells (default: auto-detect)"),
  notebookId: NotebookIdParam,
}, async ({ index, kind, source, language, notebookId }) => {
  return textResult(await bridge("INSERT_CELL", { index, kind, source, language, notebookId }));
});

server.tool("replace_cell", "Replace a cell's content entirely", {
  cellIndex: CellIndexParam.describe("Zero-based index of the cell to replace"),
  source: z.string().describe("New cell source content"),
  kind: z.enum(["code", "markdown"]).optional().describe("New cell type (default: keep current)"),
  language: z.string().optional().describe("Language for code cells"),
  notebookId: NotebookIdParam,
}, async ({ cellIndex, source, kind, language, notebookId }) => {
  return textResult(await bridge("REPLACE_CELL", { cellIndex, source, kind, language, notebookId }));
});

server.tool("edit_cell_source", "Edit the source text of an existing cell", {
  cellIndex: CellIndexParam,
  source: z.string().describe("New source text"),
  notebookId: NotebookIdParam,
}, async ({ cellIndex, source, notebookId }) => {
  return textResult(await bridge("EDIT_CELL_SOURCE", { cellIndex, source, notebookId }));
});

server.tool("delete_cell", "Delete a cell from the notebook", {
  cellIndex: CellIndexParam.describe("Zero-based index of the cell to delete"),
  notebookId: NotebookIdParam,
}, async ({ cellIndex, notebookId }) => {
  return textResult(await bridge("DELETE_CELL", { cellIndex, notebookId }));
});

server.tool("move_cell", "Move a cell from one position to another", {
  fromIndex: z.number().int().nonnegative().describe("Zero-based index of the cell to move"),
  toIndex: z.number().int().nonnegative().describe("Target zero-based index"),
  notebookId: NotebookIdParam,
}, async ({ fromIndex, toIndex, notebookId }) => {
  return textResult(await bridge("MOVE_CELL", { fromIndex, toIndex, notebookId }));
});

// ── Execution Tools ──

server.tool("execute_cell", "Execute a specific cell and optionally wait for completion", {
  cellIndex: CellIndexParam.describe("Zero-based index of the cell to execute"),
  waitForCompletion: z.boolean().default(true).describe("Wait for execution to complete"),
  timeoutMs: z.number().int().positive().optional().describe("Execution timeout in milliseconds"),
  notebookId: NotebookIdParam,
}, async ({ cellIndex, waitForCompletion, timeoutMs, notebookId }) => {
  return textResult(await bridge("EXECUTE_CELL", {
    cellIndex,
    waitForCompletion,
    timeoutMs,
    notebookId,
  }));
});

server.tool("run_all_cells", "Run all cells in the notebook", {
  notebookId: NotebookIdParam,
  timeoutMs: z.number().int().positive().optional().describe("Execution timeout in milliseconds"),
}, async ({ notebookId, timeoutMs }) => {
  return textResult(await bridge("RUN_ALL_CELLS", { notebookId, timeoutMs }));
});

server.tool("cancel_execution", "Cancel the current notebook execution", {
  notebookId: NotebookIdParam,
}, async ({ notebookId }) => {
  return textResult(await bridge("CANCEL_EXECUTION", { notebookId }));
});

// ── Utility Tools ──

server.tool("save_notebook", "Save the active or specified notebook", {
  notebookId: NotebookIdParam,
}, async ({ notebookId }) => {
  return textResult(await bridge("SAVE_NOTEBOOK", { notebookId }));
});

// ── Prompts ──

server.prompt("notebook-cite", "Produce a reference to a notebook cell in a consistent format", {
  cellIndex: z.number().int().nonnegative().describe("Cell index to cite"),
  notebookId: z.string().optional().describe("Notebook ID"),
}, async ({ cellIndex, notebookId }) => {
  try {
    const cellResult = await bridge("READ_CELL", { cellIndex, notebookId }) as Record<string, unknown>;
    const activeNb = await bridge("GET_ACTIVE_NOTEBOOK") as Record<string, unknown>;

    const citation = {
      notebook: activeNb.fileName ?? "unknown",
      cellIndex,
      cellKind: cellResult.kind ?? "unknown",
      executionCount: (cellResult.executionCount as number | null) ?? null,
      sourcePreview: typeof cellResult.source === "string" ? cellResult.source.slice(0, 100) + (cellResult.source.length > 100 ? "..." : "") : "",
    };

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Please reference notebook cell [${citation.notebook}#${citation.cellIndex}] (execution count: ${citation.executionCount ?? "N/A"}, kind: ${citation.cellKind}):\n\`\`\`\n${citation.sourcePreview}\n\`\`\``,
          },
        },
      ],
    };
  } catch (err) {
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Error generating citation: ${err instanceof Error ? err.message : String(err)}`,
          },
        },
      ],
    };
  }
});

server.prompt("notebook-review", "Review the structure, risky cells, failed outputs, and suggested edits for the active notebook", {}, async () => {
  try {
    const nb = await bridge("READ_NOTEBOOK") as Record<string, unknown>;
    const cells = (nb.cells as Record<string, unknown>[]) ?? [];
    const codeCells = cells.filter((c) => c.kind === "code");
    const failedCells = cells.filter((c) => c.executionStatus === "failed");
    const cellsWithOutput = cells.filter((c) => c.hasOutput);

    const summary = [
      `# Notebook Review: ${nb.fileName ?? "unknown"}`,
      ``,
      `- Total cells: ${cells.length}`,
      `- Code cells: ${codeCells.length}`,
      `- Markdown cells: ${cells.length - codeCells.length}`,
      `- Cells with output: ${cellsWithOutput.length}`,
      `- Failed cells: ${failedCells.length}`,
      `- Dirty: ${nb.isDirty ? "Yes" : "No"}`,
      ``,
    ];

    if (failedCells.length > 0) {
      summary.push(`## Failed Cells`);
      for (const cell of failedCells) {
        summary.push(
          `- Cell ${cell.index}: execution count ${cell.executionCount ?? "N/A"} - preview: ${String(cell.sourcePreview).slice(0, 80)}`,
        );
      }
      summary.push(``);
    }

    summary.push(`Please analyze this notebook for potential issues and suggest improvements.`);

    return {
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: summary.join("\n") },
        },
      ],
    };
  } catch (err) {
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Error reviewing notebook: ${err instanceof Error ? err.message : String(err)}`,
          },
        },
      ],
    };
  }
});

// ── Start ──

async function main(): Promise<void> {
  logger.info("Starting Notebook Session Labs MCP server");

  // Verify bridge connectivity
  const health = await checkHealth(config);
  if (!health.ok) {
    logger.warn({ message: health.message }, "Bridge health check failed on startup");
    console.error(
      `WARNING: Bridge health check failed: ${health.message}\n` +
      `Make sure the VS Code extension bridge is running.`,
    );
  } else {
    logger.info("Bridge health check passed");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");
}

main().catch((err) => {
  logger.fatal({ err }, "MCP server failed to start");
  console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

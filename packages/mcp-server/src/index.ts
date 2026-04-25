/**
 * Notebook Session Labs - MCP Server
 *
 * Entry point for the MCP server that bridges to the VS Code extension
 * for live notebook session interaction.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageVersion: string = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
).version;
import {
  BRIDGE_METHODS,
  BRIDGE_PORT_FILE_DIR,
  BRIDGE_PORT_FILE_PATTERN,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "@notebook-session-labs/shared";
import { callBridge, checkHealth, type BridgeClientConfig } from "./client.js";
import pino, { type Logger } from "pino";

// ── Configuration ──

/**
 * Try to discover the bridge port from PID-scoped port files.
 * Scans the state directory for bridge-<pid>.json files and returns
 * the most recently modified valid one.
 */
function readPortFile(): { port: number; host: string } | null {
  // Priority: NSL_STATE_DIR env → /tmp/notebook-session-labs (default)
  const stateDir = process.env.NSL_STATE_DIR || BRIDGE_PORT_FILE_DIR;

  if (!existsSync(stateDir)) {
    return null;
  }

  try {
    const entries = readdirSync(stateDir);
    let bestMatch: { port: number; host: string; mtimeMs: number } | null = null;

    for (const entry of entries) {
      if (!BRIDGE_PORT_FILE_PATTERN.test(entry)) {
        continue;
      }

      const filePath = join(stateDir, entry);
      try {
        const stat = statSync(filePath);
        const raw = readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw) as { port: number; host: string; pid: number; startedAt: string };

        if (typeof data.port === "number" && data.port > 0) {
          if (!bestMatch || stat.mtimeMs > bestMatch.mtimeMs) {
            bestMatch = { port: data.port, host: data.host || "127.0.0.1", mtimeMs: stat.mtimeMs };
          }
        }
      } catch {
        // Skip malformed files
      }
    }

    return bestMatch ? { port: bestMatch.port, host: bestMatch.host } : null;
  } catch {
    // Can't read directory
  }
  return null;
}

function buildConfig(portFile: { port: number; host: string } | null): BridgeClientConfig {
  const envPort = parseInt(process.env.NSL_BRIDGE_PORT || "0", 10);
  const host = process.env.NSL_BRIDGE_HOST || portFile?.host || "127.0.0.1";
  const port = envPort || portFile?.port || 0;
  const token = process.env.NSL_BRIDGE_TOKEN || undefined;
  const timeoutMs = parseInt(
    process.env.NSL_REQUEST_TIMEOUT || String(DEFAULT_REQUEST_TIMEOUT_MS),
    10,
  );
  return { host, port, token, timeoutMs };
}

function initConfig(): { config: BridgeClientConfig; portFileSource: string | null } {
  const envPort = parseInt(process.env.NSL_BRIDGE_PORT || "0", 10);
  const portFile = !envPort ? readPortFile() : null;
  const config = buildConfig(portFile);

  const portFileSource = portFile ? `port file (port=${portFile.port})` : null;

  if (config.port) {
    console.error(`NOTE: Bridge discovered at ${config.host}:${config.port}${portFileSource ? ` via ${portFileSource}` : ""}`);
  } else {
    console.error(
      "NOTE: Bridge not discovered yet. Port file not found and NSL_BRIDGE_PORT not set.\n" +
      "The MCP server will start and retry discovery when tools are called.\n" +
      "Open a notebook in VS Code to start the bridge.",
    );
  }

  if (config.token) {
    console.error("NOTE: NSL_BRIDGE_TOKEN is set. Using token authentication.");
  } else {
    console.error("NOTE: NSL_BRIDGE_TOKEN is not set. Connecting without token auth.");
  }

  return { config, portFileSource };
}

const { config: initialConfig, portFileSource } = initConfig();

/** Mutable config — updated on re-discovery */
let config = initialConfig;

const logger: Logger = pino({
  name: "notebook-session-labs-mcp",
  level: process.env.NSL_LOG_LEVEL || "info",
});

if (portFileSource) {
  logger.info({ source: portFileSource }, "Discovered bridge via port file");
}

/**
 * Re-discover the bridge port from port files.
 * Called when the current bridge connection fails.
 * Only re-discovers if NSL_BRIDGE_PORT is not set (i.e. using port files).
 * Returns true if a new port was found and config was updated.
 */
function rediscoverPort(): boolean {
  const envPort = parseInt(process.env.NSL_BRIDGE_PORT || "0", 10);
  if (envPort) {
    // Explicit port — can't re-discover
    return false;
  }

  const portFile = readPortFile();
  if (!portFile) {
    return false;
  }

  if (portFile.port === config.port && portFile.host === config.host) {
    // Same endpoint — no change
    return false;
  }

  const oldPort = config.port;
  config = buildConfig(portFile);
  logger.info({ oldPort, newPort: portFile.port, host: portFile.host }, "Re-discovered bridge port");
  return true;
}

// ── MCP Server ──

const server = new McpServer({
  name: "notebook-session-labs",
  version: packageVersion,
});

const BRIDGE_NOT_AVAILABLE = "Bridge not available. Open a notebook in VS Code first, then retry.";

// Helper to call the bridge with auto-re-discovery on connection failure
async function bridge(method: keyof typeof BRIDGE_METHODS, params?: Record<string, unknown>) {
  // If no port known yet, try to discover it now
  if (!config.port) {
    rediscoverPort();
    if (!config.port) {
      throw new Error(BRIDGE_NOT_AVAILABLE);
    }
  }

  try {
    return await callBridge(config, BRIDGE_METHODS[method], params, logger);
  } catch (err) {
    // If connection failed, try re-discovering the bridge port
    if (err instanceof Error && (err.message.includes("connection failed") || err.message.includes("ECONNREFUSED"))) {
      if (rediscoverPort()) {
        logger.info({ method }, "Retrying bridge request after re-discovery");
        return await callBridge(config, BRIDGE_METHODS[method], params, logger);
      }
    }
    throw err;
  }
}

// Helper to format result as text content
function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// ── Reusable Zod shapes ──

const NotebookIdParam = z.string().min(1).optional().describe(
  "Notebook ID (uses active notebook if omitted)",
);

const CellIndexParam = z.number().int().nonnegative().optional().describe(
  "Zero-based index of the cell",
);

const CellIdParam = z.string().min(1).optional().describe(
  "Cell ID (stable identifier). Use as an alternative to cellIndex to avoid index-shift issues.",
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
  cellId: CellIdParam,
  notebookId: NotebookIdParam,
}, async ({ cellIndex, cellId, notebookId }) => {
  return textResult(await bridge("READ_CELL", { cellIndex, cellId, notebookId }));
});

server.tool("read_cell_output", "Read the outputs of a specific cell", {
  cellIndex: CellIndexParam,
  cellId: CellIdParam,
  notebookId: NotebookIdParam,
}, async ({ cellIndex, cellId, notebookId }) => {
  return textResult(await bridge("READ_CELL_OUTPUT", { cellIndex, cellId, notebookId }));
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
  cellIndex: CellIndexParam.describe("Zero-based index of the cell to replace (alternative: cellId)"),
  cellId: CellIdParam,
  source: z.string().describe("New cell source content"),
  kind: z.enum(["code", "markdown"]).optional().describe("New cell type (default: keep current)"),
  language: z.string().optional().describe("Language for code cells"),
  notebookId: NotebookIdParam,
}, async ({ cellIndex, cellId, source, kind, language, notebookId }) => {
  return textResult(await bridge("REPLACE_CELL", { cellIndex, cellId, source, kind, language, notebookId }));
});

server.tool("edit_cell_source", "Edit the source text of an existing cell", {
  cellIndex: CellIndexParam,
  cellId: CellIdParam,
  source: z.string().describe("New source text"),
  notebookId: NotebookIdParam,
}, async ({ cellIndex, cellId, source, notebookId }) => {
  return textResult(await bridge("EDIT_CELL_SOURCE", { cellIndex, cellId, source, notebookId }));
});

server.tool("delete_cell", "Delete a cell from the notebook", {
  cellIndex: CellIndexParam.describe("Zero-based index of the cell to delete (alternative: cellId)"),
  cellId: CellIdParam,
  notebookId: NotebookIdParam,
}, async ({ cellIndex, cellId, notebookId }) => {
  return textResult(await bridge("DELETE_CELL", { cellIndex, cellId, notebookId }));
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
  cellIndex: CellIndexParam.describe("Zero-based index of the cell to execute (alternative: cellId)"),
  cellId: CellIdParam,
  waitForCompletion: z.boolean().default(true).describe("Wait for execution to complete"),
  timeoutMs: z.number().int().positive().optional().describe("Execution timeout in milliseconds"),
  notebookId: NotebookIdParam,
}, async ({ cellIndex, cellId, waitForCompletion, timeoutMs, notebookId }) => {
  return textResult(await bridge("EXECUTE_CELL", {
    cellIndex,
    cellId,
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

server.tool("clear_cell_outputs", "Clear outputs for a specific cell", {
  cellIndex: CellIndexParam.describe("Zero-based index of the cell (alternative: cellId)"),
  cellId: CellIdParam,
  notebookId: NotebookIdParam,
}, async ({ cellIndex, cellId, notebookId }) => {
  return textResult(await bridge("CLEAR_CELL_OUTPUTS", { cellIndex, cellId, notebookId }));
});

server.tool("clear_all_outputs", "Clear outputs for all cells in the notebook", {
  notebookId: NotebookIdParam,
}, async ({ notebookId }) => {
  return textResult(await bridge("CLEAR_ALL_OUTPUTS", { notebookId }));
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

  // Verify bridge connectivity (only if port is known)
  if (config.port) {
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
  } else {
    logger.info("Bridge not discovered yet — will retry when tools are called");
    console.error("NOTE: Bridge not discovered at startup. Port will be auto-discovered when tools are called.");
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

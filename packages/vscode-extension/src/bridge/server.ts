/**
 * Local loopback HTTP bridge server.
 *
 * Binds to 127.0.0.1 only with an ephemeral port.
 * Auth mode defaults to "none" (no token required for local loopback).
 * Token auth is available as an optional hardening mode.
 * Accepts JSON-RPC 2.0 requests and dispatches to handlers.
 */
import * as http from "http";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { handleRequest } from "./handlers.js";
import { extractBearerToken, generateToken, validateToken, setAuthMode, isTokenAuthEnabled, invalidateToken } from "./auth.js";
import { getLogger } from "../utils/logger.js";
import { ErrorCode, createJsonRpcError, BRIDGE_PORT_FILE_DIR, BRIDGE_PORT_FILE_PATTERN, BRIDGE_PORT_FILE_MAX_AGE_MS } from "@notebook-session-labs/shared";
import type { BridgeAuthMode } from "@notebook-session-labs/shared";

const log = getLogger();

export interface BridgeServerInfo {
  host: string;
  port: number;
  authMode: BridgeAuthMode;
  token: string | null;
}

let server: http.Server | null = null;
let serverInfo: BridgeServerInfo | null = null;

/**
 * Get the directory for bridge port files.
 *
 * Uses NSL_STATE_DIR if set (for Docker/custom setups).
 * Otherwise uses the platform temp directory via BRIDGE_PORT_FILE_DIR
 * (/tmp/notebook-session-labs on Linux/macOS, resolved via os.tmpdir() on Windows).
 */
function getStateDir(): string {
  if (process.env.NSL_STATE_DIR) {
    return process.env.NSL_STATE_DIR;
  }
  // On Windows, use os.tmpdir(); on Linux/macOS use the fixed /tmp path
  if (process.platform === "win32") {
    return path.join(os.tmpdir(), BRIDGE_PORT_FILE_DIR.replace(/^\//, ""));
  }
  return BRIDGE_PORT_FILE_DIR;
}

/**
 * Get the path to this session's bridge port file (PID-scoped).
 */
function getPortFilePath(): string {
  return path.join(getStateDir(), `bridge-${process.pid}.json`);
}

/**
 * Clean up stale port files left by crashed VS Code instances.
 * A port file is stale if:
 *  - No process with that PID exists, OR
 *  - The file is older than BRIDGE_PORT_FILE_MAX_AGE_MS
 */
function cleanupStalePortFiles(): void {
  const dir = getStateDir();
  if (!fs.existsSync(dir)) {
    return;
  }

  try {
    const entries = fs.readdirSync(dir);
    const now = Date.now();

    for (const entry of entries) {
      const match = entry.match(BRIDGE_PORT_FILE_PATTERN);
      if (!match) {
        continue;
      }

      const filePid = parseInt(match[1], 10);
      const filePath = path.join(dir, entry);

      try {
        const stat = fs.statSync(filePath);
        const age = now - stat.mtimeMs;

        // Check if PID is still alive
        let pidAlive = false;
        try {
          process.kill(filePid, 0); // signal 0 = existence check
          pidAlive = true;
        } catch {
          // PID doesn't exist → stale
        }

        if (!pidAlive || age > BRIDGE_PORT_FILE_MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          log.info({ file: entry, pid: filePid, staleReason: pidAlive ? "expired" : "process dead" }, "Cleaned up stale port file");
        }
      } catch {
        // Can't stat — skip
      }
    }
  } catch (err) {
    log.warn({ err }, "Failed to scan state dir for stale port files");
  }
}

/**
 * Write bridge connection info to a PID-scoped port file for Docker/container discovery.
 */
function writePortFile(info: BridgeServerInfo): void {
  try {
    cleanupStalePortFiles();
    const filePath = getPortFilePath();
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    // Make world-writable with sticky bit (like /tmp) so Docker containers
    // and other users can coexist. Silently ignore if not owner.
    try {
      fs.chmodSync(dir, 0o1777);
    } catch {
      // Not the owner — ok as long as we can write
    }
    // Verify the directory is actually writable
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      log.error(
        { dir, hint: "Run: sudo chmod 1777 " + dir },
        "Port file directory is not writable. Fix permissions or set NSL_STATE_DIR to a writable path.",
      );
      return;
    }
    const payload = {
      port: info.port,
      host: info.host,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
    log.info({ filePath, port: info.port }, "Bridge port file written");
  } catch (err) {
    log.warn({ err }, "Failed to write bridge port file");
  }
}

/**
 * Remove this session's bridge port file.
 */
function removePortFile(): void {
  try {
    const filePath = getPortFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      log.info({ filePath }, "Bridge port file removed");
    }
  } catch (err) {
    log.warn({ err }, "Failed to remove bridge port file");
  }
}

/**
 * Start the bridge HTTP server.
 */
export function startServer(
  host: string = "127.0.0.1",
  port: number = 0,
  maxOutputSize: number = 100_000,
  includeImages: boolean = true,
  authMode: BridgeAuthMode = "none",
): Promise<BridgeServerInfo> {
  return new Promise((resolve, reject) => {
    setAuthMode(authMode);
    const token = isTokenAuthEnabled() ? generateToken() : null;

    server = http.createServer(
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        handleHttpRequest(req, res, maxOutputSize, includeImages);
      },
    );

    server.on("error", (err: Error) => {
      log.error({ err }, "Bridge server error");
      reject(err);
    });

    server.listen(port, host, () => {
      const addr = server!.address();
      if (typeof addr === "object" && addr !== null) {
        serverInfo = { host: addr.address, port: addr.port, authMode, token };
        writePortFile(serverInfo);
        log.info(
          { host: addr.address, port: addr.port, authMode },
          "Bridge server started",
        );
        resolve(serverInfo);
      } else {
        reject(new Error("Failed to get server address"));
      }
    });
  });
}

/**
 * Stop the bridge HTTP server.
 */
export async function stopServer(): Promise<void> {
  if (!server) {
    return;
  }

  return new Promise((resolve, reject) => {
    server!.close((err) => {
      if (err) {
        log.error({ err }, "Error stopping bridge server");
        reject(err);
      } else {
        log.info("Bridge server stopped");
        removePortFile();
        server = null;
        serverInfo = null;
        invalidateToken();
        resolve();
      }
    });
  });
}

/**
 * Get current server info.
 */
export function getServerInfo(): BridgeServerInfo | null {
  return serverInfo;
}

/**
 * Handle an incoming HTTP request.
 */
async function handleHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  maxOutputSize: number,
  includeImages: boolean,
): Promise<void> {
  // Only accept POST to /rpc
  if (req.method !== "POST" || req.url !== "/rpc") {
    // Health check endpoint (GET /health) doesn't require auth
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          protocolVersion: "1.0.0",
          uptime: process.uptime(),
        }),
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  // Authenticate
  if (isTokenAuthEnabled()) {
    const authHeader = req.headers.authorization;
    const token = extractBearerToken(authHeader);
    if (!validateToken(token)) {
      log.warn({ remoteAddress: req.socket.remoteAddress }, "Auth failed");
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          createJsonRpcError(null, ErrorCode.BRIDGE_AUTH_FAILED, "Unauthorized"),
        ),
      );
      return;
    }
  }

  // Parse body
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }

  try {
    const parsed = JSON.parse(body);
    const response = await handleRequest(parsed, maxOutputSize, includeImages);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  } catch (err) {
    log.error({ err }, "Failed to parse request body");
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        createJsonRpcError(null, ErrorCode.INVALID_REQUEST, "Invalid JSON"),
      ),
    );
  }
}
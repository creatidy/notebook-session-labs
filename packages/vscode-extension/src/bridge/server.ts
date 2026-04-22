/**
 * Local loopback HTTP bridge server.
 *
 * Binds to 127.0.0.1 only with an ephemeral port and bearer token auth.
 * Accepts JSON-RPC 2.0 requests and dispatches to handlers.
 */
import * as http from "http";
import { handleRequest } from "./handlers.js";
import { extractBearerToken, generateToken, validateToken } from "./auth.js";
import { getLogger } from "../utils/logger.js";
import { ErrorCode, createJsonRpcError } from "@notebook-session-labs/shared";

const log = getLogger();

export interface BridgeServerInfo {
  host: string;
  port: number;
  token: string;
}

let server: http.Server | null = null;
let serverInfo: BridgeServerInfo | null = null;

/**
 * Start the bridge HTTP server.
 */
export function startServer(
  host: string = "127.0.0.1",
  port: number = 0,
  maxOutputSize: number = 100_000,
  includeImages: boolean = true,
): Promise<BridgeServerInfo> {
  return new Promise((resolve, reject) => {
    const token = generateToken();

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
        serverInfo = { host: addr.address, port: addr.port, token };
        log.info(
          { host: addr.address, port: addr.port },
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
        server = null;
        serverInfo = null;
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
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);
  if (!token || !validateToken(token)) {
    log.warn({ remoteAddress: req.socket.remoteAddress }, "Auth failed");
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        createJsonRpcError(null, ErrorCode.BRIDGE_AUTH_FAILED, "Unauthorized"),
      ),
    );
    return;
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
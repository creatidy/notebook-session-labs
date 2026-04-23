/**
 * Bridge client - communicates with the VS Code extension's local bridge.
 *
 * This is the only component in the MCP server that knows about HTTP transport.
 * All other MCP server code calls this client.
 */
import * as http from "http";
import {
  ErrorCode,
  type BridgeMethod,
} from "@notebook-session-labs/shared";
import pino, { type Logger } from "pino";

let requestId = 0;

export interface BridgeClientConfig {
  host: string;
  port: number;
  token?: string;
  timeoutMs: number;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Send a JSON-RPC request to the bridge server.
 */
export async function callBridge(
  config: BridgeClientConfig,
  method: BridgeMethod,
  params?: Record<string, unknown>,
  logger?: Logger,
): Promise<unknown> {
  const log = logger || pino({ name: "mcp-bridge-client", level: "info" });
  const id = String(++requestId);

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params: params ?? {},
  });

  log.debug({ method, id }, "Sending bridge request");

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
    };
    if (config.token) {
      headers["Authorization"] = `Bearer ${config.token}`;
    }

    const req = http.request(
      {
        hostname: config.host,
        port: config.port,
        path: "/rpc",
        method: "POST",
        headers,
        timeout: config.timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode === 401) {
            reject(
              new BridgeClientError(
                ErrorCode.BRIDGE_AUTH_FAILED,
                "Bridge authentication failed",
              ),
            );
            return;
          }
          if (res.statusCode !== 200) {
            reject(
              new BridgeClientError(
                ErrorCode.BRIDGE_UNAVAILABLE,
                `Bridge returned status ${res.statusCode}`,
              ),
            );
            return;
          }
          try {
            const response: JsonRpcResponse = JSON.parse(data);
            if (response.error) {
              reject(
                new BridgeClientError(
                  response.error.code,
                  response.error.message,
                  response.error.data,
                ),
              );
              return;
            }
            resolve(response.result);
          } catch (err) {
            reject(
              new BridgeClientError(
                ErrorCode.INTERNAL_ERROR,
                `Failed to parse bridge response: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
          }
        });
      },
    );

    req.on("error", (err) => {
      reject(
        new BridgeClientError(
          ErrorCode.BRIDGE_NOT_CONNECTED,
          `Bridge connection failed: ${err.message}`,
        ),
      );
    });

    req.on("timeout", () => {
      req.destroy();
      reject(
        new BridgeClientError(
          ErrorCode.BRIDGE_UNAVAILABLE,
          "Bridge request timed out",
        ),
      );
    });

    req.write(body);
    req.end();
  });
}

/**
 * Check bridge health.
 */
export async function checkHealth(
  config: BridgeClientConfig,
): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: config.host,
        port: config.port,
        path: "/health",
        method: "GET",
        timeout: 5000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode === 200) {
            resolve({ ok: true, message: data });
          } else {
            resolve({
              ok: false,
              message: `Health check returned ${res.statusCode}`,
            });
          }
        });
      },
    );
    req.on("error", (err) => {
      resolve({ ok: false, message: err.message });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, message: "Health check timed out" });
    });
    req.end();
  });
}

export class BridgeClientError extends Error {
  public readonly code: number;
  public readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "BridgeClientError";
    this.code = code;
    this.data = data;
  }
}
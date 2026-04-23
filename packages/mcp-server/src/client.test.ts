/**
 * Unit tests for the bridge client.
 */
import { describe, it, expect } from "vitest";
import { BridgeClientError, checkHealth } from "./client.js";
import { ErrorCode } from "@notebook-session-labs/shared";

describe("BridgeClientError", () => {
  it("creates an error with code and message", () => {
    const err = new BridgeClientError(ErrorCode.BRIDGE_NOT_CONNECTED, "Connection failed");
    expect(err.name).toBe("BridgeClientError");
    expect(err.code).toBe(ErrorCode.BRIDGE_NOT_CONNECTED);
    expect(err.message).toBe("Connection failed");
  });

  it("creates an error with data", () => {
    const err = new BridgeClientError(ErrorCode.INTERNAL_ERROR, "test", { detail: "extra" });
    expect(err.data).toEqual({ detail: "extra" });
  });

  it("is an instance of Error", () => {
    const err = new BridgeClientError(1, "test");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("checkHealth", () => {
  const defaultConfig = {
    host: "127.0.0.1",
    port: 9999,
    token: undefined,
    timeoutMs: 5000,
  };

  it("returns failure when server is not running", async () => {
    const result = await checkHealth(defaultConfig);
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it("accepts config with token for token-auth mode", async () => {
    const tokenConfig = {
      host: "127.0.0.1",
      port: 9999,
      token: "test-token",
      timeoutMs: 5000,
    };
    const result = await checkHealth(tokenConfig);
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it("accepts config without token for no-auth mode", async () => {
    const noTokenConfig = {
      host: "127.0.0.1",
      port: 9999,
      timeoutMs: 5000,
    };
    const result = await checkHealth(noTokenConfig);
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });
});

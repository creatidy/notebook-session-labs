/**
 * Bridge authentication - ephemeral bearer token generation and validation.
 *
 * Token authentication is **always enabled** for security. The bridge opens
 * a port on the local machine and any process that discovers the port could
 * execute arbitrary code via notebook cells. Requiring a token eliminates
 * this risk.
 *
 * The legacy "none" mode is silently upgraded to "token" so existing
 * configurations remain functional without error.
 */
import * as crypto from "crypto";
import type { BridgeAuthMode } from "@notebook-session-labs/shared";

let currentToken: string | null = null;

/**
 * Set the authentication mode.
 *
 * "none" is silently upgraded to "token" — token auth is always enforced.
 * This is a no-op kept for backward compatibility with callers that still
 * pass an auth mode.
 */
export function setAuthMode(_mode: BridgeAuthMode): void {
  // Token auth is always enforced regardless of the mode argument.
}

/**
 * Get the current authentication mode.
 *
 * Always returns "token". Kept for callers that query the mode.
 */
export function getAuthMode(): BridgeAuthMode {
  return "token";
}

/**
 * Check whether token authentication is enabled.
 *
 * Always returns true — token auth is mandatory.
 */
export function isTokenAuthEnabled(): boolean {
  return true;
}

/**
 * Generate a new ephemeral bearer token (64 hex characters, 256 bits of entropy).
 *
 * Called once at bridge startup. The token is written to the port file so
 * that MCP clients can discover it automatically.
 */
export function generateToken(): string {
  currentToken = crypto.randomBytes(32).toString("hex");
  return currentToken;
}

/**
 * Validate a bearer token against the current token.
 *
 * Uses constant-time comparison to prevent timing attacks.
 * Always returns false if no token has been generated or if the
 * provided token is empty/null.
 */
export function validateToken(token: string | null | undefined): boolean {
  if (!currentToken || !token) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(token, "utf-8"),
    Buffer.from(currentToken, "utf-8"),
  );
}

/**
 * Get the current token (for writing to the port file).
 */
export function getCurrentToken(): string | null {
  return currentToken;
}

/**
 * Invalidate the current token (called on bridge shutdown).
 */
export function invalidateToken(): void {
  currentToken = null;
}

/**
 * Extract bearer token from an Authorization header.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }
  return parts[1];
}

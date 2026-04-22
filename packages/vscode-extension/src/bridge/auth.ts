/**
 * Bridge authentication - ephemeral bearer token generation and validation.
 */
import * as crypto from "crypto";

let currentToken: string | null = null;

/**
 * Generate a new ephemeral bearer token.
 */
export function generateToken(): string {
  currentToken = crypto.randomBytes(32).toString("hex");
  return currentToken;
}

/**
 * Validate a bearer token against the current token.
 */
export function validateToken(token: string): boolean {
  if (!currentToken) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(token, "utf-8"),
    Buffer.from(currentToken, "utf-8"),
  );
}

/**
 * Get the current token (for external display, e.g. MCP server config).
 */
export function getCurrentToken(): string | null {
  return currentToken;
}

/**
 * Invalidate the current token.
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
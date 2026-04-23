/**
 * Bridge authentication - ephemeral bearer token generation and validation.
 *
 * Supports two modes:
 * - "none": No token required (default for local loopback).
 * - "token": Ephemeral bearer token generated and validated on each request.
 */
import * as crypto from "crypto";
import type { BridgeAuthMode } from "@notebook-session-labs/shared";

let authMode: BridgeAuthMode = "none";
let currentToken: string | null = null;

/**
 * Set the authentication mode.
 */
export function setAuthMode(mode: BridgeAuthMode): void {
  authMode = mode;
}

/**
 * Get the current authentication mode.
 */
export function getAuthMode(): BridgeAuthMode {
  return authMode;
}

/**
 * Check whether token authentication is enabled.
 */
export function isTokenAuthEnabled(): boolean {
  return authMode === "token";
}

/**
 * Generate a new ephemeral bearer token.
 * Only meaningful when auth mode is "token".
 */
export function generateToken(): string {
  currentToken = crypto.randomBytes(32).toString("hex");
  return currentToken;
}

/**
 * Validate a bearer token against the current token.
 * Returns true only when token auth is enabled and the token matches.
 */
export function validateToken(token: string | null | undefined): boolean {
  if (authMode === "none") {
    return true;
  }
  if (!currentToken || !token) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(token, "utf-8"),
    Buffer.from(currentToken, "utf-8"),
  );
}

/**
 * Get the current token (for external display when token mode is enabled).
 */
export function getCurrentToken(): string | null {
  return currentToken;
}

/**
 * Invalidate the current token and reset auth mode.
 */
export function invalidateToken(): void {
  currentToken = null;
  authMode = "none";
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

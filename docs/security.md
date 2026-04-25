# Security Model

## Overview

Notebook Session Labs uses a local bridge architecture with strong default security properties. Token authentication is **always enabled** — an ephemeral 256-bit bearer token is generated at startup and required for all bridge operations.

## Bridge Security

### Network Binding
- The bridge HTTP server binds to `127.0.0.1` only
- It never binds to `0.0.0.0`
- An ephemeral port is used by default (configurable)
- The bridge is only accessible from the local machine

### Authentication

**Token authentication is always enforced** regardless of the `authMode` configuration setting. This protects against unauthorized access from any process on the local machine that discovers the open port.

- **Ephemeral bearer token**: Generated automatically at bridge startup
  - 64 hex characters (256 bits of entropy) via `crypto.randomBytes(32)`
  - Validated using constant-time comparison (`crypto.timingSafeEqual`) to prevent timing attacks
  - Never persisted beyond the bridge port file (see below)
  - Never logged at info level or below
  - Invalidated on bridge shutdown
- **Port file**: The token is written alongside the port number to a PID-scoped JSON file:
  - Location: `/tmp/notebook-session-labs/bridge-<pid>.json` (or `NSL_STATE_DIR`)
  - File permissions: `0600` (owner read/write only)
  - Automatically cleaned up on shutdown or when stale
- **Token discovery**: MCP clients automatically discover the token from the port file — no manual configuration needed
- **Token priority**: `NSL_BRIDGE_TOKEN` env var → port file auto-discovery
- **Backward compatibility**: Setting `authMode` to `"none"` is silently upgraded to `"token"` — token auth is always enforced
- The `/health` endpoint does not require authentication (returns only status)

### Transport
- All bridge communication is over HTTP on loopback
- JSON-RPC 2.0 protocol
- No CORS headers (not needed for loopback)
- No HTTPS (loopback does not need TLS)

## Port File Security

The port file (`bridge-<pid>.json`) contains the bridge port, host, PID, and auth token:

```json
{
  "port": 42137,
  "host": "127.0.0.1",
  "pid": 12345,
  "token": "a1b2c3d4...64hexchars",
  "startedAt": "2025-01-15T10:30:00.000Z"
}
```

Security measures:
- File permissions are set to `0600` (owner-only read/write)
- The state directory uses sticky bit (`01777`, like `/tmp`)
- Stale files from crashed processes are automatically cleaned up
- Files expire after a configurable max age (default: 24 hours)
- Use `NSL_STATE_DIR` to control the directory location

## Logging

- Default log level: `info`
- Cell source content is never logged at info level
- Debug logging requires explicit opt-in via configuration
- Sensitive data (tokens, cell content) is redacted from structured logs
- Request IDs are used for correlation without exposing data

## Data Handling

- No telemetry is collected by default
- No data is sent to external services
- Cell outputs are processed in-memory only
- Large outputs are truncated with metadata preserved
- Image outputs can be disabled via configuration

## Tool Safety

- Read tools (`get_active_notebook`, `list_cells`, `read_cell`, etc.) never mutate state
- Write tools (`insert_cell`, `edit_cell_source`, `delete_cell`, etc.) require explicit parameters
- Execution tools (`execute_cell`, `run_all_cells`) support timeout controls
- No arbitrary shell execution is exposed in v1

## Configuration Security

- Bridge host defaults to `127.0.0.1`
- Bridge port defaults to ephemeral (random)
- Bridge token auth is **always enabled** (cannot be disabled)
- Max output size is configurable to prevent memory issues
- Image output can be disabled to reduce response size

## Future Considerations

- If HTTP transport is added for the MCP server, TLS and additional auth will be required
- If remote bridge access is ever needed, full TLS + token auth must be implemented first
- OpenTelemetry integration must respect the no-telemetry-by-default policy
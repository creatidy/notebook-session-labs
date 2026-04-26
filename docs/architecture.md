# Architecture

## System Overview

Notebook Session Labs is a hybrid MCP bridge for live notebook sessions inside VS Code. It consists of three components:

1. **VS Code Extension** (`packages/vscode-extension`) - Attaches to the active notebook session and exposes a secure local HTTP bridge
2. **MCP Server** (`packages/mcp-server`) - Implements MCP tools/resources/prompts over stdio, forwards operations to the bridge
3. **Shared Library** (`packages/shared`) - Common types, schemas, validation, and error codes

## Why This Architecture

This project is **not** a direct Jupyter URL/token client. Instead, it uses VS Code as the notebook access layer. This design provides:

- **Editor-native access**: Works with any notebook session that VS Code can interact with, including managed remote sessions
- **No credential handling**: The extension never needs API tokens or connection URLs for notebook backends
- **Stable API surface**: Built on documented VS Code notebook APIs, not on kernel-specific protocols
- **Security by default**: Loopback-only bridge with always-on token authentication

## Component Diagram

```
+-------------------+     stdio      +--------------------+
|   MCP Client      | <-----------> |   MCP Server       |
|   (e.g. Claude)   |               |   (Node.js)        |
+-------------------+               +--------+-----------+
                                             |
                                     HTTP JSON-RPC
                                     (loopback, bearer)
                                             |
                                             v
                                    +--------+-----------+
                                    |   VS Code Bridge   |
                                    |   (Extension)      |
                                    +--------+-----------+
                                             |
                                    VS Code Notebook API
                                             |
                                             v
                                    +--------------------+
                                    |   Notebook Session |
                                    |   (in VS Code)     |
                                    +--------------------+
```

## Trust Boundaries

- **MCP Client <-> MCP Server**: Stdio transport, process-local. The MCP client trusts the MCP server.
- **MCP Server <-> Bridge**: Loopback HTTP with mandatory bearer token authentication. Only accessible on the local machine.
- **Bridge <-> VS Code APIs**: In-process, same trust level as the extension host.

## Local Bridge Security Model

- Binds to `127.0.0.1` only (never `0.0.0.0`)
- Uses an ephemeral port (configurable, default: random)
- **Token authentication is always enabled** — an ephemeral 256-bit bearer token is generated at startup and required for all RPC calls
- Setting `authMode` to `"none"` is silently upgraded to `"token"` — token auth cannot be disabled
- Token is written to the port file (file permissions `0600`) and never logged at info level
- Bridge shuts down cleanly on extension deactivation
- Health check endpoint (`GET /health`) does not require authentication
- RPC endpoint (`POST /rpc`) always requires a valid bearer token

## Extension Host Responsibilities

- Detect active notebook editor
- Inspect notebook cells, source, outputs
- Edit, insert, delete, move cells
- Execute cells and capture results
- Report notebook metadata and selection state
- Expose these operations through the local bridge

## MCP Server Responsibilities

- Implement MCP tools for notebook operations
- Implement MCP prompts for citation and review
- Validate all inputs with schemas
- Forward operations to the bridge
- Return structured results to the MCP client

## Future Extension Points

- **HTTP transport for MCP server**: The server is structured so Streamable HTTP can be added without major refactor
- **Resources**: Active notebook summary, cell index map, kernel status (deferred from v1)
- **Additional tools**: `create_notebook`, `restart_kernel`
- **OpenTelemetry tracing**: Logging hooks are in place; structured tracing is a documented roadmap item
- **Configuration hot-reload**: Live bridge reconfiguration without restart

## Compatibility Statement

> This project works with notebook sessions accessible through VS Code. Compatibility depends on the notebook being open and controllable through the editor surface, not on any vendor-specific backend contract.

## Transport Decision

The local bridge uses **loopback HTTP** rather than IPC or named pipes. This decision was made because:

1. HTTP is universally understood and easy to debug
2. Always-on bearer token authentication protects against unauthorized local access
3. Token is auto-generated at startup and auto-discovered by MCP clients via port files
4. No platform-specific IPC configuration needed
5. Easy to test with standard HTTP tools (curl, etc.)

## Docker Networking

When running the MCP server in Docker, the container needs to reach the VS Code bridge on the host. Use `--network=host` to share the host's network stack directly.

### Port Discovery

The bridge server writes its connection info to a **PID-scoped port file** at startup and removes it on shutdown. This allows the MCP server in Docker to auto-discover the ephemeral port without manual configuration.

**Port file location:**

| Platform | Path |
|----------|------|
| Linux / macOS | `/tmp/notebook-session-labs/bridge-<pid>.json` |
| Windows | `%TEMP%\notebook-session-labs\bridge-<pid>.json` |
| Custom | Set `NSL_STATE_DIR` environment variable |

Each VS Code window writes its own file (`bridge-12345.json`), so multiple concurrent sessions coexist without conflicts.

**Port file contents:**
```json
{
  "port": 45321,
  "host": "127.0.0.1",
  "pid": 12345,
  "startedAt": "2025-01-15T10:30:00.000Z"
}
```

**Discovery order** (MCP server):
1. `NSL_BRIDGE_PORT` env var (explicit, highest priority)
2. Scan port files in `NSL_STATE_DIR` → pick the most recently modified valid one
3. Scan port files in `/tmp/notebook-session-labs/` (default)

### Crash Recovery

If VS Code crashes, the port file is left behind. Two mechanisms handle this:

1. **Stale cleanup on startup**: When any VS Code session starts a new bridge, it scans the state directory and removes port files whose PID no longer exists or whose age exceeds 1 hour.
2. **MCP server picks latest**: The Docker container scans all `bridge-*.json` files and picks the most recently modified one with a valid port. If the picked bridge is dead, the health check fails gracefully.

### Recommended Docker Config

**Linux / WSL:**

```bash
docker run -i --rm --network=host \
  -v /tmp/notebook-session-labs:/tmp/notebook-session-labs \
  -e NSL_BRIDGE_HOST=host.docker.internal \
  ghcr.io/creatidy/notebook-session-labs-mcp:latest
```

**Windows (PowerShell):**

```powershell
docker run -i --rm --network=host `
  -v "$env:TEMP\notebook-session-labs:/tmp/notebook-session-labs" `
  -e NSL_BRIDGE_HOST=host.docker.internal `
  ghcr.io/creatidy/notebook-session-labs-mcp:latest
```

The extension writes port files to `/tmp/notebook-session-labs/` on Linux/macOS and `%TEMP%\notebook-session-labs\` on Windows. The bind mount mirrors the host's port files into the container, where the MCP server auto-discovers them — no `NSL_STATE_DIR` or `NSL_BRIDGE_PORT` needed. The `-i` flag keeps stdin open for the stdio-based MCP transport. Without `--network=host`, the container may not be able to connect to the loopback bridge depending on the platform's Docker networking configuration.

### Multiple VS Code Sessions

Each VS Code window writes its own PID-scoped port file (`bridge-<pid>.json`), so multiple sessions coexist without overwriting each other. The Docker container picks the **most recently modified** valid port file. For explicit targeting of a specific session, set `NSL_BRIDGE_PORT` to that session's port.

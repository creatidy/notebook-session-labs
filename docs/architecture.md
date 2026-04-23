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
- **Security by default**: Loopback-only bridge with optional token authentication

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
- **MCP Server <-> Bridge**: Loopback HTTP (no token by default; optional bearer token when `authMode` is `"token"`). Only accessible on the local machine.
- **Bridge <-> VS Code APIs**: In-process, same trust level as the extension host.

## Local Bridge Security Model

- Binds to `127.0.0.1` only (never `0.0.0.0`)
- Uses an ephemeral port (configurable, default: random)
- **Default auth mode: `none`** — no token required for local loopback connections
- **Optional token mode**: when `notebookSessionLabs.bridge.authMode` is set to `"token"`, an ephemeral bearer token is generated at startup and required for RPC calls
- Token is never persisted to disk
- Token is never logged at info level
- Bridge shuts down cleanly on extension deactivation
- Health check endpoint (`GET /health`) does not require authentication
- RPC endpoint (`POST /rpc`) requires a valid bearer token only when token auth is enabled

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
- **Additional tools**: `create_notebook`, `restart_kernel`, `clear_cell_outputs`
- **OpenTelemetry tracing**: Logging hooks are in place; structured tracing is a documented roadmap item
- **Configuration hot-reload**: Live bridge reconfiguration without restart

## Compatibility Statement

> This project works with notebook sessions accessible through VS Code. Compatibility depends on the notebook being open and controllable through the editor surface, not on any vendor-specific backend contract.

## Transport Decision

The local bridge uses **loopback HTTP** rather than IPC or named pipes. This decision was made because:

1. HTTP is universally understood and easy to debug
2. Loopback-only binding provides sufficient security for local use without additional auth friction
3. Optional bearer token auth is available for users who want stricter local hardening
4. No platform-specific IPC configuration needed
5. Easy to test with standard HTTP tools (curl, etc.)

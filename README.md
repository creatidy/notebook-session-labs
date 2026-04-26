# Notebook Session Labs

A professional MCP bridge for live notebook sessions inside VS Code.

## What It Is

Notebook Session Labs lets MCP clients (like Claude) interact with notebook sessions running in VS Code. It provides tools for reading, editing, and executing notebook cells through a secure local bridge.

The project has two components:
- **VS Code Extension** - Attaches to your active notebook and exposes a local HTTP bridge
- **MCP Server** - Connects to the bridge and exposes notebook operations as MCP tools

## What It Is Not

- Not a direct Jupyter URL/token connector
- Not a browser automation tool
- Not a kernel-specific client
- Not dependent on any specific notebook provider

It works with any notebook session that is open and controllable through VS Code's editor surface.

## Quick Start

### Prerequisites

- VS Code 1.85+
- Node.js 20+
- pnpm 9+

### Install

```bash
git clone https://github.com/creatidy/notebook-session-labs.git
cd notebook-session-labs
pnpm install
pnpm build
```

### Run the Extension

1. Open this project in VS Code
2. Press F5 to launch the Extension Development Host
3. Open a notebook (`.ipynb`) in the Extension Development Host
4. The bridge starts automatically and shows the port/token in the status bar

### Run the MCP Server
 
Set environment variables from the bridge status:
 
```bash
export NSL_BRIDGE_HOST=127.0.0.1
export NSL_BRIDGE_PORT=<port from extension>
export NSL_BRIDGE_TOKEN=<token from extension>
 
pnpm --filter @notebook-session-labs/mcp-server start
```

The MCP server is also available as a Docker image from GHCR. The bridge auto-discovers the ephemeral port via a port file — no manual port configuration needed.

### Run with Docker (Linux)

```bash
docker run -i --rm --network=host \
  -v /tmp/notebook-session-labs:/tmp/notebook-session-labs \
  -e NSL_BRIDGE_HOST=host.docker.internal \
  ghcr.io/creatidy/notebook-session-labs-mcp:latest
```

### Run with Docker (Windows)

```powershell
docker run -i --rm --network=host `
  -v "$env:TEMP\notebook-session-labs:/tmp/notebook-session-labs" `
  -e NSL_BRIDGE_HOST=host.docker.internal `
  ghcr.io/creatidy/notebook-session-labs-mcp:latest
```

> **Note:** On Linux and macOS the extension writes port files to `/tmp/notebook-session-labs/`. On Windows the default is `%TEMP%\notebook-session-labs`. The Docker container reads them from `/tmp/notebook-session-labs` via a bind mount. You can override the extension's state directory by setting the `NSL_STATE_DIR` environment variable in VS Code settings.

See [llms-installation.md](llms-installation.md) for full installation options.

### Configure an MCP Client

**Auto-discovery (recommended)** — the port and token are read from the port file written by the extension. The Docker container expects port files at `/tmp/notebook-session-labs` internally.

**Linux:**

```json
{
  "servers": {
    "notebook-session-labs": {
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--network=host",
        "-v", "/tmp/notebook-session-labs:/tmp/notebook-session-labs",
        "-e", "NSL_BRIDGE_HOST=host.docker.internal",
        "ghcr.io/creatidy/notebook-session-labs-mcp:latest"
      ]
    }
  }
}
```

**Windows:**

```json
{
  "servers": {
    "notebook-session-labs": {
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--network=host",
        "-v", "%TEMP%\\notebook-session-labs:/tmp/notebook-session-labs",
        "-e", "NSL_BRIDGE_HOST=host.docker.internal",
        "ghcr.io/creatidy/notebook-session-labs-mcp:latest"
      ]
    }
  }
}
```

**From source (development only)** — if you built from source and want to run the MCP server directly:

```json
{
  "servers": {
    "notebook-session-labs": {
      "command": "node",
      "args": ["/absolute/path/to/notebook-session-labs/packages/mcp-server/dist/index.js"],
      "env": {
        "NSL_BRIDGE_HOST": "127.0.0.1"
      }
    }
  }
}
```

## Architecture Summary

```
MCP Client <--stdio--> MCP Server <--HTTP--> VS Code Extension Bridge <--API--> Notebook
```

The extension is the source of truth for notebook access. It exposes operations through a loopback HTTP bridge with ephemeral bearer token authentication. The MCP server connects to this bridge and translates operations into MCP tools.

See [docs/architecture.md](docs/architecture.md) for details.

## Supported Operations

### Session / Discovery
- `get_active_notebook` - Get the currently active notebook
- `list_open_notebooks` - List all open notebooks
- `list_cells` - List cells in a notebook
- `read_notebook` - Read full notebook details
- `read_cell` - Read a specific cell
- `read_cell_output` - Read cell outputs
- `get_selection` - Get current selection state

### Editing
- `insert_cell` - Insert a new cell
- `replace_cell` - Replace cell content
- `edit_cell_source` - Edit cell source text
- `delete_cell` - Delete a cell
- `move_cell` - Move a cell

### Execution
- `execute_cell` - Execute a cell
- `run_all_cells` - Run all cells
- `cancel_execution` - Cancel execution
- `save_notebook` - Save the notebook
- `clear_cell_outputs` - Clear outputs for a specific cell
- `clear_all_outputs` - Clear outputs for all cells

### Prompts
- `notebook-cite` - Generate a cell citation reference
- `notebook-review` - Review notebook structure and issues

## Security

- Bridge binds to `127.0.0.1` only
- Ephemeral bearer token, written to PID-scoped port file with `0600` permissions
- No telemetry by default
- Debug logging requires explicit opt-in
- Read and write tools are clearly separated

See [docs/security.md](docs/security.md) for the full security model.

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Type check
pnpm typecheck
```

See [docs/development.md](docs/development.md) for the development guide.

## Roadmap

- [ ] MCP resources for notebook summaries
- [ ] Streamable HTTP transport for the MCP server
- [ ] `create_notebook` and `restart_kernel` tools
- [ ] OpenTelemetry tracing hooks
- [ ] Configuration hot-reload
- [x] Extension marketplace publishing

## License

MIT
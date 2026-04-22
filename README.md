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

### Configure an MCP Client

Example configuration for VS Code MCP settings:

```json
{
  "servers": {
    "notebook-session-labs": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "NSL_BRIDGE_HOST": "127.0.0.1",
        "NSL_BRIDGE_PORT": "<port>",
        "NSL_BRIDGE_TOKEN": "<token>"
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

### Prompts
- `notebook-cite` - Generate a cell citation reference
- `notebook-review` - Review notebook structure and issues

## Security

- Bridge binds to `127.0.0.1` only
- Ephemeral bearer token, never persisted
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
- [ ] Extension marketplace publishing

## License

MIT
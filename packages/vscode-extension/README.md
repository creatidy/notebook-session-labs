# Notebook Session Labs — VS Code Extension

A local bridge for live notebook sessions inside VS Code. This extension exposes notebook operations through a secure HTTP bridge that MCP clients can connect to.

## Installation

Install from the VS Code Marketplace (search for "Notebook Session Labs") or install the `.vsix` manually:

```bash
code --install-extension notebook-session-labs-0.1.0.vsix
```

## Usage

1. Open a notebook (`.ipynb`) in VS Code
2. The bridge starts automatically and shows the port in the status bar
3. Configure your MCP client with the host and port values
4. (Optional) Enable token auth via `notebookSessionLabs.bridge.authMode` for stricter local security

## Commands

| Command | Description |
|---------|-------------|
| `Notebook Session Labs: Start Bridge` | Start the bridge server manually |
| `Notebook Session Labs: Stop Bridge` | Stop the bridge server |
| `Notebook Session Labs: Show Bridge Status` | Display current bridge status |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `notebookSessionLabs.bridge.enabled` | `true` | Enable the bridge server |
| `notebookSessionLabs.bridge.host` | `127.0.0.1` | Bridge host address |
| `notebookSessionLabs.bridge.port` | `0` | Bridge port (0 = ephemeral) |
| `notebookSessionLabs.bridge.autoStart` | `true` | Auto-start when a notebook opens |
| `notebookSessionLabs.bridge.authMode` | `"none"` | Auth mode: `"none"` (default) or `"token"` |
| `notebookSessionLabs.logging.level` | `info` | Log level |
| `notebookSessionLabs.output.maxSize` | `100000` | Max output size per cell (bytes) |
| `notebookSessionLabs.output.includeImages` | `true` | Include image outputs |

## MCP Client Configuration

### Node.js (local)

```json
{
  "servers": {
    "notebook-session-labs": {
      "command": "node",
      "args": ["/path/to/notebook-session-labs/packages/mcp-server/dist/index.js"],
      "env": {
        "NSL_BRIDGE_HOST": "127.0.0.1",
        "NSL_BRIDGE_PORT": "<port from status bar>"
      }
    }
  }
}
```

### Docker

```json
{
  "servers": {
    "notebook-session-labs": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--network=host",
        "-e", "NSL_BRIDGE_HOST=host.docker.internal",
        "-e", "NSL_BRIDGE_PORT=3939",
        "ghcr.io/creatidy/notebook-session-labs-mcp:latest"
      ]
    }
  }
}
```

See [llms-installation.md](../../llms-installation.md) for full configuration options including token auth.

## Architecture

```
MCP Client <--stdio--> MCP Server <--HTTP--> VS Code Extension Bridge <--API--> Notebook
```

The extension is the source of truth for notebook access. It uses loopback-only binding with optional token authentication.

See the [root README](../../README.md) and [architecture docs](../../docs/architecture.md) for details.

## Requirements

- VS Code 1.90.0 or later

## License

[MIT](LICENSE)
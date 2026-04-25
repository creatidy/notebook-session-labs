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
4. Token authentication is always enabled — no configuration needed. The token is auto-generated and shared via the port file.

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
| `notebookSessionLabs.bridge.authMode` | `"token"` | Token auth is always enforced (setting is for backward compatibility) |
| `notebookSessionLabs.logging.level` | `info` | Log level |
| `notebookSessionLabs.output.maxSize` | `100000` | Max output size per cell (bytes) |
| `notebookSessionLabs.output.includeImages` | `true` | Include image outputs |

## Port Discovery

When the bridge starts, it writes connection info to a **port file** so MCP clients (including Docker containers) can auto-discover the ephemeral port without manual configuration.

**Port file location:**

| Platform | Path |
|----------|------|
| Linux | `/tmp/notebook-session-labs/bridge-<pid>.json` |
| Windows / macOS | `~/.notebook-session-labs/bridge-<pid>.json` |
| Custom | Set `NSL_STATE_DIR` environment variable |

Each VS Code window writes its own PID-scoped file, so multiple sessions coexist. Stale files from crashed sessions are cleaned up automatically.

## MCP Client Configuration

### Docker (Linux)

Mount the port file directory and the MCP server auto-discovers the port and token:

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

### Docker (Windows / macOS)

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
        "-v", "~/.notebook-session-labs:/tmp/notebook-session-labs",
        "-e", "NSL_BRIDGE_HOST=host.docker.internal",
        "ghcr.io/creatidy/notebook-session-labs-mcp:latest"
      ]
    }
  }
}
```

### From Source (Development Only)

If you built from source and want to run the MCP server directly without Docker:

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

### Docker — explicit port

If you use a fixed port (`notebookSessionLabs.bridge.port` in settings):

```json
{
  "servers": {
    "notebook-session-labs": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--network=host",
        "-e", "NSL_BRIDGE_HOST=host.docker.internal",
        "-e", "NSL_BRIDGE_PORT=3838",
        "ghcr.io/creatidy/notebook-session-labs-mcp:latest"
      ]
    }
  }
}
```

See [llms-installation.md](../../llms-installation.md) for full configuration options. Token auth is always enabled.

## Architecture

```
MCP Client <--stdio--> MCP Server <--HTTP--> VS Code Extension Bridge <--API--> Notebook
```

The extension is the source of truth for notebook access. It uses loopback-only binding with always-on token authentication.

See the [root README](../../README.md) and [architecture docs](../../docs/architecture.md) for details.

## Requirements

- VS Code 1.90.0 or later

## License

[MIT](LICENSE)
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

## Port Discovery

When the bridge starts, it writes connection info to a **port file** so MCP clients (including Docker containers) can auto-discover the ephemeral port without manual configuration.

**Port file location:**

| Platform | Path |
|----------|------|
| Linux / macOS | `/tmp/notebook-session-labs/bridge-<pid>.json` |
| Windows | `%TEMP%\notebook-session-labs\bridge-<pid>.json` |
| Custom | Set `NSL_STATE_DIR` environment variable |

Each VS Code window writes its own PID-scoped file, so multiple sessions coexist. Stale files from crashed sessions are cleaned up automatically.

## MCP Client Configuration

### Node.js (local) — auto-discovery

The MCP server reads the port file automatically when `NSL_BRIDGE_PORT` is not set:

```json
{
  "servers": {
    "notebook-session-labs": {
      "command": "node",
      "args": ["/path/to/notebook-session-labs/packages/mcp-server/dist/index.js"],
      "env": {
        "NSL_BRIDGE_HOST": "127.0.0.1"
      }
    }
  }
}
```

### Node.js (local) — explicit port

If you set `notebookSessionLabs.bridge.port` to a fixed value:

```json
{
  "servers": {
    "notebook-session-labs": {
      "command": "node",
      "args": ["/path/to/notebook-session-labs/packages/mcp-server/dist/index.js"],
      "env": {
        "NSL_BRIDGE_HOST": "127.0.0.1",
        "NSL_BRIDGE_PORT": "3838"
      }
    }
  }
}
```

### Docker (Linux / WSL)

Mount the port file directory and the MCP server auto-discovers the port:

```json
{
  "servers": {
    "notebook-session-labs": {
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

### Docker (Windows / PowerShell)

The extension writes port files to `%TEMP%\notebook-session-labs\`. Mount that directory into the container:

```powershell
# In your MCP client config, use:
"-v", "$env:TEMP\notebook-session-labs:/tmp/notebook-session-labs"
```

```json
{
  "servers": {
    "notebook-session-labs": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--network=host",
        "-v", "C:\\Users\\<you>\\AppData\\Local\\Temp\\notebook-session-labs:/tmp/notebook-session-labs",
        "-e", "NSL_BRIDGE_HOST=host.docker.internal",
        "ghcr.io/creatidy/notebook-session-labs-mcp:latest"
      ]
    }
  }
}
```

> Replace `<you>` with your Windows username, or use `$env:TEMP\notebook-session-labs` in PowerShell.

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
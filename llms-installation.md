# Installing the Notebook Session Labs MCP Server

## Prerequisites

- Docker (recommended) or Node.js 20+ with pnpm 9+ (for building from source)
- A running instance of VS Code with the Notebook Session Labs extension active
- An open notebook in VS Code

## How Port Discovery Works

When the VS Code extension starts, it writes a port file (containing the port number and auth token) to a **state directory** on the host. The MCP server Docker container mounts this directory and auto-discovers the port and token.

The state directory path is determined by:

1. **VS Code setting** `notebookSessionLabs.bridge.stateDir` (if set to a non-empty path)
2. **Platform default** (if the setting is empty):
   - **Linux / macOS / WSL:** `/tmp/notebook-session-labs`
   - **Windows:** `%TEMP%\notebook-session-labs` (e.g., `C:\Users\<you>\AppData\Local\Temp\notebook-session-labs`)

When the bridge starts, VS Code shows a notification with the exact path and Docker mount command to use.

> **Tip:** On Windows, the Docker mount path must use the actual resolved path (e.g., `C:\Users\adria\AppData\Local\Temp\notebook-session-labs`), not `%TEMP%`.

## Environment Variables

The MCP server uses these environment variables at startup:

| Variable | Required | Description |
|----------|----------|-------------|
| `NSL_BRIDGE_HOST` | No | Bridge host (default: `127.0.0.1`) |
| `NSL_BRIDGE_PORT` | No | Port shown in VS Code status bar (auto-discovered from port files if not set) |
| `NSL_BRIDGE_TOKEN` | No | Auth token (auto-discovered from port file if not set; required if port file is inaccessible) |
| `NSL_LOG_LEVEL` | No | Log level: `debug`, `info`, `warn`, `error` (default: `info`) |

**Default behavior**: The bridge listens on loopback (`127.0.0.1`) only. Token authentication is **always enabled** — a 256-bit ephemeral bearer token is auto-generated at startup and written to the port file. The MCP server auto-discovers the token from the port file, so no manual `NSL_BRIDGE_TOKEN` configuration is needed in most setups.

**Override token**: Set `NSL_BRIDGE_TOKEN` explicitly only if the port file is inaccessible (e.g., different user, restricted permissions, or custom setups without the volume mount).

## Option 1: Build from Source

```bash
git clone https://github.com/creatidy/notebook-session-labs.git
cd notebook-session-labs
pnpm install
pnpm build

# Run the MCP server
NSL_BRIDGE_HOST=127.0.0.1 \
NSL_BRIDGE_PORT=<port> \
node packages/mcp-server/dist/index.js
```

## Option 2: Docker

The MCP server auto-discovers the bridge port from port files written by the extension. Mount the state directory into the container:

**Linux / WSL:**

```bash
docker run -i --rm --network=host \
  -v /tmp/notebook-session-labs:/tmp/notebook-session-labs \
  -e NSL_BRIDGE_HOST=host.docker.internal \
  ghcr.io/creatidy/notebook-session-labs-mcp:latest
```

**Windows (native, Docker Desktop):**

```bash
docker run -i --rm --network=host \
  -v C:\Users\<you>\AppData\Local\Temp\notebook-session-labs:/tmp/notebook-session-labs \
  -e NSL_BRIDGE_HOST=host.docker.internal \
  ghcr.io/creatidy/notebook-session-labs-mcp:latest
```

Replace `<you>` with your Windows username. The exact path is shown in the VS Code notification when the bridge starts.

No `NSL_BRIDGE_PORT` needed — the MCP server reads the port from the mounted port files automatically. Set `NSL_BRIDGE_HOST` to `host.docker.internal` (or the Docker host IP) so the container can reach the VS Code bridge on the host. The `--network=host` flag allows the container to access the host network directly.

> **Custom state directory:** To use a custom path, set `notebookSessionLabs.bridge.stateDir` in VS Code settings, then update the Docker volume mount to match. The container always reads port files from `/tmp/notebook-session-labs` internally — only the host side of the mount changes.

The Docker image is published to GHCR: `ghcr.io/creatidy/notebook-session-labs-mcp`.

## Option 3: Configure an MCP Client

### Docker-based MCP Client (Linux / WSL)

Mount the port file directory — the MCP server auto-discovers the port and token:

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

### Docker-based MCP Client (Windows)

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
        "-v", "C:\\Users\\<you>\\AppData\\Local\\Temp\\notebook-session-labs:/tmp/notebook-session-labs",
        "-e", "NSL_BRIDGE_HOST=host.docker.internal",
        "ghcr.io/creatidy/notebook-session-labs-mcp:latest"
      ]
    }
  }
}
```

Replace `<you>` with your Windows username. The exact path is shown in the VS Code notification when the bridge starts.

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

### With Explicit Token (Advanced)

Token auth is always enabled and auto-discovered from the port file via the volume mount. Only set `NSL_BRIDGE_TOKEN` explicitly if auto-discovery is not possible:

```json
{
  "servers": {
    "notebook-session-labs": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--network=host",
        "-v", "/tmp/notebook-session-labs:/tmp/notebook-session-labs",
        "-e", "NSL_BRIDGE_HOST=host.docker.internal",
        "-e", "NSL_BRIDGE_TOKEN",
        "ghcr.io/creatidy/notebook-session-labs-mcp:latest"
      ],
      "env": {
        "NSL_BRIDGE_TOKEN": "<token from port file>"
      }
    }
  }
}
```

## Steps

1. Install and activate the VS Code extension (Notebook Session Labs)
2. Open a notebook (`.ipynb`) in VS Code
3. The extension writes a port file automatically and shows a notification with the state directory path and Docker mount command
4. Configure your MCP client with the correct volume mount path
5. Start the MCP server through your client (port is auto-discovered)

## Common Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Bridge not available` | Port file not found | Ensure the Docker volume mount matches the state directory shown in the VS Code notification |
| `Bridge health check failed` | Extension not running or wrong host/port | Ensure VS Code is open with a notebook and the bridge is active |
| `ECONNREFUSED` | Wrong host or port | Verify `NSL_BRIDGE_HOST` and check that the bridge is running |
| `401 Unauthorized` | Wrong/missing auth token | Ensure the port file volume mount is correct (token is auto-discovered), or set `NSL_BRIDGE_TOKEN` explicitly |
| Connection refused from Docker | Container cannot reach host | Use `--network=host` flag, and set `NSL_BRIDGE_HOST` to `host.docker.internal` |
| Windows: port file not found in container | Wrong mount path | Use the exact path from the VS Code notification (e.g., `C:\Users\adria\AppData\Local\Temp\notebook-session-labs`), not `%TEMP%` |
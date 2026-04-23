# Installing the Notebook Session Labs MCP Server

## Prerequisites

- Node.js 20+ and pnpm 9+ (for building from source)
- A running instance of VS Code with the Notebook Session Labs extension active
- An open notebook in VS Code

## Environment Variables

The MCP server uses these environment variables at startup:

| Variable | Required | Description |
|----------|----------|-------------|
| `NSL_BRIDGE_HOST` | No | Bridge host (default: `127.0.0.1`) |
| `NSL_BRIDGE_PORT` | Yes | Port shown in VS Code status bar |
| `NSL_BRIDGE_TOKEN` | No | Token for auth when `authMode` is `"token"` (not needed by default) |
| `NSL_LOG_LEVEL` | No | Log level: `debug`, `info`, `warn`, `error` (default: `info`) |

**Default behavior**: The bridge listens on loopback (`127.0.0.1`) only and does not require a token. No `NSL_BRIDGE_TOKEN` is needed for normal local use.

**Token auth**: If you enable `notebookSessionLabs.bridge.authMode: "token"` in VS Code settings, you must also set `NSL_BRIDGE_TOKEN` to the token shown in the extension.

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

```bash
docker run -i --rm --network=host \
  -e NSL_BRIDGE_HOST=host.docker.internal \
  -e NSL_BRIDGE_PORT=<port> \
  ghcr.io/creatidy/notebook-session-labs-mcp:latest
```

When using Docker, set `NSL_BRIDGE_HOST` to `host.docker.internal` (or the Docker host IP) so the container can reach the VS Code bridge on the host. The `--network=host` flag allows the container to access the host network directly, which simplifies connectivity to the loopback bridge.

The Docker image is published to GHCR: `ghcr.io/creatidy/notebook-session-labs-mcp`.

## Option 3: Configure an MCP Client

### Cline / VS Code MCP Settings

Add to your MCP server configuration:

```json
{
  "servers": {
    "notebook-session-labs": {
      "command": "node",
      "args": ["/path/to/notebook-session-labs/packages/mcp-server/dist/index.js"],
      "env": {
        "NSL_BRIDGE_HOST": "127.0.0.1",
        "NSL_BRIDGE_PORT": "<port from extension>"
      }
    }
  }
}
```

### Docker-based MCP Client

```json
{
  "servers": {
    "notebook-session-labs": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--network=host",
        "-e", "NSL_BRIDGE_HOST",
        "-e", "NSL_BRIDGE_PORT",
        "ghcr.io/creatidy/notebook-session-labs-mcp:latest"
      ],
      "env": {
        "NSL_BRIDGE_HOST": "host.docker.internal",
        "NSL_BRIDGE_PORT": "<port from extension>"
      }
    }
  }
}
```

### With Token Auth Enabled

If you set `notebookSessionLabs.bridge.authMode` to `"token"`, include `NSL_BRIDGE_TOKEN`:

```json
{
  "servers": {
    "notebook-session-labs": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--network=host",
        "-e", "NSL_BRIDGE_HOST",
        "-e", "NSL_BRIDGE_PORT",
        "-e", "NSL_BRIDGE_TOKEN",
        "ghcr.io/creatidy/notebook-session-labs-mcp:latest"
      ],
      "env": {
        "NSL_BRIDGE_HOST": "host.docker.internal",
        "NSL_BRIDGE_PORT": "<port from extension>",
        "NSL_BRIDGE_TOKEN": "<token from extension>"
      }
    }
  }
}
```

## Steps

1. Install and activate the VS Code extension (Notebook Session Labs)
2. Open a notebook (`.ipynb`) in VS Code
3. Check the status bar for the bridge port
4. Set `NSL_BRIDGE_PORT` in your MCP client config
5. Start the MCP server through your client

## Common Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `NSL_BRIDGE_PORT is required` | Port not set | Start the VS Code extension and copy the port from the status bar |
| `Bridge health check failed` | Extension not running or wrong host/port | Ensure VS Code is open with a notebook and the bridge is active |
| `ECONNREFUSED` | Wrong host or port | Verify `NSL_BRIDGE_HOST` and `NSL_BRIDGE_PORT` match the extension status bar |
| `401 Unauthorized` | Token auth enabled but wrong/missing token | Set `NSL_BRIDGE_TOKEN` or disable token auth in extension settings |
| Connection refused from Docker | Container cannot reach host | Use `--network=host` flag, and set `NSL_BRIDGE_HOST` to `host.docker.internal` |

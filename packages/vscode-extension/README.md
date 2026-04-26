# Notebook Session Labs

**Let AI assistants read and interact with your Jupyter notebooks in VS Code.**

Notebook Session Labs connects your AI assistant (like Claude, GPT, or any MCP-compatible tool) directly to your open Jupyter notebooks. Your AI can read cells, edit code, see outputs, and help you work with data — all in real time, inside VS Code.

## Who Is This For?

- **Researchers** who want AI help analyzing data, fixing notebook errors, or documenting results
- **Data scientists** who need an AI pair programmer that can actually see their notebook outputs
- **Students** learning Python/data science who want guided help with their code
- **Anyone** using Jupyter notebooks in VS Code who wants AI assistance that goes beyond chat

## What Can the AI Do?

With this extension, your AI assistant can:

- **Read** your notebook cells, outputs, and metadata
- **Edit** cell contents, add new cells, reorder them
- **Execute** cells and see the results (stdout, errors, data tables)
- **Clean up** outputs, save notebooks
- **Analyze** your data by seeing actual execution results

## Requirements

Before you start, you need:

1. **VS Code** (version 1.90 or later) — [Download](https://code.visualstudio.com/)
2. **Docker Desktop** — [Download](https://www.docker.com/products/docker-desktop/) (used to run the MCP server securely)

That's it. No Python packages, no manual configuration files.

## Installation — Quick Start

### Step 1: Install the Extension

Search for **"Notebook Session Labs"** in the VS Code Extensions marketplace, or install from the [marketplace page](https://marketplace.visualstudio.com/items?itemName=creatidy.notebook-session-labs).

### Step 2: Open a Notebook

Open any `.ipynb` file in VS Code. The extension starts automatically — you'll see a notification with the bridge status.

### Step 3: Configure Your AI Client

Add this block to your MCP client configuration (the location depends on your AI tool — see below):

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

**macOS:**
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

#### Where to Put the Configuration

| AI Client | Config Location |
|---|---|
| **Claude Code** (CLI) | `.mcp.json` in your project root |
| **Cline** (VS Code extension) | VS Code Settings → Cline → MCP Servers |
| **Cursor** | Settings → MCP → Add new server |
| **Windsurf** | Settings → MCP Servers |
| **Other MCP clients** | Check your client's documentation for MCP server configuration |

That's it — restart your AI client and it will be able to interact with your notebooks.

## How It Works

```
Your AI Assistant ←→ MCP Server (Docker) ←→ VS Code Extension ←→ Your Notebook
```

1. This VS Code extension creates a secure local bridge when you open a notebook
2. The MCP server (running in Docker) connects to this bridge
3. Your AI assistant sends commands through the MCP server
4. The bridge between the extension and the MCP server stays on your machine

## Security

Your notebooks stay safe:

- **Local only** -- the bridge binds to `127.0.0.1` (your machine only, never the internet)
- **Token authentication** -- an auto-generated 256-bit token protects every request
- **No telemetry** -- this extension does not send any data externally (your AI client may use cloud APIs separately)
- **Docker isolation** -- the MCP server runs in a container

## Troubleshooting

### "Bridge not available" error
Make sure you have a notebook (`.ipynb`) open in VS Code. The bridge starts automatically when a notebook is opened.

### "Docker" not found
Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and make sure it's running.

### AI can't execute cells
The first time you use a notebook, you may need to **run one cell manually** (click the Run button in VS Code) to initialize the kernel. After that, the AI can execute cells.

### Bridge status shows wrong port
Use the command **"Notebook Session Labs: Show Bridge Status"** from the VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to check the current status.

## Commands

| Command | What It Does |
|---|---|
| **Notebook Session Labs: Start Bridge** | Start the bridge manually |
| **Notebook Session Labs: Stop Bridge** | Stop the bridge |
| **Notebook Session Labs: Show Bridge Status** | Show current port and connection info |

## Settings

All settings are optional — defaults work for most users.

| Setting | Default | Description |
|---|---|---|
| `notebookSessionLabs.bridge.autoStart` | `true` | Auto-start when a notebook opens |
| `notebookSessionLabs.bridge.enabled` | `true` | Enable/disable the bridge |
| `notebookSessionLabs.output.maxSize` | `100000` | Max output size per cell (bytes) |
| `notebookSessionLabs.output.includeImages` | `true` | Include image outputs |
| `notebookSessionLabs.logging.level` | `"info"` | Log level (`debug`, `info`, `warn`, `error`) |

## Advanced Configuration

For advanced options (custom ports, fixed port configuration, running from source, token configuration), see the [GitHub repository](https://github.com/creatidy/notebook-session-labs).

## Requirements

- VS Code 1.90.0 or later
- Docker Desktop (for the MCP server)

## License

[MIT](LICENSE)
# Development Guide

## Prerequisites

- Node.js 20+
- pnpm 9+

## Setup

```bash
git clone https://github.com/creatidy/notebook-session-labs.git
cd notebook-session-labs
pnpm install
```

## Project Structure

```
packages/
  shared/           - Shared types, schemas, validation
  vscode-extension/ - VS Code extension with bridge server
  mcp-server/       - MCP server with stdio transport
```

## Common Commands

```bash
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm lint           # Lint all packages
pnpm typecheck      # Type check all packages
pnpm clean          # Clean build artifacts
```

## Package Details

### shared
Pure TypeScript library with schemas and types. No runtime dependencies except zod.

### vscode-extension
VS Code extension that:
- Detects active notebooks
- Exposes a local HTTP bridge
- Handles cell operations via VS Code APIs

To test:
1. Open the project in VS Code
2. Go to Run & Debug panel
3. Select "Run Extension" and press F5
4. An Extension Development Host opens with the extension active

### mcp-server
Standalone Node.js MCP server that connects to the bridge.

To test locally:
```bash
export NSL_BRIDGE_HOST=127.0.0.1
export NSL_BRIDGE_PORT=<port>
export NSL_BRIDGE_TOKEN=<token>
node packages/mcp-server/dist/index.js
```

Token auth is always enabled. The token is auto-discovered from the port file if the Docker volume mount is set up. For local testing without Docker, set `NSL_BRIDGE_TOKEN` explicitly (the token is shown in the VS Code status bar when the bridge is running).

## Testing

- Unit tests use Vitest
- Tests are located in `*.test.ts` files alongside source
- Integration tests use mocks for VS Code APIs
- Manual verification steps are in docs/manual-verification.md

## Code Style

- TypeScript strict mode
- ESLint + Prettier
- 2-space indentation
- Single quotes
- Trailing commas
# ── Stage 1: Build ──
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.9.0 --activate

WORKDIR /app

# Copy workspace root config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/mcp-server/package.json packages/mcp-server/

# Install all dependencies (including dev for build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/mcp-server/ packages/mcp-server/
COPY tsconfig.json ./

# Build shared first, then mcp-server
RUN pnpm --filter @notebook-session-labs/shared build
RUN pnpm --filter @notebook-session-labs/mcp-server build

# Install only production dependencies for final image
RUN pnpm install --frozen-lockfile --prod

# ── Stage 2: Production ──
FROM node:22-slim

LABEL org.opencontainers.image.source="https://github.com/creatidy/notebook-session-labs"
LABEL org.opencontainers.image.description="MCP server for Notebook Session Labs — bridges to VS Code notebook sessions"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Copy production node_modules and built dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/mcp-server/node_modules ./packages/mcp-server/node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/mcp-server/dist ./packages/mcp-server/dist
COPY --from=builder /app/packages/mcp-server/package.json ./packages/mcp-server/

# Environment variables — must be set at runtime
ENV NSL_BRIDGE_HOST=127.0.0.1
ENV NSL_BRIDGE_PORT=""
ENV NSL_LOG_LEVEL=info

WORKDIR /app/packages/mcp-server

CMD ["node", "dist/index.js"]
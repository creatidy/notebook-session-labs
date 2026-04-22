# Security Model

## Overview

Notebook Session Labs uses a local bridge architecture with strong default security properties.

## Bridge Security

### Network Binding
- The bridge HTTP server binds to `127.0.0.1` only
- It never binds to `0.0.0.0`
- An ephemeral port is used by default (configurable)
- The bridge is only accessible from the local machine

### Authentication
- An ephemeral bearer token is generated at extension startup
- The token is 64 hex characters (256 bits of entropy)
- The token is validated using constant-time comparison
- The token is never persisted to disk
- The token is never logged at info level or below
- Token is required for all `/rpc` endpoints
- The `/health` endpoint does not require authentication (returns only status)

### Transport
- All bridge communication is over HTTP on loopback
- JSON-RPC 2.0 protocol
- No CORS headers (not needed for loopback)
- No HTTPS (loopback does not need TLS)

## Logging

- Default log level: `info`
- Cell source content is never logged at info level
- Debug logging requires explicit opt-in via configuration
- Sensitive data (tokens, cell content) is redacted from structured logs
- Request IDs are used for correlation without exposing data

## Data Handling

- No telemetry is collected by default
- No data is sent to external services
- Cell outputs are processed in-memory only
- Large outputs are truncated with metadata preserved
- Image outputs can be disabled via configuration

## Tool Safety

- Read tools (`get_active_notebook`, `list_cells`, `read_cell`, etc.) never mutate state
- Write tools (`insert_cell`, `edit_cell_source`, `delete_cell`, etc.) require explicit parameters
- Execution tools (`execute_cell`, `run_all_cells`) support timeout controls
- No arbitrary shell execution is exposed in v1

## Configuration Security

- Bridge host defaults to `127.0.0.1`
- Bridge port defaults to ephemeral (random)
- Bridge token is always auto-generated (override only for development)
- Max output size is configurable to prevent memory issues
- Image output can be disabled to reduce response size

## Future Considerations

- If HTTP transport is added for the MCP server, TLS and additional auth will be required
- If remote bridge access is ever needed, full TLS + auth must be implemented first
- OpenTelemetry integration must respect the no-telemetry-by-default policy
# Security Policy

## Reporting Security Issues

If you discover a security vulnerability, please report it privately by opening a GitHub Security Advisory or contacting the maintainers directly.

Do not file public issues for security vulnerabilities.

## Security Model

See [docs/security.md](docs/security.md) for the full security model.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Security Properties

- Bridge binds to loopback only (127.0.0.1)
- **Always-on ephemeral bearer token authentication** (256-bit, auto-generated, no user config needed)
- Token auto-discovered by MCP clients via port file (no manual configuration required)
- Port file permissions restricted to owner-only (`0600`)
- Constant-time token comparison (timing attack prevention)
- No telemetry by default
- No data sent to external services
- Debug logging requires explicit opt-in

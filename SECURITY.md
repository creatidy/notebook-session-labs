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
- Ephemeral bearer token authentication
- No telemetry by default
- No data sent to external services
- Debug logging requires explicit opt-in
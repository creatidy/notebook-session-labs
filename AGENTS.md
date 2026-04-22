# AGENTS.md

This file guides autonomous coding agents working in this repository. A nested `AGENTS.md` in a subdirectory takes precedence for that scope.

## Working Rules

- Prefer documented APIs (VS Code, MCP) over hacks or undocumented internals.
- Prefer simple, maintainable solutions over clever ones.
- Keep changes minimal and scoped to the task. Do not introduce unrelated refactors.
- Keep MCP-specific logic in `packages/mcp-server` separate from VS Code extension logic in `packages/vscode-extension`.
- Keep shared portable code in `packages/shared` separate from platform-specific code.
- Place reusable script logic in `scripts/` rather than inline shell or Python in Makefiles.
- Preserve public-neutral naming and documentation. Do not add provider-specific branding or references.

## Copyright and License

- Repository license: **MIT**. The root `LICENSE` file is the source of truth.
- Default copyright holder: **Adrian Tkacz**, unless explicitly changed by the repository owner.
- Do not replace existing copyright notices with organization, project, or "Contributors" wording unless explicitly requested.
- Do not rewrite existing copyright notices automatically.
- Do not add per-file copyright headers unless the repository already uses them or there is a clear reason. If a new file needs one, use the current copyright holder — not a generic label.

## Documentation

- `AGENTS.md` is for agent-operational rules only.
- User-facing usage docs go in `README.md` or `docs/`.
- Contributor workflow docs go in `CONTRIBUTING.md`.
- New repo-wide, agent-relevant policies belong here. Narrow or package-specific policies belong in a nested `AGENTS.md`.

## Change Discipline

- Do not rename packages, public identifiers, or release-facing artifacts without a strong reason.
- Do not change license, package visibility, publishing settings, or repository metadata unless explicitly asked.
- Preserve backward compatibility and public professionalism.
- Document material architectural decisions in `docs/` when appropriate, but do not over-document.
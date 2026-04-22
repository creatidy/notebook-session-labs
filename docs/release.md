# Release Process

## Versioning

This project uses [Changesets](https://github.com/changesets/changesets) for version management.

## Required Secrets

The following GitHub repository secrets must be configured before automated releases work:

| Secret | Purpose | How to Generate |
|--------|---------|-----------------|
| `VSCE_PAT` | VS Code Marketplace publishing | See below |
| `DOCKERHUB_USERNAME` | Docker Hub authentication | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token | Docker Hub → Account Settings → Security |

`GITHUB_TOKEN` is provided automatically by GitHub Actions — no configuration needed.

## VS Code Publisher Setup

1. Go to [https://vscode.dev](https://vscode.dev) or use the `vsce` CLI
2. Create a publisher with the name matching `publisher` in `packages/vscode-extension/package.json` (currently `notebook-session-labs`)
3. Generate a Personal Access Token (PAT):
   - Go to [https://dev.azure.com](https://dev.azure.com) → User Settings → Personal Access Tokens
   - Create a new token with **Marketplace > Manage** scope
   - Set organization to **All accessible organizations**
   - Copy the token and store it as the `VSCE_PAT` GitHub secret

## Docker Hub Setup

1. Create a Docker Hub account (if not existing)
2. Create a repository named `notebook-session-labs-mcp` under the `creatidy` organization
3. Generate an access token: Docker Hub → Account Settings → Security → New Access Token
4. Store the username as `DOCKERHUB_USERNAME` and the token as `DOCKERHUB_TOKEN` in GitHub secrets

## Release Steps

1. Create a changeset: `pnpm changeset`
2. Commit the changeset with your changes
3. Run version: `pnpm changeset version`
4. Review the generated changelog entries
5. Commit the version bump
6. Tag the release: `git tag v<version>`
7. Push: `git push --follow-tags`

Pushing a `v*` tag triggers both release workflows automatically.

## Automated Release Triggers

Both workflows run on tag push matching `v*`:

| Workflow | Artifact | Destination |
|----------|----------|-------------|
| `release-extension.yml` | `.vsix` | VS Code Marketplace + GitHub artifact |
| `release-docker.yml` | Docker image | Docker Hub + GHCR |

Docker image tags generated:
- `v0.1.0` → `0.1.0`, `0.1`
- `latest` tag is applied to releases from the default branch

## Manual Dry Run

Before trusting automation, do a manual dry run:

### Package extension locally

```bash
pnpm install
pnpm build
cd packages/vscode-extension
npx vsce package --no-dependencies
```

This produces a `.vsix` file. Inspect it:

```bash
npx vsce ls --no-dependencies
```

### Publish extension locally (only if ready)

```bash
cd packages/vscode-extension
npx vsce publish --no-dependencies --pat <YOUR_PAT>
```

### Build Docker image locally

```bash
docker build -t notebook-session-labs-mcp .
```

### Test Docker image locally

```bash
docker run --rm \
  -e NSL_BRIDGE_HOST=host.docker.internal \
  -e NSL_BRIDGE_PORT=<port> \
  -e NSL_BRIDGE_TOKEN=<token> \
  notebook-session-labs-mcp
```

### Push Docker image manually

```bash
docker tag notebook-session-labs-mcp creatidy/notebook-session-labs-mcp:0.1.0
docker tag notebook-session-labs-mcp creatidy/notebook-session-labs-mcp:latest
docker push creatidy/notebook-session-labs-mcp:0.1.0
docker push creatidy/notebook-session-labs-mcp:latest
```

## CI

The GitHub Actions CI workflow handles build verification on every push to `main` and on pull requests. It runs typecheck, lint, test, and build across Node 20 and 22.

## Assumptions

- The extension version in `packages/vscode-extension/package.json` is the source of truth for the VSIX version
- The git tag version (`v0.1.0`) should match the extension version
- Docker image versioning is derived from the git tag via `docker/metadata-action`
- The `@vscode/vsce` tool is available via `npx` in the extension package
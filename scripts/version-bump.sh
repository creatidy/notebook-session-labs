#!/usr/bin/env bash
# version-bump.sh — Bump the version across all package.json files.
#
# Usage: ./scripts/version-bump.sh <new-version>
# Example: ./scripts/version-bump.sh 0.3.0
#
# Updates the "version" field in all four package.json files to keep them
# in sync. Run from the repository root.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <new-version>" >&2
  echo "Example: $0 0.3.0" >&2
  exit 1
fi

NEW_VERSION="$1"

# Validate semver-ish format (major.minor.patch with optional pre-release)
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  echo "Error: '$NEW_VERSION' does not look like a valid semver version (e.g. 1.2.3)" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

FILES=(
  "package.json"
  "packages/shared/package.json"
  "packages/mcp-server/package.json"
  "packages/vscode-extension/package.json"
)

echo "Bumping version to $NEW_VERSION ..."

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "Error: $f not found" >&2
    exit 1
  fi

  OLD=$(jq -r '.version' "$f")
  jq --arg v "$NEW_VERSION" '.version = $v' "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"
  echo "  $f: $OLD -> $NEW_VERSION"
done

echo ""
echo "Done. All packages are now at version $NEW_VERSION."
echo "Review the changes, then commit and tag:"
echo "  git add -A && git commit -m \"chore: bump version to $NEW_VERSION\""
echo "  git tag \"v$NEW_VERSION\""
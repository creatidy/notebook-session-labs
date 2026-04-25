#!/bin/sh
set -e

# Ensure the shared port file directory exists with correct permissions
# (world-writable + sticky bit, like /tmp) so both Docker and the
# VS Code extension can read/write regardless of who created it first.
STATE_DIR="/tmp/notebook-session-labs"
mkdir -p "$STATE_DIR"
chmod 1777 "$STATE_DIR" 2>/dev/null || true

exec node dist/index.js
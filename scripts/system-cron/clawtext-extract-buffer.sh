#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"
exec "$SCRIPT_DIR/run-with-lock.sh" "clawtext-extract-buffer" 300 node scripts/extract-buffer.mjs

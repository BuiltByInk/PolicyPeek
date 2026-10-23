#!/usr/bin/env bash
# Usage: batches/runner/run-preview.sh <batch dir> [args]   (see batches/README.md)
set -euo pipefail
R="$(cd "$(dirname "$0")" && pwd)"; export HERE="$(cd "$1" && pwd)"; shift
B=${BACKEND:-$R/../../backend}; export BACKEND="$(cd "$B" && pwd)"
"$BACKEND/node_modules/.bin/esbuild" "$R/preview.ts" --bundle --platform=node --format=esm --target=node22 --log-level=warning --outfile=/tmp/pp-batch-preview.mjs
node --no-warnings /tmp/pp-batch-preview.mjs "$@"

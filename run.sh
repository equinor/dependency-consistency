#!/usr/bin/env bash
set -euo pipefail

readonly ROOT_DIR=$(realpath "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)")

echo "RUNNING"

"$ROOT_DIR/node_modules/.bin/ts-node" "$ROOT_DIR/index.ts" "$@"

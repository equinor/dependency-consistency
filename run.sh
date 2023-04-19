#!/usr/bin/env bash
set -euo pipefail

function get_root_dir () {
    local here
    here="$(realpath "$(dirname "$0")")"
    while [[ ! -f "$here/run.sh" ]] && [[ "$here" != "/" ]]; do
        here=$(realpath "$here/..")
    done
    echo "$here"
}

readonly ROOT_DIR="$(get_root_dir)"

node "$ROOT_DIR/index.js" "$@"

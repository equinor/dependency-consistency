#!/usr/bin/env bash
set -euo pipefail

function get_root_dir () {
    local here
    here="$(realpath "$(dirname "$0")")"
    if [[ "$here" == *"/node_env-default/bin" ]]; then
        echo "$here" | sed -e 's|^\(.*\)/node_env-default/bin$|\1|'
    else
        echo "$here"
    fi
}

readonly ROOT_DIR="$(get_root_dir)"

if [[ -d "$ROOT_DIR/node_modules" ]]; then
    readonly NODE_MODULES="$ROOT_DIR/node_modules"
else
    readonly NODE_MODULES="$ROOT_DIR/node_env-default/lib/node_modules/dependency-consistency/node_modules"
fi

set +u
# It may contained undefined variables
source "$ROOT_DIR/node_env-default/bin/activate"
set -u

NODE_PATH="$NODE_MODULES" "node" "$ROOT_DIR/index.js" "$@"

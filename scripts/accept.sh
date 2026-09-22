#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

test -f dist/chocodrop-sdk.esm.js
test -f dist/ui.global.js
mkdir -p tmp
accept_dir="$(mktemp -d "$PWD/tmp/daemon-accept.XXXXXX")"
trap 'rm -rf "$accept_dir"' EXIT
mkdir -p "$accept_dir/install"

archive="$(npm pack --workspace=@chocodrop/daemon --pack-destination "$accept_dir" --cache "$PWD/tmp/npm-cache" | tail -1)"
pnpm add --dir "$accept_dir/install" --ignore-scripts "file:$accept_dir/$archive"
node scripts/accept-daemon.mjs "$accept_dir/install"

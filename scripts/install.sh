#!/bin/sh
# Install (or refresh) the plugin into the web profile.
# pnpm does not recopy a file: dependency unless it is re-added, so the
# script always remove+adds. Restart the running dsh web server afterwards.
#
# The store is pinned to the profile's existing links (.modules.yaml
# storeDir), so runs from any shell keep matching the store the profile was
# installed from — a mismatched ambient store (e.g. PNPM_HOME set) is what
# breaks pnpm with ERR_PNPM_UNEXPECTED_STORE.
set -e
PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_DIR="$HOME/.dsh/profiles/web"
STORE="$(awk '/^storeDir:/{print $2}' "$PROFILE_DIR/node_modules/.modules.yaml" 2>/dev/null)"
if [ -z "$STORE" ]; then STORE="$(pnpm store path)"; fi
dsh plugin --profile web remove dsh-response-meta --store-dir "$STORE" >/dev/null 2>&1 || true
dsh plugin --profile web add "file:$PLUGIN_DIR" --store-dir "$STORE"
echo "installed. restart the dsh web server to load it."

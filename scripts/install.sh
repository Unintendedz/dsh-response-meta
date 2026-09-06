#!/bin/sh
# Install (or refresh) the plugin into an explicitly selected home/profile.
# pnpm does not recopy a file: dependency unless it is re-added, so the
# script always remove+adds. Restart the running dsh web server afterwards.
#
# The store is pinned to the profile's existing links (.modules.yaml
# storeDir), so runs from any shell keep matching the store the profile was
# installed from — a mismatched ambient store (e.g. PNPM_HOME set) is what
# breaks pnpm with ERR_PNPM_UNEXPECTED_STORE.
set -e
: "${DSH_HOME:?Set DSH_HOME explicitly before installing}"
case "$DSH_HOME" in /*) ;; *) echo "DSH_HOME must be an absolute path" >&2; exit 2 ;; esac
PROFILE="${DSH_PROFILE:-}"
if [ "$#" -gt 0 ]; then
  if [ "$#" -ne 2 ] || [ "$1" != "--profile" ]; then
    echo "usage: DSH_HOME=/absolute/path $0 --profile PROFILE" >&2
    exit 2
  fi
  PROFILE="$2"
fi
case "$PROFILE" in ''|*[!a-zA-Z0-9_-]*) echo "Choose an explicit profile using --profile or DSH_PROFILE (letters, digits, _ and - only)" >&2; exit 2 ;; esac
PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
STORE=""
if [ -f "$PROFILE_DIR/node_modules/.modules.yaml" ]; then
  STORE="$(awk '/^storeDir:/{sub(/^storeDir:[[:space:]]*/, ""); print; exit}' "$PROFILE_DIR/node_modules/.modules.yaml")"
fi
if [ -z "$STORE" ]; then STORE="$(pnpm store path)"; fi
dsh plugin --profile "$PROFILE" remove dsh-response-meta --store-dir "$STORE" >/dev/null 2>&1 || true
dsh plugin --profile "$PROFILE" add "file:$PLUGIN_DIR" --store-dir "$STORE"
echo "installed in $PROFILE_DIR. Restart only its DSH Web instance to load it."

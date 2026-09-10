#!/usr/bin/env bash
# Install Toolbox.app into /Applications so it shows up in Launchpad and
# Spotlight like any other app.
#
# The bundle is ad-hoc signed (see bundle.macOS.signingIdentity in
# tauri.conf.json) because there is no Apple Developer ID here. That is enough
# for an app you build and install yourself: macOS only demands a notarised
# Developer ID signature for software that arrives with a quarantine flag, which
# is set on downloads, not on a local copy. This script strips any quarantine
# flag anyway, so installing from the DMG works the same way.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/src-tauri/target/release/bundle/macos/Toolbox.app"
DEST_DIR="${1:-/Applications}"
DEST="$DEST_DIR/Toolbox.app"

if [ ! -d "$SRC" ]; then
  echo "Toolbox.app not found. Build it first:  npm run build:app" >&2
  exit 1
fi

if ! codesign --verify --deep --strict "$SRC" 2>/dev/null; then
  echo "The bundle's signature is not valid; re-signing ad-hoc." >&2
  codesign --force --deep --sign - "$SRC"
fi

# Quit a running copy so the replacement is clean.
if pgrep -f "$DEST/Contents/MacOS/toolbox" >/dev/null 2>&1; then
  echo "Quitting the running Toolbox…"
  osascript -e 'tell application "Toolbox" to quit' >/dev/null 2>&1 || true
  sleep 1
fi

echo "Installing to $DEST"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"

# Quarantine is what triggers "unidentified developer" on first open.
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

# Let Launchpad and Spotlight notice it straight away.
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$DEST" >/dev/null 2>&1 || true

echo "Installed. Open it from Launchpad, Spotlight, or: open -a Toolbox"

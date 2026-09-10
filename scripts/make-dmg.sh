#!/usr/bin/env bash
# Build a distributable Toolbox.dmg.
#
# Tauri's own DMG bundler drives Finder through AppleScript to lay out the
# installer window. That needs macOS Automation permission for whatever terminal
# is running the build, and it times out with a bare "-1712" error when the
# permission has not been granted. This script produces the same installable
# image with hdiutil alone — no Finder, no permission prompt, no custom artwork.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/src-tauri/target/release/bundle/macos/Toolbox.app"
VERSION="$(node -p "require('$ROOT/package.json').version")"
ARCH="$(uname -m)"
OUT_DIR="$ROOT/src-tauri/target/release/bundle/dmg"
OUT="$OUT_DIR/Toolbox_${VERSION}_${ARCH}.dmg"

if [ ! -d "$APP" ]; then
  echo "Toolbox.app not found. Run: npm run tauri build -- --bundles app" >&2
  exit 1
fi

STAGE="$(mktemp -d)/Toolbox"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

mkdir -p "$OUT_DIR"
rm -f "$OUT"
hdiutil create -volname "Toolbox" -srcfolder "$STAGE" -ov -format UDZO "$OUT" >/dev/null
rm -rf "$(dirname "$STAGE")"

echo "Built $OUT ($(du -h "$OUT" | cut -f1))"

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
# TOOLBOX_TARGET picks a cross-compiled build, e.g. universal-apple-darwin (used by the release workflow).
TARGET_DIR="$ROOT/src-tauri/target${TOOLBOX_TARGET:+/$TOOLBOX_TARGET}/release"
APP="$TARGET_DIR/bundle/macos/Toolbox.app"
VERSION="$(node -p "require('$ROOT/package.json').version")"
case "${TOOLBOX_TARGET:-}" in
  universal-apple-darwin) ARCH="universal" ;;
  x86_64-apple-darwin) ARCH="x86_64" ;;
  aarch64-apple-darwin) ARCH="arm64" ;;
  *) ARCH="$(uname -m)" ;;
esac
OUT_DIR="$TARGET_DIR/bundle/dmg"
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

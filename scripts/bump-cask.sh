#!/usr/bin/env bash
# Point the Homebrew cask (github.com/Ale-Newport/homebrew-tap) at a published release.
#
#   scripts/bump-cask.sh            # the latest release
#   scripts/bump-cask.sh v0.2.0     # a specific tag
#
# Reads the DMG checksum from the release's SHA256SUMS.txt, rewrites
# Casks/toolbox.rb in a temporary clone of the tap, and pushes it with your own
# git identity. Needs `gh` signed in with push access to the tap.
set -euo pipefail

REPO="Ale-Newport/swapIT"
TAP="Ale-Newport/homebrew-tap"
TAG="${1:-$(gh release view -R "$REPO" --json tagName -q .tagName)}"
VERSION="${TAG#v}"
DMG="Toolbox_${VERSION}_universal.dmg"

SUMS="$(gh release download "$TAG" -R "$REPO" -p SHA256SUMS.txt -O - )"
SHA="$(printf '%s\n' "$SUMS" | awk -v f="$DMG" '$2 == f { print $1 }')"
if [[ ! "$SHA" =~ ^[0-9a-f]{64}$ ]]; then
  echo "No checksum for $DMG in $TAG's SHA256SUMS.txt — has the Release workflow finished?" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
gh repo clone "$TAP" "$WORK/tap" -- --quiet
CASK="$WORK/tap/Casks/toolbox.rb"
sed -i.bak -E "s/^  version \"[^\"]+\"/  version \"$VERSION\"/; s/^  sha256 \"[0-9a-f]+\"/  sha256 \"$SHA\"/" "$CASK"
rm -f "$CASK.bak"

if git -C "$WORK/tap" diff --quiet; then
  echo "The cask already points at $VERSION."
  exit 0
fi
git -C "$WORK/tap" commit -qam "Update toolbox to $VERSION"
git -C "$WORK/tap" push -q
echo "Cask updated to $VERSION ($SHA)."

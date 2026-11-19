# Changelog

All notable changes to Toolbox are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] — 2026-11-19

### Added

- **Homebrew:** `brew install --cask ale-newport/tap/toolbox` installs the universal
  app from the new [tap](https://github.com/Ale-Newport/homebrew-tap) and clears the
  quarantine flag so it opens normally (#4).
- **Web demo:** tools that need the Mac carry a "Mac app" tag on their cards and in the
  ⌘K palette, and open with a note and a download link instead of failing on the first
  file. Saving from a browser tool now downloads the file (#2).
- **DMG smoke test** workflow: after every release, the DMG is checksummed, installed,
  checked (universal binary, signature, version) and launched on an Apple Silicon and an
  Intel runner, and the Homebrew cask is installed the same way (#7).

### Changed

- About Toolbox and Finder's Get Info show the copyright and licence; the crate names
  its author (#1).
- The Barcode Generator loads 208 KB of JavaScript instead of 936 KB by bundling only
  the eight encoders it offers (#6).
- Installation instructions cover Homebrew and macOS 15, where right-click › Open no
  longer opens apps that are not notarised.
- Errors re-thrown by the JSON, YAML, XML, regex and PDF tools keep the original error
  as their `cause`.
- Dependencies: ESLint 10, Vitest 5, lucide-react 1, marked 18, jsdom 31 and the npm
  and Cargo minor/patch groups. js-yaml 5 (#30) and TypeScript 7 (not yet supported by
  typescript-eslint) are held back.

## [0.1.0] — 2026-11-19

First public release.

### Added

- **169 local tools** in one native macOS app (Tauri v2 + React 19 + Rust): file
  conversion, images, video, audio, PDF, QR codes and barcodes, SVG, text, developer
  utilities, files, generators, date and time, calculators, capture and OCR, clipboard.
- **Radial menu** — select files in Finder and press ⌃⌥Space for a ring of actions
  in native liquid glass; Option-drag, Quick Action, Dock and `toolbox://` deep links;
  *Create* ring (text and Markdown files, voice memos, screenshots, paste-as-file);
  watch folders.
- **Customisation** — recordable shortcuts, per-file-type rings, menu bar only mode,
  open at login.
- **Homebrew tool integration** — FFmpeg, ImageMagick, Ghostscript, Poppler, QPDF,
  Tesseract, Pandoc, LibreOffice and yt-dlp found even when the app starts from the
  Dock; PDF → Word via LibreOffice's PDF import filter.
- **The ring over full-screen apps**, as a non-activating panel.
- **Web demo** on GitHub Pages: the browser-capable tools running in the real UI.
- `npm run install:app` installs into /Applications; `npm run build:dmg` builds a
  disk image without Finder automation.
- Project infrastructure: MIT licence, CI (typecheck, lint, 3,100+ Vitest tests,
  Clippy, cargo test), CodeQL, dependency and secret scanning, Dependabot, release
  workflow that attaches a universal DMG, contribution guidelines.

### Security

- Upgraded `zip` 2 → 9 (RUSTSEC-2026-0367/0368/0369/0429/0545/0548), `tokio`, `rustix`,
  `vite`, `vitest`, `typescript-eslint` and `fast-xml-parser` to patched versions.
  Toolbox's own extraction never used the affected `extract()` APIs, but no flagged
  version remains in the dependency tree.
- Fixed exponential regex backtracking (ReDoS) found by CodeQL: pasting a crafted
  data URL into *Image from Base64*, or a crafted prologue into *XML Formatter*,
  could hang the tool.

[Unreleased]: https://github.com/Ale-Newport/swapIT/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Ale-Newport/swapIT/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Ale-Newport/swapIT/releases/tag/v0.1.0

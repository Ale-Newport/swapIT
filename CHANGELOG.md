# Changelog

All notable changes to Toolbox are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/Ale-Newport/swapIT/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Ale-Newport/swapIT/releases/tag/v0.1.0

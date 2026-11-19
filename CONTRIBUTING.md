# Contributing to Toolbox

Thanks for wanting to make Toolbox better! Bug reports, new tools, docs fixes and
design feedback are all welcome. This guide gets you from clone to pull request.

## Ground rules

- **Local first.** Files never leave the user's Mac. No telemetry, accounts or
  uploads — the only network request in the app is Media Downloader fetching the
  URL the user pastes.
- **No shell.** External programs are spawned with argument vectors, and any value
  that ends up as a flag is validated against an allow-list.
- **The shortest path from the file you have to the file you want.** Fewer clicks
  and clearer words beat more options.
- **English UI**, sentence case, friendly and specific error messages.

## Getting started

Requirements: macOS 11+, Node.js 20+, Rust stable (1.77+), Xcode command line tools.

```bash
git clone https://github.com/Ale-Newport/swapIT.git toolbox
cd toolbox
npm install
npm run tauri dev        # the full app with hot reload
```

Frontend-only work (most tools) is faster in the browser:

```bash
npm run dev              # http://localhost:1420
# or the same build that is published as the web demo:
npm run build:web && npm run preview:web
```

Optional external programs (FFmpeg, ImageMagick, Ghostscript, …) are listed in the
README. Tests that need them skip themselves when they are missing.

## Adding a tool

A tool is one folder with two files — no registry, no routes:

```
src/tools/<category>/<tool-id>/
  tool.ts   # defineTool({ id, name, description, category, icon, keywords, accepts, load })
  ui.tsx    # default-export a React component
```

Put pure logic in a `logic.ts` next to it and test it in `logic.test.ts`.
[docs/ADDING_TOOLS.md](docs/ADDING_TOOLS.md) documents the hooks, shared components and
every backend command. The radial menu is documented in [docs/RADIAL.md](docs/RADIAL.md).

## Before you open a pull request

```bash
npm run check:all        # typecheck, lint, Vitest, Clippy (-D warnings), cargo test
```

CI runs the same checks plus `npm audit`, `cargo audit`, CodeQL and a secret scan.
A pull request needs every check green **and an approving review from the
maintainer** (`.github/CODEOWNERS`) before it can be merged.

## Workflow

1. **Open or find an issue first** for anything bigger than a small fix, so we can
   agree on the approach. Issues labelled
   [`good first issue`](https://github.com/Ale-Newport/swapIT/labels/good%20first%20issue)
   are a good place to start.
2. **Fork** the repository and create a branch: `fix/heic-orientation`,
   `feat/pdf-crop`, `docs/install`.
3. Keep commits focused. Write messages in the imperative: *"Add PDF crop tool"*.
4. Add or update tests for what you changed, and a line in `CHANGELOG.md` under
   **Unreleased** if users will notice.
5. Open the pull request against `main` and fill in the template. Screenshots help
   a lot for UI changes.

Reviews usually happen within a few days. Thank you!

## Reporting bugs and security issues

Use the issue templates for bugs and ideas, and
[Discussions](https://github.com/Ale-Newport/swapIT/discussions) for questions.
**Security problems must be reported privately** — see [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE), and you confirm you have the right to submit them.

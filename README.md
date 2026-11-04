<div align="center">

# Toolbox

**A fast, local-first desktop toolkit for everyday file tasks.**

Convert HEIC to JPG, compress a PDF, pull the audio out of an MP4, generate a QR code,
optimise an SVG, format some JSON — without opening a browser tab, uploading a file,
or creating an account.

</div>

---

## What is Toolbox

Toolbox is a native macOS app that replaces the pile of single-purpose conversion
websites most of us keep re-googling. Every tool lives in one window, opens
instantly, and runs on your own machine.

The design goal is narrow and specific: **the shortest possible path from a file
you have to the file you want.** Drop a file on the window, pick an action, done —
usually in under three clicks.

- **Local first.** Files are processed on your Mac. Nothing is uploaded. The only
  tool that touches the network is Media Downloader, and only for the URL you paste.
- **No account, no login, no telemetry.** There is no server, no analytics, no crash
  reporting, no tracking of any kind.
- **Fast and small.** Tauri v2 rather than Electron: a small binary, low memory, and
  a cold start measured in a couple of hundred milliseconds. Tool code is lazily
  loaded — only the tool you open is parsed.
- **Batch by default.** Drag 300 HEIC files onto the converter and it converts 300
  files, with per-file progress and a cancel button that actually stops the encoder.
- **A radial menu at your cursor.** Select files in Finder, press ⌃⌥Space, and pick what
  to do from a ring of liquid glass — convert, compress, resize, OCR, zip, or create a
  note and record audio — without ever opening the app. See [Radial menu](#radial-menu).

## Features

| Category | What is in it |
| --- | --- |
| **File conversion** | A universal converter that inspects what you dropped and offers every format it can produce. |
| **Images** | Format conversion (HEIC, JPG, PNG, WebP, AVIF, TIFF, BMP, GIF, ICO), resize with social presets, compression with a target file size, visual crop, rotate and flip, padding, borders, rounded corners, drop shadows, watermarks, metadata viewing and stripping, contact sheets, palette extraction, colour picker, favicon and ICO generation, GIF frame splitting, Base64 in both directions. |
| **Video** | Convert between containers and codecs, compress with presets, trim on a visual timeline, crop, resize, change frame rate, speed and rotation, reverse, remove or extract audio, GIF export, frame extraction, thumbnails, merging, watermarks, full metadata. |
| **Audio** | Convert, compress, trim on a rendered waveform, merge, normalise to broadcast loudness, change volume, speed and pitch, downmix to mono, read and write tags including cover art, generate silence. |
| **PDF** | Merge, split, extract, delete, reorder and rotate pages with thumbnails; images to PDF; PDF to images, text or Word; compress; page numbers; watermarks; metadata; encryption and decryption; OCR. |
| **QR & barcodes** | A complete QR generator — URL, text, Wi-Fi, email, phone, SMS, WhatsApp, vCard, geo, calendar — with colours, gradients, module and eye styles, a centre logo, and an automatic scannability check that decodes what it just drew. Plus a scanner (file, clipboard or screenshot) and Code 128 / Code 39 / EAN / UPC / Data Matrix barcodes. |
| **SVG** | Viewer, optimiser (SVGO), raster and PDF export, formatter, minifier, colour replacer, dimension and viewBox editors, background adder, icon generator, and a small but real vector editor. |
| **Text** | Counters, case conversion, line operations, find and replace, regex replace, visual diff, JSON/XML/YAML formatting and validation, CSV viewer, Markdown preview and conversion, URL and Base64 encoding, HTML entities, Unicode inspector. |
| **Developer** | JSON ↔ YAML ↔ CSV ↔ XML, JWT decoder, hashes for text and files, timestamp converter, cron helper, regex tester, URL and query-string parsers, HTTP status and MIME references, ASCII table, base converter, colour converter with contrast ratios. |
| **Files** | Batch rename with live preview, duplicate finder, checksums, folder size analysis, metadata, flatten and organise folders, ZIP and TAR archives, file splitting and joining. |
| **Generators** | UUIDs, passwords with real entropy estimates, random numbers and dice, Lorem Ipsum, colours, palettes, gradients, clearly-fictional test data, placeholder images. |
| **Date & time** | Differences, arithmetic, Unix timestamps, time zones with a meeting planner, ISO 8601, human-readable durations. |
| **Calculators** | Percentages, aspect ratios, DPI, file sizes, bitrates, video and image size estimates, storage capacity, transfer times. |
| **Capture & OCR** | Screenshots that flow straight into the other tools, and offline OCR for images and scanned PDFs. |
| **Clipboard** | Optional local history, formatting cleanup, save clipboard text or images to disk. |
| **Radial menu** | A system-wide ring of one-click actions for whatever is selected in Finder (or dragged), plus *create* actions: new `.txt`/`.md`/`.json`/… files, voice memos, screenshots, paste-as-file, daily notes, QR codes — and watch folders that process files as they arrive. |

## Radial menu

The fastest path of all: **never open the app.**

| Do this | Get this |
| --- | --- |
| Select files in Finder, press **⌃⌥Space** | The ring opens at your cursor with the actions that fit those files. |
| Press **⌃⌥Space** with nothing selected | The *Create* ring: new text file, Markdown note, voice memo, screenshot, new folder, paste-as-file, daily note… saved in the folder of the front Finder window. |
| **Drag** files from anywhere while holding **⌥** | The ring appears under the cursor; drop on a petal. |
| Right-click ▸ **Quick Actions ▸ Open in Toolbox** | The same ring, from the context menu (install it in *Radial menu ▸ Finder*). |
| Finder ▸ **Open With ▸ Toolbox**, or drop on the Dock icon | The same ring. |
| **⌃⌥N** / **⌃⌥R** | Straight to *new Markdown note* / *record audio*. |
| `open "toolbox://radial?path=/some/file"` | Automation hook for Shortcuts, Raycast or scripts. |

**Using the ring.** It is deliberately small: **six petals at most**, and the first ring shows only what you most
likely want for *those* files (a photo: JPG, PNG, WebP, Compress, Resize, More). Anything else is one tap further
in — a petal marked `›` opens a smaller ring and the middle takes you back; there are no pages and nothing scrolls.
Click a petal or drop files on it; hold the shortcut, flick toward a petal and let go to choose without clicking;
`1`–`6` pick by number, the arrows walk the ring, `⎋` steps back and then closes. **Typing searches every action**,
including the ones no ring shows. A finished action collapses into a small pill under the menu bar with *Show*,
*Open* and *Undo*.

**What it leaves to Finder.** Opening, Quick Look, moving, duplicating, compressing, renaming, new folders and the
Trash are not on the ring: Finder's right-click menu already does them well, so the ring only offers what Finder can't.

**What is on it.** Conversions between every format the universal converter knows, compress/resize/rotate images,
compress/trim/mute video, normalise audio, merge or compress PDFs, OCR, QR scanning, colour palettes, checksums,
JSON ⇄ YAML/CSV/XML, Markdown → HTML/Word/EPUB — and the full app's other ~150 tools, found by typing and opened
with the files already loaded.

**Create from Finder.** *Text file*, *Markdown* (with meeting-notes, daily-note, to-do, README and blog-post
templates; the file is named after your first heading), 14 file types in all, *Record audio* (live waveform, pause,
M4A natively, MP3/WAV when FFmpeg is present), *Paste as file*, *Daily note*, *Text from screen* (drag over any text
and OCR copies it), *QR from clipboard*, and a few clipboard helpers (UUID, password, date).

**Watch folders.** Pick a folder and an action — "convert every new HEIC in Downloads to JPG",
"compress screenshots" — and it happens as files arrive, once they have finished writing. Results
go into a `Toolbox Output` folder inside, so nothing is ever processed twice.

**Liquid glass.** The blur behind the ring is the real macOS one (an `NSVisualEffectView` shaped like
the ring), with a specular bevel, rim light and a lens that glides between petals drawn on top.
Theme (follow macOS / light / dark), accent colour and glass strength are in *Radial menu ▸ Appearance*.

**Permissions** (all asked once, none required for the app's own tools):
*Automation ▸ Finder* — to read your selection and the front window's folder;
*Microphone* — for *Record audio*. The drag gesture watches mouse events only and needs nothing.

The overlay is a second, always-hidden window of the same app, so it appears instantly. Closing the
main window keeps Toolbox running in the menu bar so the shortcut keeps working (switch that off in
*Radial menu ▸ Staying available*). Architecture and the native contract: [docs/RADIAL.md](docs/RADIAL.md).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React 19 + TypeScript + Tailwind v4        (webview)   │
│                                                         │
│  ToolRegistry ──► auto-discovers src/tools/**/tool.ts   │
│       │            (metadata eager, components lazy)    │
│       ├──► Command palette, search index, drop-zone     │
│       │    suggestions, sidebar, category grids         │
│       └──► useToolFiles / useToolRun / OutputSettings   │
└───────────────────────────┬─────────────────────────────┘
                            │  Tauri IPC (typed commands)
┌───────────────────────────▼─────────────────────────────┐
│  Rust                                       (native)    │
│                                                         │
│  paths.rs     canonicalisation, sanitisation,           │
│               collision-free destinations               │
│  jobs.rs      job registry, cancellation, progress       │
│               events, subprocess execution (argv only)  │
│  binaries.rs  dependency discovery and version probing  │
│  cmd/*.rs     images, media, pdf, files, hashing,       │
│               archives, metadata, OCR, downloads        │
└───────────────────────────┬─────────────────────────────┘
                            │  argument vectors, never a shell
┌───────────────────────────▼─────────────────────────────┐
│  FFmpeg · ImageMagick · Ghostscript · Poppler · QPDF    │
│  Tesseract · Pandoc · LibreOffice · yt-dlp · sips       │
└─────────────────────────────────────────────────────────┘
```

Three ideas hold the app together:

**The registry.** Every tool is a folder with a `tool.ts` (metadata) and a `ui.tsx`
(component). `import.meta.glob` collects them at build time, so a new tool appears
in the sidebar, the grids, the search index and the drop-zone suggestions without a
single shared file being edited. Metadata is eager and tiny; components are code-split.

**The output policy lives in Rust.** Every destination path is computed by
`paths::resolve_destination`, which sanitises names, honours the collision policy,
and structurally cannot hand a tool its own input file to overwrite. Frontend tools
that produce their own bytes (PDF, QR, SVG) ask the backend for a path through
`plan_output` rather than building one.

**Jobs are cancellable.** Each run registers a job id; progress events stream back
from FFmpeg's `-progress` pipe and from batch loops. Cancelling sets a flag *and*
signals the child processes, so a stuck 4K encode stops immediately rather than
running to completion in the background.

## Requirements

- macOS 11 or later (Apple Silicon or Intel)
- Node.js 20+ and Rust 1.77+ to build from source

Many tools work with no external programs at all — image conversion uses a pure-Rust
engine plus macOS's built-in `sips` for HEIC. The rest are installed with Homebrew:

```bash
brew install ffmpeg imagemagick ghostscript poppler qpdf exiftool tesseract tesseract-lang pandoc yt-dlp
brew install --cask libreoffice   # only for Word ↔ PDF
```

Toolbox never installs anything itself. Settings › Advanced shows what is present,
what is missing, each version, and the exact command to install it — or you can point
it at a binary elsewhere on disk.

## Installation

```bash
git clone <this repo> toolbox
cd toolbox
npm install
npm run install:app
```

That builds `Toolbox.app` (about 10 MB) and installs it into `/Applications`, where
it appears in **Launchpad** and Spotlight like any other app — double-click the icon
and it opens, no warning. Re-run the same command to update it.

To build a shareable disk image instead:

```bash
npm run build:dmg
```

| Command | Result |
| --- | --- |
| `npm run build:app` | `src-tauri/target/release/bundle/macos/Toolbox.app` |
| `npm run install:app` | The above, installed into `/Applications` |
| `npm run build:dmg` | `src-tauri/target/release/bundle/dmg/Toolbox_<version>_<arch>.dmg` |

### About signing

There is no Apple Developer ID here, so the bundle is **ad-hoc signed**
(`bundle.macOS.signingIdentity: "-"` in `tauri.conf.json`). Without that setting
Tauri leaves only a partial linker signature — `Info.plist` unbound, no sealed
resources — which fails `codesign --verify` and can stop the app opening.

One consequence: macOS ties its privacy permissions (Automation ▸ Finder, Microphone) to the app's
code signature, and an ad-hoc signature is different for every build. After you rebuild and reinstall,
macOS may ask for those permissions again — that is the system working as designed, not a bug. A
Developer ID signature (see below) makes them stick.

Ad-hoc signing is enough for an app you build and install yourself: macOS only
insists on a notarised Developer ID signature for software that arrives carrying a
**quarantine** flag, and that flag is set on downloads, not on a local copy.
`scripts/install-app.sh` strips it regardless.

If you copy the `.dmg` to another Mac and open it there, the app *will* be
quarantined and macOS will refuse it on first launch. Either right-click the app and
choose **Open** (then confirm once), or clear the flag:

```bash
xattr -dr com.apple.quarantine /Applications/Toolbox.app
```

Notarising properly would need a paid Apple Developer account; set
`APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID` and Tauri will do it during
`build:app`.

`npm run tauri build` on its own builds only the `.app`. The DMG is a separate script
on purpose: Tauri's own DMG bundler lays out the installer window by driving Finder
through AppleScript, which needs macOS Automation permission for whichever terminal
runs the build and fails with an opaque `-1712` timeout without it.
`scripts/make-dmg.sh` produces the same installable image with `hdiutil` alone.

## Development

```bash
npm install
npm run tauri dev
```

Frontend-only work can skip the Rust build with `npm run dev`, though anything that
calls a backend command needs the full app.

| Command | What it does |
| --- | --- |
| `npm run tauri dev` | Run the app with hot reload |
| `npm run build:app` | Produce `Toolbox.app` |
| `npm run install:app` | Build and install into `/Applications` (Launchpad) |
| `npm run build:dmg` | Produce `Toolbox.app` and a `.dmg` installer |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run rust:clippy` | Clippy with warnings as errors |
| `npm run rust:test` | Rust unit tests |
| `npm run dev` → `/#/radial-demo` | Browser preview of the radial overlay with mocked IPC (dev builds only) |
| `npm run check:all` | All of the above |
| `node scripts/generate-icons.mjs` | Rebuild the curated lucide icon map |

## Dependencies

| Program | Used for | Required? |
| --- | --- | --- |
| FFmpeg / FFprobe | All video and audio work | For video and audio tools |
| ImageMagick | HEIC/AVIF encoding, lossy WebP, SVG rasterising | Optional — the Rust engine and `sips` cover most images |
| Ghostscript | PDF compression | For Compress PDF |
| Poppler | PDF to image/text, page previews, PDF info | For those PDF tools |
| QPDF | PDF encryption and decryption | For those two tools |
| Tesseract | Offline OCR | For OCR |
| ExifTool | Deep metadata beyond EXIF | Optional |
| Pandoc | Markup and document conversion | Optional |
| LibreOffice | Word ↔ PDF | For those two tools |
| yt-dlp | Media Downloader | For that one tool |

A tool that needs a missing program says so on its own page, with the install
command and a Check again button — it never fails silently or half-works.

## Adding a new tool

One folder, two files, no other edits:

```
src/tools/images/my-tool/
  tool.ts   # defineTool({ id, name, description, category, icon, keywords, accepts, load })
  ui.tsx    # default-export a component
```

`docs/ADDING_TOOLS.md` has the full contract: the hooks, the shared components, the
complete list of backend commands, and the rules. There is deliberately no registry
file to edit and no route to add.

## Security

Toolbox reads files you point it at and runs external encoders on them, so the
boundary is taken seriously:

- **No shell, ever.** External programs are spawned with an argument vector
  (`Command::new(bin).args([...])`). A file called `; rm -rf ~` is just a filename.
- **Inputs are canonicalised** before use and must resolve to a real file.
- **Output paths are sanitised** to a single path component, with traversal
  sequences and path separators stripped.
- **Nothing is overwritten silently.** The default collision policy renames; even
  the explicit overwrite policy refuses to write to the file currently being read.
- **Archive extraction rejects Zip Slip** — any entry that would escape the
  destination directory is refused, and each entry name is sanitised.
- **The webview has a strict CSP** and no remote script origins.
- **User input never becomes a command flag.** Format names, language codes,
  quality presets and format ids are validated against allow-lists before being
  forwarded to FFmpeg, Ghostscript, Tesseract or yt-dlp.
- **DRM is refused, not circumvented.** Media Downloader blocks known DRM services
  outright and surfaces yt-dlp's own DRM errors rather than trying to work around
  access controls.

Run `npm run rust:clippy` and `npm run rust:test` before shipping changes to the
backend; the path and archive safety properties are covered by unit tests.

## Privacy

**Your files stay on your device.**

- No analytics, no telemetry, no crash reporting, no trackers.
- No account, no login, no cloud sync.
- The optional Recent history stores tool names, file *names* and output folders —
  never file contents, passwords or tokens. It can be turned off and cleared.
- Clipboard history is **off by default** and stored only in local storage.
- The only outbound network request the app makes is Media Downloader fetching the
  URL you paste.

## Licence

Personal project. The external programs it drives keep their own licences
(FFmpeg LGPL/GPL, ImageMagick Apache-2.0, Ghostscript AGPL, Poppler GPL,
Tesseract Apache-2.0, QPDF Apache-2.0, yt-dlp Unlicense).

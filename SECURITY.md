# Security policy

Toolbox opens files you point it at and runs external encoders on them, so it is
built to treat every file name and file as untrusted input. Thank you for helping
keep it that way.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest release and `main` | ✅ |
| Anything older | ❌ — please update first |

## Reporting a vulnerability

**Please do not open a public issue.** Report it privately through
[GitHub private vulnerability reporting](https://github.com/Ale-Newport/swapIT/security/advisories/new)
(Security tab › *Report a vulnerability*).

Include what you can of:

- the tool or command involved, and the input that triggers the problem
  (a minimal sample file is ideal),
- what an attacker gains — reading or writing files outside the chosen folder,
  running a command, script execution in the webview, and so on,
- your macOS version and the Toolbox version or commit.

You can expect an acknowledgement within **3 days** and an assessment within
**10 days**. Fixes for confirmed issues are released as soon as they are ready,
with credit in the release notes unless you would rather stay anonymous.

## Scope

In scope: the Toolbox app (`src/`, `src-tauri/`), its build and release scripts,
and the GitHub Actions workflows in this repository.

Out of scope: vulnerabilities in FFmpeg, ImageMagick, Ghostscript, LibreOffice,
yt-dlp or other programs Toolbox drives — please report those upstream. If
Toolbox makes such a bug *reachable* in a way it should not (for example by
passing user input as a flag), that is in scope.

## How Toolbox is hardened

- **No shell.** External programs are spawned with argument vectors
  (`Command::new(bin).args(...)`); file names are never interpreted.
- **Allow-listed options.** Formats, codecs, languages and presets are checked
  against allow-lists before they reach any external program.
- **Path safety.** Inputs are canonicalised; output names are sanitised to a single
  path component; the output policy cannot overwrite the file being read.
- **Archive extraction** rejects absolute paths and `..` traversal (Zip Slip) and
  writes regular files only — symlinks and permission bits in archives are ignored.
- **Webview.** A strict Content Security Policy (`script-src 'self'`, no remote
  origins), and Markdown/HTML previews pass through an allow-list sanitiser.
- **No network** except Media Downloader fetching the URL you paste. No telemetry.
- **Supply chain.** Dependabot, `npm audit`, `cargo audit`, CodeQL, gitleaks and
  dependency review run in CI; GitHub Actions are pinned to commit SHAs and run with
  read-only tokens by default.

//! Small filesystem and Finder helpers used by the radial menu: create, duplicate,
//! move, trash, clipboard, icons. See `docs/RADIAL.md` §6 for the contract.
//!
//! Everything here is Finder-polite: names are numbered like Finder does, nothing is
//! overwritten, and nothing is deleted for good (the Trash is the only way out).
//!
//! macOS integration goes through `osascript -l JavaScript` (JXA, which bridges straight
//! into AppKit/Foundation) rather than extra Rust bindings: `NSFileManager` for the
//! Trash, `NSPasteboard` for the clipboard, `NSWorkspace` for icons and wallpaper. Paths
//! always travel as separate argv items — they are never spliced into script text and
//! never go through a shell — and every path must be absolute, so none can start with
//! `-` and be mistaken for an option.

use crate::error::{AppError, AppResult, ErrorKind};
use crate::paths::{self, Disposition};
use crate::types::{now_ms, BatchResult, FileResult};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

// ------------------------------------------------------------------ paths and names

/// Reject anything that is not a plain absolute path.
fn abs_path(raw: &str) -> AppResult<PathBuf> {
    if raw.trim().is_empty() {
        return Err(AppError::invalid("No path was provided."));
    }
    if raw.contains('\0') {
        return Err(AppError::invalid("That path is not valid."));
    }
    let p = PathBuf::from(raw);
    if !p.is_absolute() {
        return Err(AppError::invalid(format!("“{raw}” is not an absolute path.")));
    }
    Ok(paths::normalize(&p))
}

/// True when *something* is at `p`, including a dangling symlink.
fn occupied(p: &Path) -> bool {
    fs::symlink_metadata(p).is_ok()
}

fn existing_item(raw: &str) -> AppResult<PathBuf> {
    let p = abs_path(raw)?;
    if !occupied(&p) {
        return Err(AppError::not_found(format!("“{}” is no longer on disk.", paths::display_name(&p))));
    }
    Ok(p)
}

fn existing_items(raw: &[String]) -> AppResult<Vec<PathBuf>> {
    if raw.is_empty() {
        return Err(AppError::invalid("Select at least one file first."));
    }
    raw.iter().map(|p| existing_item(p)).collect()
}

fn existing_dir(raw: &str) -> AppResult<PathBuf> {
    let p = abs_path(raw)?;
    paths::validate_input_dir(&p.to_string_lossy())
}

/// An extension is a short run of letters and digits; "Mr. Smith" has none.
fn is_extension(ext: &str) -> bool {
    !ext.is_empty() && ext.len() <= 12 && ext.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'+' || b == b'-')
}

const MULTI_EXTS: &[&str] = &[".tar.gz", ".tar.bz2", ".tar.xz", ".tar.zst", ".tar.lz", ".tar.z"];

/// Split a file name into stem and extension the way Finder does: folders have no
/// extension, dotfiles keep their dot, and `.tar.gz` is one extension.
fn split_name(name: &str, is_dir: bool) -> (String, String) {
    if is_dir {
        return (name.to_string(), String::new());
    }
    let lower = name.to_ascii_lowercase();
    for multi in MULTI_EXTS {
        if lower.len() > multi.len() && lower.ends_with(multi) {
            let cut = name.len() - multi.len();
            return (name[..cut].to_string(), name[cut + 1..].to_string());
        }
    }
    match name.rfind('.') {
        Some(i) if i > 0 && is_extension(&name[i + 1..]) => (name[..i].to_string(), name[i + 1..].to_string()),
        _ => (name.to_string(), String::new()),
    }
}

fn join_name(stem: &str, ext: &str) -> String {
    if ext.is_empty() {
        stem.to_string()
    } else {
        format!("{stem}.{ext}")
    }
}

/// `Untitled`, `Untitled 2`, `Untitled 3` …
fn numbered_name(stem: &str, ext: &str, n: u32) -> String {
    if n <= 1 {
        join_name(stem, ext)
    } else {
        join_name(&format!("{stem} {n}"), ext)
    }
}

/// `report copy`, `report copy 2`, `report copy 3` …
fn copy_name(base: &str, ext: &str, n: u32) -> String {
    if n <= 1 {
        join_name(&format!("{base} copy"), ext)
    } else {
        join_name(&format!("{base} copy {n}"), ext)
    }
}

/// `report copy 2` → `report`, so duplicating a copy numbers on instead of nesting.
fn strip_copy_suffix(stem: &str) -> &str {
    let stripped = if let Some(rest) = stem.strip_suffix(" copy") {
        rest
    } else if let Some(i) = stem.rfind(" copy ") {
        let tail = &stem[i + 6..];
        if !tail.is_empty() && tail.bytes().all(|b| b.is_ascii_digit()) {
            &stem[..i]
        } else {
            stem
        }
    } else {
        stem
    };
    if stripped.trim().is_empty() {
        stem
    } else {
        stripped
    }
}

/// A user-supplied name as one safe path component. A single leading dot is kept
/// (`.env`, `.gitignore`); `..` and separators never survive.
fn safe_component(raw: &str, fallback: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return fallback.to_string();
    }
    let mut chars = trimmed.chars();
    if chars.next() == Some('.') {
        if let Some(second) = chars.next() {
            if second != '.' && second != '/' && second != '\\' {
                return format!(".{}", paths::sanitize_filename(&trimmed[1..]));
            }
        }
    }
    paths::sanitize_filename(trimmed)
}

fn clean_ext(raw: &str) -> String {
    raw.trim()
        .trim_start_matches('.')
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '+' | '-'))
        .take(16)
        .collect()
}

const MAX_NUMBERED: u32 = 10_000;

/// Atomically claim a brand-new file named like Finder would (`stem.ext`, `stem 2.ext` …).
/// `create_new` means two racing callers can never get the same name.
fn create_unique_file(dir: &Path, stem: &str, ext: &str, executable: bool) -> io::Result<(fs::File, PathBuf, bool)> {
    for n in 1..=MAX_NUMBERED {
        let candidate = dir.join(numbered_name(stem, ext, n));
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(if executable { 0o777 } else { 0o666 });
        }
        #[cfg(not(unix))]
        let _ = executable;
        match opts.open(&candidate) {
            Ok(file) => return Ok((file, candidate, n > 1)),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(io::ErrorKind::AlreadyExists, "Too many files with that name."))
}

fn create_unique_dir(dir: &Path, name: &str) -> io::Result<(PathBuf, bool)> {
    for n in 1..=MAX_NUMBERED {
        let candidate = dir.join(numbered_name(name, "", n));
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok((candidate, n > 1)),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(io::ErrorKind::AlreadyExists, "Too many folders with that name."))
}

fn disposition(renamed: bool) -> Disposition {
    if renamed {
        Disposition::Renamed
    } else {
        Disposition::Created
    }
}

// ------------------------------------------------------------------ process helpers

struct Captured {
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

/// Run a command to completion with a deadline, draining both pipes so a chatty child
/// can never block on a full buffer.
fn run_capture(mut cmd: Command, timeout: Duration) -> io::Result<Captured> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn()?;
    let mut out = child.stdout.take();
    let mut err = child.stderr.take();
    let reader_out = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(o) = out.as_mut() {
            let _ = o.read_to_end(&mut buf);
        }
        buf
    });
    let reader_err = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(e) = err.as_mut() {
            let _ = e.read_to_end(&mut buf);
        }
        buf
    });
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break Some(status);
        }
        if started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        std::thread::sleep(Duration::from_millis(12));
    };
    let stdout = reader_out.join().unwrap_or_default();
    let stderr = reader_err.join().unwrap_or_default();
    match status {
        Some(status) => Ok(Captured {
            code: status.code(),
            stdout: String::from_utf8_lossy(&stdout).into_owned(),
            stderr: String::from_utf8_lossy(&stderr).into_owned(),
        }),
        None => Err(io::Error::new(io::ErrorKind::TimedOut, "The helper program took too long.")),
    }
}

/// Run a JXA script. `args` become the script's `argv`.
#[cfg(target_os = "macos")]
fn jxa(script: &str, args: &[String], what: &str) -> AppResult<String> {
    let mut cmd = Command::new("/usr/bin/osascript");
    cmd.arg("-l").arg("JavaScript").arg("-e").arg(script).args(args);
    let out = run_capture(cmd, Duration::from_secs(30)).map_err(|e| {
        AppError::with_details(ErrorKind::Process, format!("{what} did not finish."), e.to_string())
    })?;
    if out.code != Some(0) {
        return Err(AppError::with_details(ErrorKind::Process, format!("{what} failed."), out.stderr.trim().to_string()));
    }
    Ok(out.stdout.trim_end_matches('\n').to_string())
}

#[cfg(not(target_os = "macos"))]
fn jxa(_script: &str, _args: &[String], what: &str) -> AppResult<String> {
    Err(AppError::unsupported(format!("{what} is only available on macOS.")))
}

fn path_arg(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

// ------------------------------------------------------------------ atomic rename and copy

/// Rename without ever replacing something that is already there.
#[cfg(target_os = "macos")]
fn rename_noreplace(from: &Path, to: &Path) -> io::Result<()> {
    use std::ffi::CString;
    use std::os::raw::{c_char, c_int, c_uint};
    use std::os::unix::ffi::OsStrExt;
    extern "C" {
        fn renamex_np(from: *const c_char, to: *const c_char, flags: c_uint) -> c_int;
    }
    const RENAME_EXCL: c_uint = 0x0000_0004;
    const ENOTSUP: i32 = 45;
    let invalid = |_| io::Error::new(io::ErrorKind::InvalidInput, "Path contains a NUL byte.");
    let f = CString::new(from.as_os_str().as_bytes()).map_err(invalid)?;
    let t = CString::new(to.as_os_str().as_bytes()).map_err(invalid)?;
    // SAFETY: both pointers are valid NUL-terminated strings that outlive the call.
    let rc = unsafe { renamex_np(f.as_ptr(), t.as_ptr(), RENAME_EXCL) };
    if rc == 0 {
        return Ok(());
    }
    let err = io::Error::last_os_error();
    if err.raw_os_error() == Some(ENOTSUP) {
        // This filesystem has no exclusive rename; the check is racy but still correct in practice.
        if occupied(to) {
            return Err(io::Error::from(io::ErrorKind::AlreadyExists));
        }
        return fs::rename(from, to);
    }
    Err(err)
}

#[cfg(not(target_os = "macos"))]
fn rename_noreplace(from: &Path, to: &Path) -> io::Result<()> {
    if occupied(to) {
        return Err(io::Error::from(io::ErrorKind::AlreadyExists));
    }
    fs::rename(from, to)
}

const EXDEV: i32 = 18;

/// Copy a file or folder tree to a path that does not exist yet. On macOS this is
/// `cp -cRp`: APFS clones when it can, and tags, xattrs and permissions come along.
#[cfg(target_os = "macos")]
fn copy_item(src: &Path, dst: &Path) -> AppResult<()> {
    let out = Command::new("/bin/cp")
        .args(["-cRpn", "--"])
        .arg(src)
        .arg(dst)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| AppError::with_details(ErrorKind::Process, "Could not start the copy.", e.to_string()))?;
    if !out.status.success() {
        return Err(AppError::with_details(
            ErrorKind::Io,
            format!("Could not copy “{}”.", paths::display_name(src)),
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn copy_item(src: &Path, dst: &Path) -> AppResult<()> {
    fn walk(src: &Path, dst: &Path) -> io::Result<()> {
        let meta = fs::symlink_metadata(src)?;
        if meta.file_type().is_symlink() {
            #[cfg(unix)]
            std::os::unix::fs::symlink(fs::read_link(src)?, dst)?;
        } else if meta.is_dir() {
            fs::create_dir(dst)?;
            for entry in fs::read_dir(src)? {
                let entry = entry?;
                walk(&entry.path(), &dst.join(entry.file_name()))?;
            }
            fs::set_permissions(dst, meta.permissions())?;
        } else {
            fs::copy(src, dst)?;
        }
        Ok(())
    }
    if occupied(dst) {
        return Err(AppError::invalid("The copy already exists."));
    }
    walk(src, dst).map_err(AppError::from)
}

fn remove_source(path: &Path) -> io::Result<()> {
    let meta = fs::symlink_metadata(path)?;
    if meta.is_dir() && !meta.file_type().is_symlink() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

/// Move `src` into `dest_dir` under a free name; never replaces anything.
fn move_item(src: &Path, dest_dir: &Path) -> AppResult<FileResult> {
    let name = src
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| AppError::invalid("That path has no file name."))?;
    let meta = fs::symlink_metadata(src)
        .map_err(|e| AppError::with_details(ErrorKind::NotFound, format!("“{name}” is no longer on disk."), e.to_string()))?;
    let is_dir = meta.is_dir() && !meta.file_type().is_symlink();
    let src_parent = fs::canonicalize(src.parent().unwrap_or(Path::new("/")))?;
    let src_ident = src_parent.join(&name);
    let dest = fs::canonicalize(dest_dir)?;
    if dest.starts_with(&src_ident) {
        return Err(AppError::invalid(format!("“{name}” cannot be moved into itself.")));
    }
    if src_parent == dest {
        return Ok(FileResult::new(&src_ident, Disposition::Skipped).with_note("Already in that folder"));
    }
    let (stem, ext) = split_name(&name, is_dir);
    for n in 1..=MAX_NUMBERED {
        let target = dest.join(numbered_name(&stem, &ext, n));
        if occupied(&target) {
            continue;
        }
        match rename_noreplace(src, &target) {
            Ok(()) => return Ok(FileResult::new(&target, disposition(n > 1))),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) if e.raw_os_error() == Some(EXDEV) => {
                // Another volume: copy, then remove the original only once the copy is whole.
                if let Err(err) = copy_item(src, &target) {
                    if occupied(&target) {
                        let _ = remove_source(&target);
                    }
                    return Err(err);
                }
                remove_source(src)?;
                return Ok(FileResult::new(&target, disposition(n > 1)));
            }
            Err(e) => {
                return Err(AppError::with_details(ErrorKind::Io, format!("Could not move “{name}”."), e.to_string()));
            }
        }
    }
    Err(AppError::invalid(format!("Too many items named “{name}” in that folder.")))
}

// ------------------------------------------------------------------ create

#[tauri::command(async)]
pub fn create_text_file(
    dir: String,
    name: String,
    ext: String,
    content: String,
    executable: Option<bool>,
) -> AppResult<FileResult> {
    let dir = existing_dir(&dir)?;
    let ext = clean_ext(&ext);
    let mut stem = safe_component(&name, "Untitled");
    // "notes.md" with ext "md" is "notes.md", not "notes.md.md".
    if !ext.is_empty() {
        let suffix = format!(".{ext}");
        if stem.len() > suffix.len() && stem.to_ascii_lowercase().ends_with(&suffix.to_ascii_lowercase()) {
            stem.truncate(stem.len() - suffix.len());
        }
    }
    let (mut file, path, renamed) = create_unique_file(&dir, &stem, &ext, executable.unwrap_or(false))?;
    if let Err(e) = file.write_all(content.as_bytes()).and_then(|_| file.flush()) {
        drop(file);
        let _ = fs::remove_file(&path); // our own half-written file
        return Err(AppError::with_details(ErrorKind::Io, "Could not write the file.", e.to_string()));
    }
    Ok(FileResult::new(&path, disposition(renamed)))
}

#[tauri::command(async)]
pub fn create_folder(dir: String, name: String, move_into: Option<Vec<String>>) -> AppResult<BatchResult> {
    let started = now_ms();
    let dir = existing_dir(&dir)?;
    let name = safe_component(&name, "untitled folder");
    let items = match move_into {
        Some(list) if !list.is_empty() => existing_items(&list)?,
        _ => Vec::new(),
    };
    let (folder, renamed) = create_unique_dir(&dir, &name)?;
    let mut batch = BatchResult::default();
    batch.results.push(FileResult::new(&folder, disposition(renamed)));
    for item in items {
        match move_item(&item, &folder) {
            Ok(res) => batch.results.push(res),
            Err(e) => batch.push_failure(&item, e),
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

// ------------------------------------------------------------------ trash, duplicate, move

const PROTECTED_HOME_DIRS: &[&str] = &[
    "Desktop", "Documents", "Downloads", "Library", "Movies", "Music", "Pictures", "Public", "Applications",
];
const PROTECTED_PREFIXES: &[&str] = &["/System", "/usr", "/bin", "/sbin", "/etc", "/dev", "/cores", "/private/etc"];

/// Places that are never something a person means to trash from a radial menu.
fn is_protected(p: &Path) -> bool {
    if p.components().count() <= 2 {
        return true; // "/" or a direct child of it: /Users, /Applications, /Library …
    }
    if p.starts_with("/Volumes") && p.components().count() <= 3 {
        return true; // a mounted volume itself
    }
    if PROTECTED_PREFIXES.iter().any(|prefix| p.starts_with(prefix)) {
        return true;
    }
    if let Some(home) = dirs::home_dir() {
        if p == home {
            return true;
        }
        if p.parent() == Some(home.as_path()) {
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                if PROTECTED_HOME_DIRS.contains(&name) {
                    return true;
                }
            }
        }
    }
    false
}

const TRASH_JS: &str = r#"
ObjC.import('Foundation');
function run(argv) {
  const fm = $.NSFileManager.defaultManager;
  const failed = [];
  let moved = 0;
  for (const p of argv) {
    const url = $.NSURL.fileURLWithPath(p);
    const ok = fm.trashItemAtURLResultingItemURLError(url, Ref(), Ref());
    if (ok) moved += 1; else failed.push(p);
  }
  return JSON.stringify({ moved: moved, failed: failed });
}
"#;

#[derive(Deserialize)]
struct TrashReport {
    moved: usize,
    failed: Vec<String>,
}

/// Move items to the Trash via `NSFileManager.trashItemAtURL` (what Finder uses; needs no
/// Automation permission). Returns how many made it; errors only when none did.
#[tauri::command(async)]
pub fn trash_paths(paths: Vec<String>) -> AppResult<usize> {
    let items = existing_items(&paths)?;
    if let Some(blocked) = items.iter().find(|p| is_protected(p)) {
        return Err(AppError::invalid(format!(
            "“{}” is a system or personal folder and will not be moved to the Trash from here.",
            paths::display_name(blocked)
        )));
    }
    let args: Vec<String> = items.iter().map(|p| path_arg(p)).collect();
    let raw = jxa(TRASH_JS, &args, "Moving to the Trash")?;
    let report: TrashReport = serde_json::from_str(&raw)
        .map_err(|e| AppError::with_details(ErrorKind::Internal, "Unexpected reply from the Trash helper.", e.to_string()))?;
    if report.moved == 0 {
        return Err(AppError::with_details(
            ErrorKind::Io,
            "Could not move the selection to the Trash. You may not have permission to change that folder.",
            report.failed.join("\n"),
        ));
    }
    Ok(report.moved)
}

#[tauri::command(async)]
pub fn duplicate_paths(paths: Vec<String>) -> AppResult<BatchResult> {
    let started = now_ms();
    let items = existing_items(&paths)?;
    let mut batch = BatchResult::default();
    for src in items {
        match duplicate_one(&src) {
            Ok(res) => batch.results.push(res),
            Err(e) => batch.push_failure(&src, e),
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

fn duplicate_one(src: &Path) -> AppResult<FileResult> {
    let parent = src.parent().ok_or_else(|| AppError::invalid("That item has no parent folder."))?;
    let name = paths::display_name(src);
    let meta = fs::symlink_metadata(src)?;
    let (stem, ext) = split_name(&name, meta.is_dir() && !meta.file_type().is_symlink());
    let base = strip_copy_suffix(&stem).to_string();
    copy_into(src, parent, &base, &ext)
}

/// Copy `src` into `dir` as `base copy[ N].ext`, using the first name nothing occupies.
fn copy_into(src: &Path, dir: &Path, base: &str, ext: &str) -> AppResult<FileResult> {
    for n in 1..=MAX_NUMBERED {
        let target = dir.join(copy_name(base, ext, n));
        if occupied(&target) {
            continue;
        }
        copy_item(src, &target)?;
        return Ok(FileResult::from_source(&target, src, disposition(n > 1)));
    }
    Err(AppError::invalid("Too many copies of that item already exist."))
}

#[tauri::command(async)]
pub fn move_paths(paths: Vec<String>, dest_dir: String) -> AppResult<BatchResult> {
    let started = now_ms();
    let dest = existing_dir(&dest_dir)?;
    let items = existing_items(&paths)?;
    let mut batch = BatchResult::default();
    for src in items {
        match move_item(&src, &dest) {
            Ok(res) => batch.results.push(res),
            Err(e) => batch.push_failure(&src, e),
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

// ------------------------------------------------------------------ Finder and apps

#[tauri::command(async)]
pub fn reveal_many(paths: Vec<String>) -> AppResult<()> {
    let items = existing_items(&paths)?;
    let mut cmd = Command::new("/usr/bin/open");
    cmd.arg("-R").arg("--").args(&items);
    run_open(cmd, "Showing the files in Finder")
}

/// Build the `open` argument vector. A bundle id uses `-b`, an app name or `.app` path `-a`.
fn open_with_args(items: &[PathBuf], app: Option<&str>) -> AppResult<Vec<std::ffi::OsString>> {
    let mut args: Vec<std::ffi::OsString> = Vec::new();
    if let Some(app) = app.map(str::trim).filter(|a| !a.is_empty()) {
        if app.starts_with('-') || app.contains('\0') {
            return Err(AppError::invalid("That application name is not valid."));
        }
        let looks_like_bundle_id = !app.contains('/')
            && !app.contains(' ')
            && !app.to_ascii_lowercase().ends_with(".app")
            && app.matches('.').count() >= 2;
        args.push(if looks_like_bundle_id { "-b".into() } else { "-a".into() });
        args.push(app.into());
    }
    args.push("--".into());
    args.extend(items.iter().map(|p| p.as_os_str().to_owned()));
    Ok(args)
}

#[tauri::command(async)]
pub fn open_with(paths: Vec<String>, app: Option<String>) -> AppResult<()> {
    let items = existing_items(&paths)?;
    let args = open_with_args(&items, app.as_deref())?;
    let mut cmd = Command::new("/usr/bin/open");
    cmd.args(args);
    run_open(cmd, "Opening the files")
}

fn run_open(cmd: Command, what: &str) -> AppResult<()> {
    let out = run_capture(cmd, Duration::from_secs(15))
        .map_err(|e| AppError::with_details(ErrorKind::Process, format!("{what} did not finish."), e.to_string()))?;
    if out.code != Some(0) {
        return Err(AppError::with_details(ErrorKind::Process, format!("{what} failed."), out.stderr.trim().to_string()));
    }
    Ok(())
}

static QUICK_LOOK: Mutex<Option<Child>> = Mutex::new(None);

fn stop_quick_look() {
    if let Ok(mut guard) = QUICK_LOOK.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[tauri::command(async)]
pub fn quick_look(paths: Vec<String>) -> AppResult<()> {
    let items = existing_items(&paths)?;
    stop_quick_look();
    let child = Command::new("/usr/bin/qlmanage")
        .arg("-p")
        .args(&items)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| AppError::with_details(ErrorKind::MissingDependency, "Quick Look is not available.", e.to_string()))?;
    if let Ok(mut guard) = QUICK_LOOK.lock() {
        *guard = Some(child);
    }
    Ok(())
}

#[tauri::command]
pub fn quick_look_close() {
    stop_quick_look();
}

const DESKTOP_JS: &str = r#"
ObjC.import('AppKit');
function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const ws = $.NSWorkspace.sharedWorkspace;
  const screens = $.NSScreen.screens;
  const n = ObjC.unwrap(screens.count);
  let done = 0;
  for (let i = 0; i < n; i++) {
    if (ws.setDesktopImageURLForScreenOptionsError(url, screens.objectAtIndex(i), $({}), Ref())) done += 1;
  }
  return String(done);
}
"#;

const WALLPAPER_EXTS: &[&str] = &["jpg", "jpeg", "png", "heic", "heif", "gif", "tif", "tiff", "bmp", "webp"];

/// Set the picture on every display with `NSWorkspace` — the supported API, which also
/// works with per-Space wallpapers (the old Finder `set desktop picture` does not).
#[tauri::command(async)]
pub fn set_desktop_picture(path: String) -> AppResult<()> {
    let file = abs_path(&path)?;
    let meta = fs::metadata(&file)
        .map_err(|e| AppError::with_details(ErrorKind::NotFound, "That picture is no longer on disk.", e.to_string()))?;
    if !meta.is_file() || !WALLPAPER_EXTS.contains(&paths::extension(&file).as_str()) {
        return Err(AppError::invalid("Only image files can be used as the desktop picture."));
    }
    let done = jxa(DESKTOP_JS, &[path_arg(&file)], "Setting the desktop picture")?;
    if done.trim() == "0" {
        return Err(AppError::new(ErrorKind::Process, "macOS did not accept that picture as a desktop background."));
    }
    Ok(())
}

// ------------------------------------------------------------------ clipboard

const PB_WRITE_JS: &str = r#"
ObjC.import('AppKit');
function run(argv) {
  const pb = argv[0] === 'general' ? $.NSPasteboard.generalPasteboard : $.NSPasteboard.pasteboardWithName(argv[0]);
  pb.clearContents;
  const urls = $.NSMutableArray.alloc.init;
  for (const p of argv.slice(1)) urls.addObject($.NSURL.fileURLWithPath(p));
  return pb.writeObjects(urls) ? 'ok' : 'fail';
}
"#;

/// argv: pasteboard name, image output path ('' = only detect), full text ('1') or a preview ('0').
const PB_SNAPSHOT_JS: &str = r#"
ObjC.import('AppKit');
function run(argv) {
  const pb = argv[0] === 'general' ? $.NSPasteboard.generalPasteboard : $.NSPasteboard.pasteboardWithName(argv[0]);
  const imageOut = argv[1] || '';
  const full = argv[2] === '1';
  const out = { kind: 'empty' };
  const files = [];
  const urls = pb.readObjectsForClassesOptions($([$.NSURL]), $({ NSPasteboardURLReadingFileURLsOnlyKey: true }));
  if (urls) {
    const n = ObjC.unwrap(urls.count);
    for (let i = 0; i < n; i++) files.push(ObjC.unwrap(urls.objectAtIndex(i).path));
  }
  if (files.length) { out.kind = 'files'; out.files = files; return JSON.stringify(out); }
  const types = ObjC.deepUnwrap(pb.types) || [];
  const hasPng = types.indexOf('public.png') >= 0;
  const hasTiff = types.indexOf('public.tiff') >= 0;
  const hasJpeg = types.indexOf('public.jpeg') >= 0;
  if (hasPng || hasTiff || hasJpeg) {
    out.kind = 'image';
    if (imageOut) {
      let data = hasPng ? pb.dataForType('public.png') : null;
      if (!data) {
        const src = hasTiff ? pb.dataForType('public.tiff') : pb.dataForType('public.jpeg');
        data = $.NSBitmapImageRep.imageRepWithData(src).representationUsingTypeProperties(4, $());
      }
      data.writeToFileAtomically(imageOut, true);
    }
    return JSON.stringify(out);
  }
  const s = pb.stringForType('public.utf8-plain-text');
  const text = s ? ObjC.unwrap(s) : '';
  if (text && text.length) {
    out.kind = 'text';
    out.length = text.length;
    out.text = full ? text : text.slice(0, 2000);
  }
  return JSON.stringify(out);
}
"#;

#[derive(Debug, Deserialize)]
struct Snapshot {
    kind: String,
    #[serde(default)]
    files: Vec<String>,
    #[serde(default)]
    text: String,
    #[serde(default)]
    length: usize,
}

fn snapshot(pasteboard: &str, image_out: Option<&Path>, full_text: bool) -> AppResult<Snapshot> {
    let args = vec![
        pasteboard.to_string(),
        image_out.map(path_arg).unwrap_or_default(),
        if full_text { "1".into() } else { "0".into() },
    ];
    let raw = jxa(PB_SNAPSHOT_JS, &args, "Reading the clipboard")?;
    serde_json::from_str(&raw)
        .map_err(|e| AppError::with_details(ErrorKind::Internal, "Unexpected reply from the clipboard helper.", e.to_string()))
}

#[tauri::command(async)]
pub fn copy_paths_to_clipboard(paths: Vec<String>) -> AppResult<()> {
    write_files_to_pasteboard("general", &paths)
}

fn write_files_to_pasteboard(pasteboard: &str, paths: &[String]) -> AppResult<()> {
    let items = existing_items(paths)?;
    let mut args = vec![pasteboard.to_string()];
    args.extend(items.iter().map(|p| path_arg(p)));
    let reply = jxa(PB_WRITE_JS, &args, "Copying to the clipboard")?;
    if reply.trim() != "ok" {
        return Err(AppError::new(ErrorKind::Process, "macOS would not put those files on the clipboard."));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSummary {
    /// "text" | "image" | "files" | "empty"
    pub kind: String,
    /// One line, at most 120 characters.
    pub preview: String,
    /// Files: how many. Text: characters. Image: 1.
    pub count: usize,
}

fn one_line_preview(text: &str) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= 120 {
        flat
    } else {
        let cut: String = flat.chars().take(119).collect();
        format!("{}…", cut.trim_end())
    }
}

fn summarize(pasteboard: &str) -> AppResult<ClipboardSummary> {
    let snap = snapshot(pasteboard, None, false)?;
    Ok(match snap.kind.as_str() {
        "files" => {
            let first = snap.files.first().map(|p| paths::display_name(Path::new(p))).unwrap_or_default();
            let preview = if snap.files.len() > 1 { format!("{first} and {} more", snap.files.len() - 1) } else { first };
            ClipboardSummary { kind: "files".into(), preview: one_line_preview(&preview), count: snap.files.len() }
        }
        "image" => ClipboardSummary { kind: "image".into(), preview: "Image".into(), count: 1 },
        "text" => ClipboardSummary { kind: "text".into(), preview: one_line_preview(&snap.text), count: snap.length },
        _ => ClipboardSummary { kind: "empty".into(), preview: String::new(), count: 0 },
    })
}

#[tauri::command(async)]
pub fn clipboard_summary() -> AppResult<ClipboardSummary> {
    summarize("general")
}

// -- sniffing

fn count_separators(line: &str, sep: char) -> usize {
    let mut quoted = false;
    let mut n = 0;
    for ch in line.chars() {
        if ch == '"' {
            quoted = !quoted;
        } else if ch == sep && !quoted {
            n += 1;
        }
    }
    n
}

fn looks_like_csv(text: &str) -> bool {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).take(30).collect();
    if lines.len() < 2 {
        return false;
    }
    [',', ';'].iter().any(|&sep| {
        let first = count_separators(lines[0], sep);
        first >= 1 && (lines.len() >= 3 || first >= 2) && lines.iter().all(|l| count_separators(l, sep) == first)
    })
}

fn looks_like_html(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    if lower.starts_with("<?xml") {
        return false;
    }
    lower.starts_with("<!doctype html")
        || lower.starts_with("<html")
        || lower.starts_with("<head")
        || lower.starts_with("<body")
        || (lower.starts_with('<') && lower.ends_with('>') && lower.contains("</"))
}

fn looks_like_markdown(text: &str) -> bool {
    let mut score = 0;
    let mut first_is_heading = false;
    let mut in_fence = false;
    for (i, line) in text.lines().take(200).enumerate() {
        let t = line.trim_start();
        if t.starts_with("```") {
            in_fence = !in_fence;
            score += 1;
            continue;
        }
        if in_fence {
            continue;
        }
        let hashes = t.bytes().take_while(|&b| b == b'#').count();
        let heading = (1..=6).contains(&hashes) && t[hashes..].starts_with(' ') && !t[hashes..].trim().is_empty();
        if heading {
            score += 1;
            if i == 0 {
                first_is_heading = true;
            }
            continue;
        }
        let bullet = t.len() > 2 && matches!(t.as_bytes()[0], b'-' | b'*' | b'+') && t.as_bytes()[1] == b' ';
        let ordered = {
            let digits = t.bytes().take_while(|b| b.is_ascii_digit()).count();
            digits > 0 && t[digits..].starts_with(". ")
        };
        if bullet || ordered || t.starts_with("> ") || (t.starts_with('|') && t.trim_end().ends_with('|')) {
            score += 1;
        }
    }
    let inline = text.contains("**") as i32
        + text.contains("](http") as i32
        + text.contains("![") as i32
        + (text.matches('`').count() >= 2) as i32;
    first_is_heading || score + inline >= 2
}

/// Pick the file extension a piece of clipboard text most plausibly wants.
fn sniff_text_ext(text: &str) -> &'static str {
    let t = text.trim();
    if t.is_empty() {
        return "txt";
    }
    if ((t.starts_with('{') && t.ends_with('}')) || (t.starts_with('[') && t.ends_with(']')))
        && serde_json::from_str::<serde_json::Value>(t).is_ok()
    {
        return "json";
    }
    if looks_like_html(t) {
        return "html";
    }
    if looks_like_csv(t) {
        return "csv";
    }
    if looks_like_markdown(t) {
        return "md";
    }
    "txt"
}

#[tauri::command(async)]
pub fn paste_clipboard_as_file(dir: String) -> AppResult<BatchResult> {
    paste_from("general", &dir)
}

fn paste_from(pasteboard: &str, dir: &str) -> AppResult<BatchResult> {
    let started = now_ms();
    let dir = existing_dir(dir)?;
    let tmp_png = std::env::temp_dir().join(format!("toolbox-clip-{}.png", uuid::Uuid::new_v4().simple()));
    let snap = snapshot(pasteboard, Some(&tmp_png), true)?;
    let mut batch = BatchResult::default();
    let write_new = |stem: &str, ext: &str, bytes: &[u8]| -> AppResult<FileResult> {
        let (mut file, path, renamed) = create_unique_file(&dir, stem, ext, false)?;
        if let Err(e) = file.write_all(bytes).and_then(|_| file.flush()) {
            drop(file);
            let _ = fs::remove_file(&path); // our own half-written file
            return Err(AppError::with_details(ErrorKind::Io, "Could not write the file.", e.to_string()));
        }
        Ok(FileResult::new(&path, disposition(renamed)))
    };
    match snap.kind.as_str() {
        "files" => {
            for raw in &snap.files {
                let src = PathBuf::from(raw);
                if !occupied(&src) {
                    continue;
                }
                let name = paths::display_name(&src);
                let is_dir = fs::symlink_metadata(&src).map(|m| m.is_dir()).unwrap_or(false);
                let (stem, ext) = split_name(&name, is_dir);
                // Finder pastes under the original name, and says "copy" only when it must.
                let direct = dir.join(&name);
                let result = if occupied(&direct) {
                    copy_into(&src, &dir, strip_copy_suffix(&stem), &ext)
                } else {
                    copy_item(&src, &direct).map(|_| FileResult::from_source(&direct, &src, Disposition::Created))
                };
                match result {
                    Ok(r) => batch.results.push(r),
                    Err(e) => batch.push_failure(&src, e),
                }
            }
            if batch.results.is_empty() && batch.failures.is_empty() {
                return Err(AppError::not_found("The copied files are no longer on disk."));
            }
        }
        "image" => {
            let bytes = fs::read(&tmp_png);
            let _ = fs::remove_file(&tmp_png); // our own scratch file
            let bytes = bytes.map_err(|e| AppError::with_details(ErrorKind::Io, "Could not read the image on the clipboard.", e.to_string()))?;
            batch.results.push(write_new("Clipboard Image", "png", &bytes)?);
        }
        "text" => {
            let ext = sniff_text_ext(&snap.text);
            batch.results.push(write_new("Clipboard", ext, snap.text.as_bytes())?);
        }
        _ => return Err(AppError::invalid("The clipboard is empty.")),
    }
    let _ = fs::remove_file(&tmp_png);
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

// ------------------------------------------------------------------ icons and thumbnails

const ICON_JS: &str = r#"
ObjC.import('AppKit');
function run(argv) {
  const px = parseInt(argv[1], 10);
  const img = $.NSWorkspace.sharedWorkspace.iconForFile(argv[0]);
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(null, px, px, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
  img.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, px, px), $.NSZeroRect, 2, 1.0);
  $.NSGraphicsContext.restoreGraphicsState;
  const png = rep.representationUsingTypeProperties(4, $());
  return ObjC.unwrap(png.base64EncodedStringWithOptions(0));
}
"#;

const MAX_CACHED_ICONS: usize = 256;
static ICON_CACHE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn mtime_secs(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Pixel edge for a requested point size: always 2×, so icons stay sharp on Retina.
fn pixel_edge(size: u32, min: u32, max: u32) -> u32 {
    size.clamp(min, max) * 2
}

fn data_url(png_base64: &str) -> String {
    format!("data:image/png;base64,{}", png_base64.trim())
}

fn icon_data_url(path: &Path, size: u32) -> AppResult<String> {
    let px = pixel_edge(size, 16, 512);
    let key = format!("{}|{px}|{}", path.display(), mtime_secs(path));
    if let Ok(guard) = ICON_CACHE.lock() {
        if let Some(hit) = guard.as_ref().and_then(|m| m.get(&key)) {
            return Ok(hit.clone());
        }
    }
    let b64 = jxa(ICON_JS, &[path_arg(path), px.to_string()], "Reading the file icon")?;
    if b64.trim().is_empty() {
        return Err(AppError::new(ErrorKind::Process, "macOS returned no icon for that file."));
    }
    let url = data_url(&b64);
    if let Ok(mut guard) = ICON_CACHE.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        if map.len() >= MAX_CACHED_ICONS {
            map.clear();
        }
        map.insert(key, url.clone());
    }
    Ok(url)
}

/// The real Finder icon for a file, folder or app, as a PNG data URL (`size` points, 2× pixels).
#[tauri::command(async)]
pub fn file_icon(path: String, size: u32) -> AppResult<String> {
    let p = existing_item(&path)?;
    icon_data_url(&p, size)
}

const THUMB_TIMEOUT: Duration = Duration::from_secs(8);
const THUMB_MAX_AGE: Duration = Duration::from_secs(7 * 24 * 3600);

fn thumbs_root() -> PathBuf {
    std::env::temp_dir().join("toolbox-thumbs")
}

/// Drop week-old cache folders so the temp directory never grows without bound.
fn prune_thumbs(root: &Path) {
    let Ok(entries) = fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok())
            .map(|age| age > THUMB_MAX_AGE)
            .unwrap_or(false);
        if old {
            let _ = fs::remove_dir_all(entry.path()); // our own cache folder
        }
    }
}

fn read_png_data_url(file: &Path) -> Option<String> {
    let bytes = fs::read(file).ok()?;
    if bytes.len() < 8 || bytes[..8] != [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A] {
        return None;
    }
    Some(data_url(&base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// A Quick Look thumbnail (PDF first page, video frame, document preview …), cached on
/// disk by path + modification time + size. Falls back to the plain Finder icon.
#[tauri::command]
pub async fn file_thumbnail(path: String, size: u32) -> AppResult<String> {
    let file = existing_item(&path)?;
    let px = pixel_edge(size, 32, 512);
    let root = thumbs_root();
    let mut hasher = Sha256::new();
    hasher.update(format!("{}|{}|{px}", file.display(), mtime_secs(&file)));
    let key = hex::encode(hasher.finalize())[..24].to_string();
    let dir = root.join(&key);
    let produced = dir.join(format!("{}.png", paths::display_name(&file)));

    if let Some(hit) = read_png_data_url(&produced) {
        return Ok(hit);
    }
    let fallback_path = file.clone();
    let fallback = move || {
        tokio::task::spawn_blocking(move || icon_data_url(&fallback_path, size))
    };

    if fs::create_dir_all(&dir).is_err() {
        return fallback().await.map_err(|e| AppError::internal(e.to_string()))?;
    }
    let spawned = tokio::process::Command::new("/usr/bin/qlmanage")
        .args(["-t", "-s", &px.to_string(), "-o"])
        .arg(&dir)
        .arg(&file)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn();
    if let Ok(mut child) = spawned {
        if tokio::time::timeout(THUMB_TIMEOUT, child.wait()).await.is_err() {
            let _ = child.kill().await;
        }
    }
    let prune_root = root.clone();
    tokio::task::spawn_blocking(move || prune_thumbs(&prune_root));
    if let Some(hit) = read_png_data_url(&produced) {
        return Ok(hit);
    }
    let _ = fs::remove_dir_all(&dir); // nothing usable was produced
    fallback().await.map_err(|e| AppError::internal(e.to_string()))?
}

// ------------------------------------------------------------------ text preview

const DEFAULT_PEEK_BYTES: u64 = 64 * 1024;
const MAX_PEEK_BYTES: u64 = 8 * 1024 * 1024;

#[tauri::command(async)]
pub fn read_text_file(path: String, max_bytes: Option<u64>) -> AppResult<String> {
    let file = abs_path(&path)?;
    let meta = fs::metadata(&file)
        .map_err(|e| AppError::with_details(ErrorKind::NotFound, format!("Could not read “{}”.", paths::display_name(&file)), e.to_string()))?;
    if meta.is_dir() {
        return Err(AppError::invalid("That is a folder, not a text file."));
    }
    let limit = max_bytes.unwrap_or(DEFAULT_PEEK_BYTES).clamp(1, MAX_PEEK_BYTES) as usize;
    let mut buf = Vec::with_capacity(limit.min(meta.len() as usize) + 1);
    fs::File::open(&file)?.take(limit as u64 + 1).read_to_end(&mut buf)?;
    let truncated = buf.len() > limit;
    buf.truncate(limit);
    if buf.contains(&0) {
        return Err(AppError::invalid("That looks like a binary file, not text."));
    }
    Ok(match String::from_utf8(buf) {
        Ok(text) => text,
        Err(e) => {
            // A cut in the middle of a multi-byte character is not an error worth showing.
            let cut_mid_char = truncated && e.utf8_error().error_len().is_none();
            let valid = e.utf8_error().valid_up_to();
            let bytes = e.into_bytes();
            let usable = if cut_mid_char { &bytes[..valid] } else { &bytes[..] };
            String::from_utf8_lossy(usable).into_owned()
        }
    })
}

// ------------------------------------------------------------------ folders

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultFolders {
    pub desktop: String,
    pub documents: String,
    pub downloads: String,
    pub home: String,
}

#[tauri::command]
pub fn default_folders() -> DefaultFolders {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    let s = |p: Option<PathBuf>| p.unwrap_or_else(|| home.clone()).to_string_lossy().to_string();
    DefaultFolders {
        desktop: s(dirs::desktop_dir()),
        documents: s(dirs::document_dir()),
        downloads: s(dirs::download_dir()),
        home: home.to_string_lossy().to_string(),
    }
}

// ------------------------------------------------------------------ tests

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!("toolbox-quick-test-{}", uuid::Uuid::new_v4().simple()));
            fs::create_dir_all(&dir).unwrap();
            // Canonical, so comparisons survive /var → /private/var on macOS.
            Self(fs::canonicalize(&dir).unwrap())
        }
        fn path(&self) -> &Path {
            &self.0
        }
        fn s(&self) -> String {
            self.0.to_string_lossy().into_owned()
        }
        fn write(&self, rel: &str, body: &str) -> PathBuf {
            let p = self.0.join(rel);
            if let Some(parent) = p.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&p, body).unwrap();
            p
        }
        fn names(&self) -> Vec<String> {
            let mut v: Vec<String> =
                fs::read_dir(&self.0).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
            v.sort();
            v
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn strings(paths: &[&Path]) -> Vec<String> {
        paths.iter().map(|p| p.to_string_lossy().into_owned()).collect()
    }

    // -- names

    #[test]
    fn split_name_handles_folders_dotfiles_and_double_extensions() {
        assert_eq!(split_name("report.txt", false), ("report".into(), "txt".into()));
        assert_eq!(split_name("my.folder", true), ("my.folder".into(), "".into()));
        assert_eq!(split_name(".gitignore", false), (".gitignore".into(), "".into()));
        assert_eq!(split_name("backup.TAR.GZ", false), ("backup".into(), "TAR.GZ".into()));
        assert_eq!(split_name("Mr. Smith", false), ("Mr. Smith".into(), "".into()));
        assert_eq!(split_name("noext", false), ("noext".into(), "".into()));
        assert_eq!(split_name("trailing.", false), ("trailing.".into(), "".into()));
    }

    #[test]
    fn finder_style_numbering() {
        assert_eq!(numbered_name("Untitled", "md", 1), "Untitled.md");
        assert_eq!(numbered_name("Untitled", "md", 2), "Untitled 2.md");
        assert_eq!(numbered_name("untitled folder", "", 3), "untitled folder 3");
        assert_eq!(copy_name("report", "txt", 1), "report copy.txt");
        assert_eq!(copy_name("report", "txt", 2), "report copy 2.txt");
        assert_eq!(strip_copy_suffix("report copy"), "report");
        assert_eq!(strip_copy_suffix("report copy 12"), "report");
        assert_eq!(strip_copy_suffix("copy"), "copy");
        assert_eq!(strip_copy_suffix("my copy of it"), "my copy of it");
        assert_eq!(strip_copy_suffix(" copy"), " copy");
    }

    #[test]
    fn safe_component_blocks_traversal_but_keeps_dotfiles() {
        assert_eq!(safe_component("  ", "Untitled"), "Untitled");
        assert_eq!(safe_component(".env", "x"), ".env");
        assert_eq!(safe_component(".github", "x"), ".github");
        for hostile in ["../../etc/passwd", "..", "a/b", "..\\x", "/etc/passwd"] {
            let out = safe_component(hostile, "x");
            assert!(!out.contains('/') && !out.contains('\\'), "{hostile} → {out}");
            assert!(out != ".." && out != ".");
            assert_eq!(Path::new(&out).components().count(), 1, "{hostile} → {out}");
        }
        assert_eq!(clean_ext(" .M d! "), "Md");
    }

    // -- create

    #[test]
    fn create_text_file_numbers_like_finder_and_never_overwrites() {
        let t = TempDir::new();
        let a = create_text_file(t.s(), "Untitled".into(), "md".into(), "# one".into(), None).unwrap();
        let b = create_text_file(t.s(), "Untitled".into(), ".md".into(), "# two".into(), None).unwrap();
        let c = create_text_file(t.s(), "Untitled.md".into(), "md".into(), "# three".into(), None).unwrap();
        assert_eq!(a.name, "Untitled.md");
        assert_eq!(b.name, "Untitled 2.md");
        assert_eq!(c.name, "Untitled 3.md");
        assert_eq!(a.disposition, Disposition::Created);
        assert_eq!(b.disposition, Disposition::Renamed);
        assert_eq!(fs::read_to_string(&a.path).unwrap(), "# one");
        assert_eq!(fs::read_to_string(&b.path).unwrap(), "# two");
    }

    #[test]
    fn create_text_file_defaults_name_and_is_executable_on_request() {
        let t = TempDir::new();
        let plain = create_text_file(t.s(), "".into(), "txt".into(), "".into(), None).unwrap();
        assert_eq!(plain.name, "Untitled.txt");
        let script = create_text_file(t.s(), "run".into(), "sh".into(), "#!/bin/sh\necho hi\n".into(), Some(true)).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = |p: &str| fs::metadata(p).unwrap().permissions().mode() & 0o111;
            assert_ne!(mode(&script.path), 0, "script should be executable");
            assert_eq!(mode(&plain.path), 0, "plain files must not be executable");
        }
        let dot = create_text_file(t.s(), ".env".into(), "".into(), "A=1".into(), None).unwrap();
        assert_eq!(dot.name, ".env");
    }

    #[test]
    fn create_text_file_stays_inside_the_folder_and_rejects_bad_dirs() {
        let t = TempDir::new();
        let r = create_text_file(t.s(), "../../escape".into(), "txt".into(), "x".into(), None).unwrap();
        assert_eq!(Path::new(&r.path).parent().unwrap(), t.path());
        assert!(create_text_file("relative/dir".into(), "a".into(), "txt".into(), "".into(), None).is_err());
        assert!(create_text_file(t.s() + "/missing", "a".into(), "txt".into(), "".into(), None).is_err());
        assert!(create_text_file("".into(), "a".into(), "txt".into(), "".into(), None).is_err());
    }

    #[test]
    fn create_folder_groups_items_and_numbers_names() {
        let t = TempDir::new();
        let a = t.write("a.txt", "a");
        let sub = t.write("sub/inner.txt", "i");
        let batch = create_folder(t.s(), "Group".into(), Some(strings(&[&a, sub.parent().unwrap()]))).unwrap();
        assert!(batch.failures.is_empty(), "{:?}", batch.failures.iter().map(|f| &f.message).collect::<Vec<_>>());
        assert_eq!(batch.results[0].name, "Group");
        let group = t.path().join("Group");
        assert!(group.join("a.txt").is_file());
        assert!(group.join("sub/inner.txt").is_file());
        assert!(!a.exists());
        // A second one with the same name is numbered, and an empty one gets Finder's default.
        let again = create_folder(t.s(), "Group".into(), None).unwrap();
        assert_eq!(again.results[0].name, "Group 2");
        let default = create_folder(t.s(), "".into(), None).unwrap();
        assert_eq!(default.results[0].name, "untitled folder");
    }

    #[test]
    fn create_folder_refuses_to_move_a_folder_into_itself() {
        let t = TempDir::new();
        let outer = t.path().join("outer");
        fs::create_dir_all(&outer).unwrap();
        // The new folder is created *inside* `outer`, and `outer` is asked to move into it.
        let batch = create_folder(path_arg(&outer), "inside".into(), Some(strings(&[&outer]))).unwrap();
        assert_eq!(batch.failures.len(), 1);
        assert!(batch.failures[0].message.contains("itself"), "{}", batch.failures[0].message);
        assert!(outer.is_dir() && outer.join("inside").is_dir());
    }

    // -- duplicate and move

    #[test]
    fn duplicate_numbers_copies_and_keeps_extensions() {
        let t = TempDir::new();
        let f = t.write("report.txt", "data");
        let first = duplicate_paths(strings(&[&f])).unwrap();
        assert_eq!(first.results[0].name, "report copy.txt");
        let second = duplicate_paths(strings(&[&f])).unwrap();
        assert_eq!(second.results[0].name, "report copy 2.txt");
        // Duplicating a copy numbers on rather than nesting "copy copy".
        let copy = t.path().join("report copy.txt");
        let third = duplicate_paths(strings(&[&copy])).unwrap();
        assert_eq!(third.results[0].name, "report copy 3.txt");
        assert_eq!(fs::read_to_string(t.path().join("report copy 2.txt")).unwrap(), "data");
        assert_eq!(fs::read_to_string(&f).unwrap(), "data");
    }

    #[test]
    fn duplicate_copies_whole_folders() {
        let t = TempDir::new();
        t.write("proj.v2/src/main.rs", "fn main() {}");
        let folder = t.path().join("proj.v2");
        let r = duplicate_paths(strings(&[&folder])).unwrap();
        assert_eq!(r.results[0].name, "proj.v2 copy");
        assert!(t.path().join("proj.v2 copy/src/main.rs").is_file());
    }

    #[test]
    fn duplicate_reports_a_missing_item_without_inventing_one() {
        let t = TempDir::new();
        assert!(duplicate_paths(strings(&[&t.path().join("nope.txt")])).is_err());
        assert!(duplicate_paths(vec![]).is_err());
        assert!(duplicate_paths(vec!["relative.txt".into()]).is_err());
    }

    #[test]
    fn move_is_collision_safe_and_skips_same_folder() {
        let t = TempDir::new();
        let src = t.write("in/photo.jpg", "new");
        t.write("out/photo.jpg", "old");
        let out = t.path().join("out");
        let r = move_paths(strings(&[&src]), path_arg(&out)).unwrap();
        assert_eq!(r.results[0].name, "photo 2.jpg");
        assert_eq!(r.results[0].disposition, Disposition::Renamed);
        assert_eq!(fs::read_to_string(out.join("photo.jpg")).unwrap(), "old", "existing file must be untouched");
        assert_eq!(fs::read_to_string(out.join("photo 2.jpg")).unwrap(), "new");
        assert!(!src.exists());
        // Moving something to the folder it is already in changes nothing.
        let stay = move_paths(strings(&[&out.join("photo.jpg")]), path_arg(&out)).unwrap();
        assert_eq!(stay.results[0].disposition, Disposition::Skipped);
        assert_eq!(fs::read_to_string(out.join("photo.jpg")).unwrap(), "old");
    }

    #[test]
    fn move_refuses_a_folder_into_its_own_descendant() {
        let t = TempDir::new();
        t.write("top/mid/leaf.txt", "x");
        let top = t.path().join("top");
        let mid = top.join("mid");
        let r = move_paths(strings(&[&top]), path_arg(&mid)).unwrap();
        assert!(r.results.is_empty());
        assert_eq!(r.failures.len(), 1);
        assert!(top.join("mid/leaf.txt").is_file());
    }

    #[test]
    fn rename_noreplace_never_replaces() {
        let t = TempDir::new();
        let a = t.write("a", "a");
        let b = t.write("b", "b");
        let err = rename_noreplace(&a, &b).unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read_to_string(&b).unwrap(), "b");
        let c = t.path().join("c");
        rename_noreplace(&a, &c).unwrap();
        assert!(c.is_file() && !a.exists());
    }

    // -- trash

    #[test]
    fn protected_places_are_never_trashed() {
        for p in ["/", "/Users", "/Applications", "/System/Library/CoreServices", "/usr/bin/env", "/Volumes/Macintosh HD"] {
            assert!(is_protected(Path::new(p)), "{p} should be protected");
        }
        let home = dirs::home_dir().unwrap();
        assert!(is_protected(&home));
        assert!(is_protected(&home.join("Desktop")));
        assert!(is_protected(&home.join("Library")));
        assert!(!is_protected(&home.join("Desktop").join("notes.txt")));
        assert!(!is_protected(Path::new("/Applications/Some.app")));
        // And the command itself refuses before any helper runs.
        assert!(trash_paths(vec!["/".into()]).is_err());
        assert!(trash_paths(vec![path_arg(&home)]).is_err());
        assert!(trash_paths(vec![]).is_err());
        assert!(trash_paths(vec!["relative".into()]).is_err());
    }

    /// Puts one empty, uniquely named file in the real Trash, so it is opt-in:
    /// `cargo test quick -- --ignored trash_moves_a_real_file`.
    #[test]
    #[ignore]
    fn trash_moves_a_real_file() {
        let t = TempDir::new();
        let f = t.write(&format!("toolbox-quick-test-trash-{}.txt", uuid::Uuid::new_v4().simple()), "");
        assert_eq!(trash_paths(strings(&[&f])).unwrap(), 1);
        assert!(!f.exists());
    }

    // -- reading text

    #[test]
    fn read_text_file_honours_the_limit_and_character_boundaries() {
        let t = TempDir::new();
        let f = t.write("t.txt", "héllo wörld");
        assert_eq!(read_text_file(path_arg(&f), None).unwrap(), "héllo wörld");
        // 'é' is two bytes; cutting after the first byte of it must not leave a replacement char.
        assert_eq!(read_text_file(path_arg(&f), Some(2)).unwrap(), "h");
        assert_eq!(read_text_file(path_arg(&f), Some(3)).unwrap(), "hé");
        assert_eq!(read_text_file(path_arg(&f), Some(5)).unwrap(), "héll");
    }

    #[test]
    fn read_text_file_refuses_binaries_folders_and_relative_paths() {
        let t = TempDir::new();
        let bin = t.path().join("blob.bin");
        fs::write(&bin, [0x41u8, 0x00, 0x42]).unwrap();
        assert!(read_text_file(path_arg(&bin), None).unwrap_err().to_string().contains("binary"));
        assert!(read_text_file(t.s(), None).is_err());
        assert!(read_text_file("notes.txt".into(), None).is_err());
        assert!(read_text_file(path_arg(&t.path().join("missing.txt")), None).is_err());
        // Invalid UTF-8 in the middle is shown lossily rather than failing.
        let latin = t.path().join("latin1.txt");
        fs::write(&latin, [b'c', b'a', b'f', 0xE9, b'!']).unwrap();
        assert_eq!(read_text_file(path_arg(&latin), None).unwrap(), "caf\u{FFFD}!");
    }

    // -- sniffing

    #[test]
    fn sniffing_picks_the_obvious_extension() {
        assert_eq!(sniff_text_ext(r#"{"a": [1, 2, 3]}"#), "json");
        assert_eq!(sniff_text_ext("[1, 2, 3]"), "json");
        assert_eq!(sniff_text_ext("{not json}"), "txt");
        assert_eq!(sniff_text_ext("<!DOCTYPE html><html><body>Hi</body></html>"), "html");
        assert_eq!(sniff_text_ext("<div><p>Hello</p></div>"), "html");
        assert_eq!(sniff_text_ext("<?xml version=\"1.0\"?><a></a>"), "txt");
        assert_eq!(sniff_text_ext("name,age\nAda,36\nLin,41"), "csv");
        assert_eq!(sniff_text_ext("a;b;c\n1;2;3"), "csv");
        assert_eq!(sniff_text_ext("name,note\n\"Smith, J\",\"a, b\"\nLee,ok"), "csv");
        assert_eq!(sniff_text_ext("# Title\nSome words."), "md");
        assert_eq!(sniff_text_ext("Shopping\n- milk\n- eggs\n- bread"), "md");
        assert_eq!(sniff_text_ext("See [the docs](https://example.com) for **details**."), "md");
        assert_eq!(sniff_text_ext("Hello, world\nGoodbye, world"), "txt");
        assert_eq!(sniff_text_ext("just a sentence"), "txt");
        assert_eq!(sniff_text_ext("https://example.com/page"), "txt");
        assert_eq!(sniff_text_ext("   \n"), "txt");
    }

    #[test]
    fn previews_are_one_short_line() {
        assert_eq!(one_line_preview("a\n  b\t c"), "a b c");
        let long = "x".repeat(500);
        let p = one_line_preview(&long);
        assert!(p.chars().count() <= 120, "{}", p.chars().count());
        assert!(p.ends_with('…'));
    }

    #[test]
    fn open_with_builds_a_safe_argument_vector() {
        let items = vec![PathBuf::from("/tmp/a b.txt")];
        let to_strings = |v: Vec<std::ffi::OsString>| v.into_iter().map(|s| s.to_string_lossy().into_owned()).collect::<Vec<_>>();
        assert_eq!(to_strings(open_with_args(&items, None).unwrap()), ["--", "/tmp/a b.txt"]);
        assert_eq!(to_strings(open_with_args(&items, Some("Preview")).unwrap()), ["-a", "Preview", "--", "/tmp/a b.txt"]);
        assert_eq!(
            to_strings(open_with_args(&items, Some("/System/Applications/Preview.app")).unwrap()),
            ["-a", "/System/Applications/Preview.app", "--", "/tmp/a b.txt"]
        );
        assert_eq!(
            to_strings(open_with_args(&items, Some("com.apple.TextEdit")).unwrap()),
            ["-b", "com.apple.TextEdit", "--", "/tmp/a b.txt"]
        );
        assert_eq!(to_strings(open_with_args(&items, Some("  ")).unwrap()), ["--", "/tmp/a b.txt"]);
        assert!(open_with_args(&items, Some("-n")).is_err());
        assert!(open_with(vec!["relative.txt".into()], None).is_err());
        assert!(reveal_many(vec![]).is_err());
        assert!(quick_look(vec!["relative.txt".into()]).is_err());
    }

    #[test]
    fn wallpaper_only_accepts_images() {
        let t = TempDir::new();
        let txt = t.write("a.txt", "x");
        assert!(set_desktop_picture(path_arg(&txt)).unwrap_err().to_string().contains("image"));
        assert!(set_desktop_picture("rel.png".into()).is_err());
        assert!(set_desktop_picture(path_arg(&t.path().join("missing.png"))).is_err());
    }

    // -- macOS bridges (private pasteboard, so the real clipboard is never touched)

    #[cfg(target_os = "macos")]
    mod macos {
        use super::*;

        const PB_SET_JS: &str = r#"
        ObjC.import('AppKit');
        function run(argv) {
          const pb = $.NSPasteboard.pasteboardWithName(argv[0]);
          pb.clearContents;
          if (argv[1] === 'text') pb.setStringForType($(argv[2]), 'public.utf8-plain-text');
          if (argv[1] === 'png') pb.setDataForType($.NSData.dataWithContentsOfFile(argv[2]), 'public.png');
          return 'ok';
        }"#;
        const PB_RELEASE_JS: &str = r#"
        ObjC.import('AppKit');
        function run(argv) { $.NSPasteboard.pasteboardWithName(argv[0]).releaseGlobally; return 'ok'; }"#;

        struct PrivatePasteboard(String);

        impl PrivatePasteboard {
            fn new() -> Self {
                Self(format!("toolbox-quick-test-{}", uuid::Uuid::new_v4().simple()))
            }
            fn set(&self, kind: &str, value: &str) {
                jxa(PB_SET_JS, &[self.0.clone(), kind.into(), value.into()], "test pasteboard").unwrap();
            }
        }

        impl Drop for PrivatePasteboard {
            fn drop(&mut self) {
                let _ = jxa(PB_RELEASE_JS, std::slice::from_ref(&self.0), "test pasteboard");
            }
        }

        #[test]
        fn files_round_trip_through_the_pasteboard_and_paste_with_finder_naming() {
            let t = TempDir::new();
            let doc = t.write("src/doc.txt", "hello");
            let folder = t.write("src/pack/inner.txt", "inner");
            let pack = folder.parent().unwrap().to_path_buf();
            let pb = PrivatePasteboard::new();
            write_files_to_pasteboard(&pb.0, &strings(&[&doc, &pack])).unwrap();

            let summary = summarize(&pb.0).unwrap();
            assert_eq!((summary.kind.as_str(), summary.count), ("files", 2));
            assert!(summary.preview.contains("doc.txt") && summary.preview.contains("1 more"), "{}", summary.preview);

            let dest = t.path().join("dest");
            fs::create_dir_all(&dest).unwrap();
            let first = paste_from(&pb.0, &path_arg(&dest)).unwrap();
            assert!(first.failures.is_empty());
            assert_eq!(first.results.len(), 2);
            assert_eq!(fs::read_to_string(dest.join("doc.txt")).unwrap(), "hello");
            assert_eq!(fs::read_to_string(dest.join("pack/inner.txt")).unwrap(), "inner");
            // Pasting again into the same folder says "copy", like Finder.
            paste_from(&pb.0, &path_arg(&dest)).unwrap();
            assert!(dest.join("doc copy.txt").is_file());
            assert!(dest.join("pack copy/inner.txt").is_file());
            assert_eq!(fs::read_to_string(dest.join("doc.txt")).unwrap(), "hello");
        }

        #[test]
        fn text_on_the_pasteboard_is_sniffed_into_the_right_file_type() {
            let t = TempDir::new();
            let pb = PrivatePasteboard::new();
            let cases = [
                (r#"{"ok": true}"#, "Clipboard.json"),
                ("# Notes\n- one\n- two", "Clipboard.md"),
                ("a,b\n1,2\n3,4", "Clipboard.csv"),
                ("plain words", "Clipboard.txt"),
            ];
            for (text, expected) in cases {
                pb.set("text", text);
                let r = paste_from(&pb.0, &t.s()).unwrap();
                assert_eq!(r.results[0].name, expected);
                assert_eq!(fs::read_to_string(&r.results[0].path).unwrap(), text);
            }
            // A second plain-text paste is numbered, not overwritten.
            pb.set("text", "again");
            assert_eq!(paste_from(&pb.0, &t.s()).unwrap().results[0].name, "Clipboard 2.txt");
            let summary = summarize(&pb.0).unwrap();
            assert_eq!((summary.kind.as_str(), summary.count), ("text", 5));
            assert_eq!(summary.preview, "again");
        }

        #[test]
        fn an_image_on_the_pasteboard_becomes_a_png() {
            let t = TempDir::new();
            let png = t.path().join("src.png");
            image::RgbaImage::from_pixel(3, 2, image::Rgba([255, 0, 0, 255])).save(&png).unwrap();
            let pb = PrivatePasteboard::new();
            pb.set("png", &path_arg(&png));
            assert_eq!(summarize(&pb.0).unwrap().kind, "image");
            let out_dir = t.path().join("out");
            fs::create_dir_all(&out_dir).unwrap();
            let r = paste_from(&pb.0, &path_arg(&out_dir)).unwrap();
            assert_eq!(r.results[0].name, "Clipboard Image.png");
            let img = image::open(&r.results[0].path).unwrap();
            assert_eq!((img.width(), img.height()), (3, 2));
        }

        #[test]
        fn an_empty_pasteboard_is_reported_not_written() {
            let t = TempDir::new();
            let pb = PrivatePasteboard::new();
            assert_eq!(summarize(&pb.0).unwrap().kind, "empty");
            assert!(paste_from(&pb.0, &t.s()).is_err());
            assert!(t.names().is_empty());
        }

        #[test]
        fn file_icons_come_back_as_pixel_exact_pngs() {
            let t = TempDir::new();
            let f = t.write("a.txt", "x");
            let url = file_icon(path_arg(&f), 32).unwrap();
            let b64 = url.strip_prefix("data:image/png;base64,").expect("data URL");
            let bytes = base64::engine::general_purpose::STANDARD.decode(b64).unwrap();
            let img = image::load_from_memory(&bytes).unwrap();
            assert_eq!((img.width(), img.height()), (64, 64), "2x pixels for a 32pt icon");
            // The folder and an app both work, and out-of-range sizes are clamped.
            assert!(file_icon(t.s(), 4).is_ok());
            assert!(file_icon("/System/Applications/Calculator.app".into(), 9999).is_ok());
            assert!(file_icon(path_arg(&t.path().join("missing")), 32).is_err());
        }

        #[test]
        fn thumbnails_are_cached_and_fall_back_to_icons() {
            let t = TempDir::new();
            let png = t.path().join("pic.png");
            image::RgbaImage::from_pixel(120, 80, image::Rgba([10, 120, 240, 255])).save(&png).unwrap();
            let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
            let first = rt.block_on(file_thumbnail(path_arg(&png), 64)).unwrap();
            assert!(first.starts_with("data:image/png;base64,"));
            let second = rt.block_on(file_thumbnail(path_arg(&png), 64)).unwrap();
            assert_eq!(first, second, "second call is served from the cache");
            let odd = t.write("weird.unknownext", "x");
            assert!(rt.block_on(file_thumbnail(path_arg(&odd), 64)).unwrap().starts_with("data:image/png;base64,"));
            assert!(rt.block_on(file_thumbnail(path_arg(&t.path().join("gone.png")), 64)).is_err());
        }

        #[test]
        fn trash_script_reports_failures_instead_of_crashing() {
            // A missing path must come back as "failed", not take osascript down.
            let reply = jxa(TRASH_JS, &["/private/tmp/toolbox-quick-test-definitely-missing".into()], "trash probe").unwrap();
            let report: TrashReport = serde_json::from_str(&reply).unwrap();
            assert_eq!(report.moved, 0);
            assert_eq!(report.failed.len(), 1);
        }
    }
}

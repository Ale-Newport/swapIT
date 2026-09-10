use crate::error::{AppError, AppResult, ErrorKind};
use crate::jobs::JobCtx;
use crate::paths::{self, Disposition, OutputSpec};
use crate::types::{now_ms, BatchResult, FileResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub stem: String,
    pub extension: String,
    pub mime: String,
    pub kind: String,
    pub size: u64,
    pub is_dir: bool,
    pub created: Option<u64>,
    pub modified: Option<u64>,
}

/// Broad classification used by the drop zone to suggest tools.
pub fn kind_for_extension(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "tif" | "tiff" | "webp" | "heic" | "heif" | "avif"
        | "ico" | "jfif" | "qoi" | "tga" | "pbm" | "ppm" | "dds" | "exr" | "hdr" => "image",
        "svg" | "svgz" => "svg",
        "mp4" | "mov" | "mkv" | "avi" | "webm" | "m4v" | "mpg" | "mpeg" | "wmv" | "flv" | "3gp"
        | "mts" | "m2ts" | "ogv" => "video",
        "mp3" | "wav" | "aac" | "flac" | "ogg" | "oga" | "m4a" | "wma" | "aiff" | "aif" | "opus"
        | "alac" | "amr" | "caf" => "audio",
        "pdf" => "pdf",
        "doc" | "docx" | "odt" | "rtf" | "pages" | "xls" | "xlsx" | "ods" | "ppt" | "pptx" | "odp" | "epub" => "document",
        "zip" | "tar" | "gz" | "tgz" | "bz2" | "xz" | "7z" | "rar" => "archive",
        "txt" | "md" | "markdown" | "log" | "rst" | "tex" => "text",
        "json" | "yaml" | "yml" | "xml" | "csv" | "tsv" | "toml" | "ini" | "plist" => "data",
        "js" | "ts" | "tsx" | "jsx" | "rs" | "py" | "go" | "java" | "c" | "cpp" | "h" | "hpp"
        | "cs" | "rb" | "php" | "swift" | "kt" | "sh" | "zsh" | "html" | "css" | "scss" | "sql" | "vue" => "code",
        "ttf" | "otf" | "woff" | "woff2" => "font",
        _ => "other",
    }
}

fn secs(t: std::io::Result<std::time::SystemTime>) -> Option<u64> {
    t.ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

pub fn info_for(path: &Path) -> AppResult<FileInfo> {
    let meta = std::fs::metadata(path)?;
    let ext = paths::extension(path);
    Ok(FileInfo {
        path: path.to_string_lossy().to_string(),
        name: paths::display_name(path),
        stem: paths::stem(path),
        mime: mime_guess::from_path(path).first_raw().unwrap_or("application/octet-stream").to_string(),
        kind: if meta.is_dir() { "folder".into() } else { kind_for_extension(&ext).to_string() },
        extension: ext,
        size: if meta.is_dir() { 0 } else { meta.len() },
        is_dir: meta.is_dir(),
        created: secs(meta.created()),
        modified: secs(meta.modified()),
    })
}

#[tauri::command]
pub fn inspect_paths(paths: Vec<String>) -> AppResult<Vec<FileInfo>> {
    paths
        .iter()
        .map(|p| {
            let canonical = std::fs::canonicalize(p)
                .map_err(|e| AppError::with_details(ErrorKind::NotFound, format!("Could not read “{p}”."), e.to_string()))?;
            info_for(&canonical)
        })
        .collect()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListOpts {
    #[serde(default)]
    pub recursive: bool,
    #[serde(default)]
    pub kinds: Vec<String>,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default = "d_limit")]
    pub limit: usize,
    #[serde(default)]
    pub include_hidden: bool,
}
fn d_limit() -> usize { 20_000 }

/// Expand a mixed selection of files and folders into a flat file list.
#[tauri::command]
pub fn expand_paths(inputs: Vec<String>, opts: ListOpts) -> AppResult<Vec<FileInfo>> {
    let mut out = Vec::new();
    for raw in inputs {
        let p = PathBuf::from(&raw);
        if p.is_dir() {
            let walker = if opts.recursive { WalkDir::new(&p) } else { WalkDir::new(&p).max_depth(1) };
            for entry in walker.into_iter().filter_map(|e| e.ok()) {
                if out.len() >= opts.limit {
                    break;
                }
                if !entry.file_type().is_file() {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                if !opts.include_hidden && name.starts_with('.') {
                    continue;
                }
                if let Ok(info) = info_for(entry.path()) {
                    if matches_filter(&info, &opts) {
                        out.push(info);
                    }
                }
            }
        } else if p.is_file() {
            if let Ok(info) = info_for(&p) {
                if matches_filter(&info, &opts) {
                    out.push(info);
                }
            }
        }
    }
    Ok(out)
}

fn matches_filter(info: &FileInfo, opts: &ListOpts) -> bool {
    let kind_ok = opts.kinds.is_empty() || opts.kinds.iter().any(|k| k == &info.kind);
    let ext_ok = opts.extensions.is_empty()
        || opts.extensions.iter().any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&info.extension));
    kind_ok && ext_ok
}

// ---------------------------------------------------------------- batch rename

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum RenameRule {
    Prefix { text: String },
    Suffix { text: String },
    Replace { find: String, replace: String, #[serde(default)] all: bool },
    Regex { pattern: String, replace: String },
    Sequence { start: u32, padding: u32, #[serde(default)] separator: String, #[serde(default)] position: String },
    Case { mode: String },
    Slugify,
    RemoveChars { chars: String },
    ChangeExtension { ext: String },
    Transliterate,
}

fn to_case(s: &str, mode: &str) -> String {
    match mode {
        "lower" => s.to_lowercase(),
        "upper" => s.to_uppercase(),
        "title" => s
            .split(' ')
            .map(|w| {
                let mut c = w.chars();
                match c.next() {
                    Some(f) => f.to_uppercase().collect::<String>() + &c.as_str().to_lowercase(),
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
        _ => s.to_string(),
    }
}

/// Fold accented Latin characters onto their ASCII base so Spanish, French and
/// Portuguese file names slugify to something readable rather than disappearing.
fn deaccent(ch: char) -> Option<&'static str> {
    Some(match ch {
        'á' | 'à' | 'â' | 'ä' | 'ã' | 'å' | 'ā' => "a",
        'Á' | 'À' | 'Â' | 'Ä' | 'Ã' | 'Å' | 'Ā' => "A",
        'é' | 'è' | 'ê' | 'ë' | 'ē' => "e",
        'É' | 'È' | 'Ê' | 'Ë' | 'Ē' => "E",
        'í' | 'ì' | 'î' | 'ï' | 'ī' => "i",
        'Í' | 'Ì' | 'Î' | 'Ï' | 'Ī' => "I",
        'ó' | 'ò' | 'ô' | 'ö' | 'õ' | 'ō' => "o",
        'Ó' | 'Ò' | 'Ô' | 'Ö' | 'Õ' | 'Ō' => "O",
        'ú' | 'ù' | 'û' | 'ü' | 'ū' => "u",
        'Ú' | 'Ù' | 'Û' | 'Ü' | 'Ū' => "U",
        'ñ' => "n",
        'Ñ' => "N",
        'ç' => "c",
        'Ç' => "C",
        'ý' | 'ÿ' => "y",
        'ß' => "ss",
        'æ' => "ae",
        'Æ' => "AE",
        'ø' => "o",
        'Ø' => "O",
        'œ' => "oe",
        'Œ' => "OE",
        'đ' | 'ð' => "d",
        'ł' => "l",
        _ => return None,
    })
}

/// ASCII-fold a string without slugifying it — used by slugify and available to
/// the rename rules.
pub fn transliterate(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match deaccent(ch) {
            Some(rep) => out.push_str(rep),
            None => out.push(ch),
        }
    }
    out
}

pub fn slugify(s: &str) -> String {
    let mut out = String::new();
    let mut last_dash = true;
    for ch in transliterate(s).chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

pub fn apply_rules(stem: &str, ext: &str, index: usize, rules: &[RenameRule]) -> AppResult<(String, String)> {
    let mut name = stem.to_string();
    let mut extension = ext.to_string();
    for rule in rules {
        match rule {
            RenameRule::Prefix { text } => name = format!("{text}{name}"),
            RenameRule::Suffix { text } => name = format!("{name}{text}"),
            RenameRule::Replace { find, replace, all } => {
                if find.is_empty() {
                    continue;
                }
                name = if *all { name.replace(find, replace) } else { name.replacen(find, replace, 1) };
            }
            RenameRule::Regex { pattern, replace } => {
                let re = regex::Regex::new(pattern).map_err(|e| {
                    AppError::with_details(ErrorKind::InvalidInput, "That regular expression is not valid.", e.to_string())
                })?;
                name = re.replace_all(&name, replace.as_str()).to_string();
            }
            RenameRule::Sequence { start, padding, separator, position } => {
                let n = *start as usize + index;
                let num = format!("{:0width$}", n, width = *padding as usize);
                name = if position == "prefix" {
                    format!("{num}{separator}{name}")
                } else {
                    format!("{name}{separator}{num}")
                };
            }
            RenameRule::Case { mode } => name = to_case(&name, mode),
            RenameRule::Slugify => name = slugify(&name),
            RenameRule::Transliterate => name = transliterate(&name),
            RenameRule::RemoveChars { chars } => name = name.chars().filter(|c| !chars.contains(*c)).collect(),
            RenameRule::ChangeExtension { ext } => extension = ext.trim_start_matches('.').to_string(),
        }
    }
    Ok((paths::sanitize_filename(&name), extension))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamePreview {
    pub path: String,
    pub from: String,
    pub to: String,
    pub conflict: bool,
}

#[tauri::command]
pub fn preview_rename(inputs: Vec<String>, rules: Vec<RenameRule>) -> AppResult<Vec<RenamePreview>> {
    let files = paths::validate_inputs(&inputs)?;
    let mut seen: HashMap<String, usize> = HashMap::new();
    let mut out = Vec::new();
    for (i, f) in files.iter().enumerate() {
        let (stem, ext) = apply_rules(&paths::stem(f), &paths::extension(f), i, &rules)?;
        let new_name = if ext.is_empty() { stem } else { format!("{stem}.{ext}") };
        let dir = f.parent().unwrap_or(Path::new("."));
        let target = dir.join(&new_name);
        let key = target.to_string_lossy().to_string();
        let dup = seen.insert(key, i).is_some();
        let conflict = dup || (target.exists() && target != *f);
        out.push(RenamePreview {
            path: f.to_string_lossy().to_string(),
            from: paths::display_name(f),
            to: new_name,
            conflict,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn batch_rename(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    rules: Vec<RenameRule>,
    copy_instead: Option<bool>,
) -> AppResult<BatchResult> {
    let files = paths::validate_inputs(&inputs)?;
    let copy_instead = copy_instead.unwrap_or(false);
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();
    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.0, f);
        let outcome = (|| -> AppResult<FileResult> {
            let (stem, ext) = apply_rules(&paths::stem(f), &paths::extension(f), i, &rules)?;
            let new_name = if ext.is_empty() { stem } else { format!("{stem}.{ext}") };
            let dir = f.parent().unwrap_or(Path::new("."));
            let candidate = dir.join(paths::sanitize_filename(&new_name));
            if candidate == *f {
                return Ok(FileResult::from_source(f, f, Disposition::Skipped).with_note("Name unchanged"));
            }
            let dest = paths::finalize_destination(candidate, f, "rename")?;
            if copy_instead {
                std::fs::copy(f, &dest.path)?;
            } else {
                std::fs::rename(f, &dest.path)?;
            }
            Ok(FileResult::from_source(&dest.path, f, dest.disposition))
        })();
        match outcome {
            Ok(r) => batch.results.push(r),
            Err(e) => batch.push_failure(f, e),
        }
        ctx.emit_item(i + 1, 0.0, f);
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

// ---------------------------------------------------------------- folder tools

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub file_count: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderReport {
    pub root: String,
    pub total_size: u64,
    pub file_count: u64,
    pub dir_count: u64,
    pub entries: Vec<FolderEntry>,
    pub by_kind: Vec<(String, u64, u64)>,
    pub largest: Vec<FolderEntry>,
}

#[tauri::command]
pub fn analyze_folder(path: String, top_n: Option<usize>) -> AppResult<FolderReport> {
    let root = paths::validate_input_dir(&path)?;
    let top_n = top_n.unwrap_or(25);
    let mut total: u64 = 0;
    let mut files: u64 = 0;
    let mut dirs: u64 = 0;
    let mut by_kind: HashMap<String, (u64, u64)> = HashMap::new();
    let mut all: Vec<FolderEntry> = Vec::new();
    let mut child_sizes: HashMap<PathBuf, (u64, u64)> = HashMap::new();

    for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_dir() {
            if entry.depth() > 0 {
                dirs += 1;
            }
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let size = meta.len();
        total += size;
        files += 1;
        let ext = paths::extension(entry.path());
        let kind = kind_for_extension(&ext).to_string();
        let slot = by_kind.entry(kind).or_insert((0, 0));
        slot.0 += size;
        slot.1 += 1;
        // Attribute to the first-level child of root.
        if let Ok(rel) = entry.path().strip_prefix(&root) {
            if let Some(first) = rel.components().next() {
                let key = root.join(first.as_os_str());
                let slot = child_sizes.entry(key).or_insert((0, 0));
                slot.0 += size;
                slot.1 += 1;
            }
        }
        all.push(FolderEntry {
            path: entry.path().to_string_lossy().to_string(),
            name: paths::display_name(entry.path()),
            size,
            is_dir: false,
            file_count: 1,
        });
    }

    all.sort_by_key(|e| std::cmp::Reverse(e.size));
    let largest = all.into_iter().take(top_n).collect();

    let mut entries: Vec<FolderEntry> = child_sizes
        .into_iter()
        .map(|(p, (size, count))| FolderEntry {
            name: paths::display_name(&p),
            is_dir: p.is_dir(),
            path: p.to_string_lossy().to_string(),
            size,
            file_count: count,
        })
        .collect();
    entries.sort_by_key(|e| std::cmp::Reverse(e.size));

    let mut kinds: Vec<(String, u64, u64)> = by_kind.into_iter().map(|(k, (s, c))| (k, s, c)).collect();
    kinds.sort_by_key(|k| std::cmp::Reverse(k.1));

    Ok(FolderReport {
        root: root.to_string_lossy().to_string(),
        total_size: total,
        file_count: files,
        dir_count: dirs,
        entries,
        by_kind: kinds,
        largest,
    })
}

#[tauri::command]
pub async fn flatten_folder(
    app: AppHandle,
    job_id: String,
    source: String,
    destination: Option<String>,
    copy_files: Option<bool>,
) -> AppResult<BatchResult> {
    let root = paths::validate_input_dir(&source)?;
    let dest_dir = match destination.as_deref().filter(|d| !d.trim().is_empty()) {
        Some(d) => PathBuf::from(d),
        None => root.join("_flattened"),
    };
    std::fs::create_dir_all(&dest_dir)?;
    let copy_files = copy_files.unwrap_or(true);

    let files: Vec<PathBuf> = WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .filter(|p| p.parent() != Some(dest_dir.as_path()))
        .collect();

    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();
    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.0, f);
        let candidate = dest_dir.join(paths::display_name(f));
        match paths::finalize_destination(candidate, f, "rename").and_then(|dest| {
            if copy_files {
                std::fs::copy(f, &dest.path)?;
            } else {
                std::fs::rename(f, &dest.path)?;
            }
            Ok(FileResult::from_source(&dest.path, f, dest.disposition))
        }) {
            Ok(r) => batch.results.push(r),
            Err(e) => batch.push_failure(f, e),
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

#[tauri::command]
pub async fn organize_folder(
    app: AppHandle,
    job_id: String,
    source: String,
    copy_files: Option<bool>,
    by_kind: Option<bool>,
) -> AppResult<BatchResult> {
    let root = paths::validate_input_dir(&source)?;
    let copy_files = copy_files.unwrap_or(false);
    let by_kind = by_kind.unwrap_or(true);
    let files: Vec<PathBuf> = std::fs::read_dir(&root)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file() && !paths::display_name(p).starts_with('.'))
        .collect();

    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();
    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.0, f);
        let ext = paths::extension(f);
        let bucket = if by_kind {
            match kind_for_extension(&ext) {
                "image" | "svg" => "Images",
                "video" => "Videos",
                "audio" => "Audio",
                "pdf" | "document" | "text" => "Documents",
                "archive" => "Archives",
                "code" | "data" => "Code",
                _ => "Other",
            }
            .to_string()
        } else if ext.is_empty() {
            "Other".to_string()
        } else {
            ext.to_uppercase()
        };
        let dir = root.join(paths::sanitize_filename(&bucket));
        let outcome = (|| -> AppResult<FileResult> {
            std::fs::create_dir_all(&dir)?;
            let dest = paths::finalize_destination(dir.join(paths::display_name(f)), f, "rename")?;
            if copy_files {
                std::fs::copy(f, &dest.path)?;
            } else {
                std::fs::rename(f, &dest.path)?;
            }
            Ok(FileResult::from_source(&dest.path, f, dest.disposition).with_note(bucket.clone()))
        })();
        match outcome {
            Ok(r) => batch.results.push(r),
            Err(e) => batch.push_failure(f, e),
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

// ---------------------------------------------------------------- split / join

#[tauri::command]
pub async fn split_file(
    app: AppHandle,
    job_id: String,
    input: String,
    chunk_bytes: u64,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    use std::io::{Read, Write};
    let src = paths::validate_input_file(&input)?;
    if chunk_bytes < 1024 {
        return Err(AppError::invalid("Chunk size must be at least 1 KB."));
    }
    let total_size = std::fs::metadata(&src)?.len();
    let parts = (total_size as f64 / chunk_bytes as f64).ceil() as usize;
    let dir = paths::output_dir_for(&src, &output)?;
    let ctx = JobCtx::new(app, job_id, parts.max(1));
    let started = now_ms();
    let mut batch = BatchResult::default();

    let mut reader = std::fs::File::open(&src)?;
    let mut buf = vec![0u8; 1024 * 1024];
    let mut index = 0usize;
    let mut written_total: u64 = 0;

    'outer: while index < parts {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        let name = format!("{}.{:03}.part", paths::display_name(&src), index + 1);
        let dest = paths::finalize_destination(dir.join(&name), &src, "rename")?;
        let mut writer = std::fs::File::create(&dest.path)?;
        let mut written: u64 = 0;
        while written < chunk_bytes {
            let want = ((chunk_bytes - written) as usize).min(buf.len());
            let n = reader.read(&mut buf[..want])?;
            if n == 0 {
                writer.flush()?;
                if written > 0 {
                    batch.results.push(FileResult::from_source(&dest.path, &src, dest.disposition));
                } else {
                    drop(writer);
                    std::fs::remove_file(&dest.path).ok();
                }
                break 'outer;
            }
            writer.write_all(&buf[..n])?;
            written += n as u64;
            written_total += n as u64;
            ctx.emit(index, Some(written_total as f64 / total_size.max(1) as f64), Some(name.clone()), None);
        }
        writer.flush()?;
        batch.results.push(FileResult::from_source(&dest.path, &src, dest.disposition));
        index += 1;
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

#[tauri::command]
pub async fn join_files(app: AppHandle, job_id: String, inputs: Vec<String>, output: OutputSpec) -> AppResult<FileResult> {
    use std::io::{Read, Write};
    let mut files = paths::validate_inputs(&inputs)?;
    files.sort();
    let first = files.first().ok_or_else(|| AppError::invalid("Select the part files to join."))?.clone();
    // "movie.mp4.001.part" → "movie.mp4"
    let base = paths::display_name(&first);
    let stem = base
        .rsplit_once(".part")
        .map(|(head, _)| head)
        .unwrap_or(&base)
        .rsplit_once('.')
        .map(|(head, _)| head.to_string())
        .unwrap_or_else(|| paths::stem(&first));
    let dir = paths::output_dir_for(&first, &output)?;
    let dest = paths::finalize_destination(dir.join(paths::sanitize_filename(&stem)), &first, &output.collision)?;
    if dest.is_skipped() {
        return Ok(FileResult::skipped(&dest, &first));
    }
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut writer = std::fs::File::create(&dest.path)?;
    let mut buf = vec![0u8; 1024 * 1024];
    for (i, f) in files.iter().enumerate() {
        ctx.bail_if_cancelled()?;
        ctx.emit_item(i, 0.0, f);
        let mut reader = std::fs::File::open(f)?;
        loop {
            let n = reader.read(&mut buf)?;
            if n == 0 {
                break;
            }
            writer.write_all(&buf[..n])?;
        }
    }
    writer.flush()?;
    let mut result = FileResult::new(&dest.path, dest.disposition);
    result.note = Some(format!("Joined {} parts in {} ms", files.len(), now_ms().saturating_sub(started)));
    Ok(result)
}

// ---------------------------------------------------------------- secure delete

#[tauri::command]
pub async fn secure_delete(app: AppHandle, job_id: String, inputs: Vec<String>, passes: Option<u8>) -> AppResult<BatchResult> {
    use std::io::{Seek, SeekFrom, Write};
    let files = paths::validate_inputs(&inputs)?;
    let passes = passes.unwrap_or(1).clamp(1, 7);
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();
    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.0, f);
        let outcome = (|| -> AppResult<FileResult> {
            let len = std::fs::metadata(f)?.len();
            let mut file = std::fs::OpenOptions::new().write(true).open(f)?;
            let chunk = vec![0u8; 1024 * 1024];
            for pass in 0..passes {
                file.seek(SeekFrom::Start(0))?;
                let mut remaining = len;
                let byte = if pass % 2 == 0 { 0x00 } else { 0xFF };
                let filled: Vec<u8> = chunk.iter().map(|_| byte).collect();
                while remaining > 0 {
                    let n = (remaining as usize).min(filled.len());
                    file.write_all(&filled[..n])?;
                    remaining -= n as u64;
                }
                file.flush()?;
                file.sync_all()?;
            }
            drop(file);
            let scrambled = f.with_file_name(format!("{}.gone", uuid::Uuid::new_v4().simple()));
            std::fs::rename(f, &scrambled)?;
            std::fs::remove_file(&scrambled)?;
            Ok(FileResult {
                path: f.to_string_lossy().to_string(),
                name: paths::display_name(f),
                size: 0,
                source: Some(f.to_string_lossy().to_string()),
                source_size: Some(len),
                disposition: Disposition::Created,
                note: Some(format!("Overwritten {passes}× and removed")),
            })
        })();
        match outcome {
            Ok(r) => batch.results.push(r),
            Err(e) => batch.push_failure(f, e),
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_makes_url_safe_names() {
        assert_eq!(slugify("Hello World! 2024"), "hello-world-2024");
        assert_eq!(slugify("  --weird__name--  "), "weird-name");
        assert_eq!(slugify("ñañá"), "nana");
        assert_eq!(slugify("Café Über"), "cafe-uber");
    }

    #[test]
    fn rename_rules_compose_in_order() {
        let rules = vec![
            RenameRule::Prefix { text: "IMG_".into() },
            RenameRule::Sequence { start: 1, padding: 3, separator: "_".into(), position: "suffix".into() },
            RenameRule::Case { mode: "lower".into() },
        ];
        let (stem, ext) = apply_rules("Photo", "JPG", 0, &rules).unwrap();
        assert_eq!(stem, "img_photo_001");
        assert_eq!(ext, "JPG");
    }

    #[test]
    fn rename_rejects_bad_regex() {
        let rules = vec![RenameRule::Regex { pattern: "([".into(), replace: "".into() }];
        assert!(apply_rules("a", "txt", 0, &rules).is_err());
    }

    #[test]
    fn rename_output_is_always_a_single_component() {
        let rules = vec![RenameRule::Prefix { text: "../../".into() }];
        let (stem, _) = apply_rules("file", "txt", 0, &rules).unwrap();
        assert!(!stem.contains('/'));
    }

    #[test]
    fn kinds_cover_the_common_extensions() {
        assert_eq!(kind_for_extension("heic"), "image");
        assert_eq!(kind_for_extension("mp4"), "video");
        assert_eq!(kind_for_extension("flac"), "audio");
        assert_eq!(kind_for_extension("pdf"), "pdf");
        assert_eq!(kind_for_extension("svg"), "svg");
        assert_eq!(kind_for_extension("zip"), "archive");
        assert_eq!(kind_for_extension("xyz"), "other");
    }
}

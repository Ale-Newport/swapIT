use crate::error::{AppError, AppResult, ErrorKind};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

/// How a tool decides where to write its results.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputSpec {
    /// "same_dir" writes next to the input, "custom" writes into `dir`.
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default)]
    pub dir: Option<String>,
    /// Appended to the file stem, e.g. "-compressed".
    #[serde(default)]
    pub suffix: Option<String>,
    /// "rename" (default, never overwrites), "skip" or "overwrite".
    #[serde(default = "default_collision")]
    pub collision: String,
    /// Optional explicit stem override (used by single-file tools).
    #[serde(default)]
    pub filename: Option<String>,
}

fn default_mode() -> String {
    "same_dir".to_string()
}
fn default_collision() -> String {
    "rename".to_string()
}

impl Default for OutputSpec {
    fn default() -> Self {
        Self {
            mode: default_mode(),
            dir: None,
            suffix: None,
            collision: default_collision(),
            filename: None,
        }
    }
}

/// What happened when a destination already existed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Disposition {
    Created,
    Renamed,
    Overwritten,
    Skipped,
}

pub struct Destination {
    pub path: PathBuf,
    pub disposition: Disposition,
}

impl Destination {
    /// True when the user's collision policy is "skip" and the file already
    /// exists. `path` then points at the **existing** file, so a caller that
    /// writes to it anyway would destroy the very file it was asked to leave
    /// alone. Every writer must check this first.
    pub fn is_skipped(&self) -> bool {
        self.disposition == Disposition::Skipped
    }
}

/// Characters that are illegal (or merely hostile) inside a file name.
const ILLEGAL: &[char] = &['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0'];

/// Turn arbitrary user text into a safe single path component.
/// Never returns an empty string, a path separator, or a relative traversal token.
pub fn sanitize_filename(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if ILLEGAL.contains(&ch) || (ch as u32) < 0x20 {
            out.push('_');
        } else {
            out.push(ch);
        }
    }
    let trimmed = out.trim().trim_matches('.').trim();
    let cleaned = if trimmed.is_empty() { "untitled" } else { trimmed };
    // Guard against reserved traversal names surviving the pass above.
    let cleaned = match cleaned {
        "." | ".." => "untitled",
        other => other,
    };
    let mut result: String = cleaned.chars().take(200).collect();
    if result.trim().is_empty() {
        result = "untitled".to_string();
    }
    result
}

/// Normalize a path lexically (no filesystem access) resolving `.` and `..`.
pub fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::ParentDir => {
                if !out.pop() {
                    out.push("..");
                }
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Validate that `raw` points at an existing regular file and return its canonical path.
pub fn validate_input_file(raw: &str) -> AppResult<PathBuf> {
    if raw.trim().is_empty() {
        return Err(AppError::invalid("No file was provided."));
    }
    let path = PathBuf::from(raw);
    let canonical = std::fs::canonicalize(&path).map_err(|e| {
        AppError::with_details(
            ErrorKind::NotFound,
            format!("Could not find “{}”.", display_name(&path)),
            e.to_string(),
        )
    })?;
    let meta = std::fs::metadata(&canonical)?;
    if meta.is_dir() {
        return Err(AppError::invalid(format!(
            "“{}” is a folder, but this tool expects a file.",
            display_name(&canonical)
        )));
    }
    Ok(canonical)
}

/// Validate that `raw` points at an existing directory.
pub fn validate_input_dir(raw: &str) -> AppResult<PathBuf> {
    if raw.trim().is_empty() {
        return Err(AppError::invalid("No folder was provided."));
    }
    let canonical = std::fs::canonicalize(PathBuf::from(raw)).map_err(|e| {
        AppError::with_details(ErrorKind::NotFound, format!("Could not find “{raw}”."), e.to_string())
    })?;
    if !canonical.is_dir() {
        return Err(AppError::invalid(format!("“{raw}” is not a folder.")));
    }
    Ok(canonical)
}

pub fn validate_inputs(raw: &[String]) -> AppResult<Vec<PathBuf>> {
    if raw.is_empty() {
        return Err(AppError::invalid("Select at least one file first."));
    }
    raw.iter().map(|p| validate_input_file(p)).collect()
}

pub fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

pub fn stem(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string())
}

pub fn extension(path: &Path) -> String {
    path.extension()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// Produce a path that does not exist yet by appending `_1`, `_2`, … to the stem.
pub fn unique_path(candidate: &Path) -> PathBuf {
    if !candidate.exists() {
        return candidate.to_path_buf();
    }
    let dir = candidate.parent().unwrap_or_else(|| Path::new("."));
    let base = stem(candidate);
    let ext = candidate.extension().map(|e| e.to_string_lossy().to_string());
    for n in 1..100_000u32 {
        let name = match &ext {
            Some(e) => format!("{base}_{n}.{e}"),
            None => format!("{base}_{n}"),
        };
        let next = dir.join(name);
        if !next.exists() {
            return next;
        }
    }
    // Extremely unlikely; fall back to a uuid suffix.
    let name = match &ext {
        Some(e) => format!("{base}_{}.{e}", uuid::Uuid::new_v4().simple()),
        None => format!("{base}_{}", uuid::Uuid::new_v4().simple()),
    };
    dir.join(name)
}

/// Resolve the output directory for an input file according to the spec.
pub fn output_dir_for(input: &Path, spec: &OutputSpec) -> AppResult<PathBuf> {
    let dir = if spec.mode == "custom" {
        let raw = spec
            .dir
            .as_deref()
            .filter(|d| !d.trim().is_empty())
            .ok_or_else(|| AppError::invalid("Choose an output folder first."))?;
        PathBuf::from(raw)
    } else {
        input
            .parent()
            .ok_or_else(|| AppError::invalid("The input file has no parent folder."))?
            .to_path_buf()
    };
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

/// Build the destination path for `input`, honouring suffix, extension and collision policy.
///
/// `new_ext` may be empty to keep the original extension.
pub fn resolve_destination(input: &Path, spec: &OutputSpec, new_ext: &str) -> AppResult<Destination> {
    let dir = output_dir_for(input, spec)?;
    let base = spec
        .filename
        .as_deref()
        .map(sanitize_filename)
        .unwrap_or_else(|| stem(input));
    let suffix = spec.suffix.as_deref().map(sanitize_filename).unwrap_or_default();
    let ext = if new_ext.is_empty() { extension(input) } else { new_ext.trim_start_matches('.').to_string() };
    let name = if ext.is_empty() {
        format!("{base}{suffix}")
    } else {
        format!("{base}{suffix}.{ext}")
    };
    let candidate = dir.join(sanitize_filename(&name));
    finalize_destination(candidate, input, &spec.collision)
}

/// Apply the collision policy to an already-built candidate path.
pub fn finalize_destination(candidate: PathBuf, input: &Path, collision: &str) -> AppResult<Destination> {
    let canonical_input = input.canonicalize().unwrap_or_else(|_| input.to_path_buf());
    let same_as_input = candidate
        .canonicalize()
        .map(|c| c == canonical_input)
        .unwrap_or(false);

    if !candidate.exists() {
        return Ok(Destination { path: candidate, disposition: Disposition::Created });
    }
    // Writing over the very file we are reading is never allowed, whatever the policy.
    if same_as_input {
        return Ok(Destination { path: unique_path(&candidate), disposition: Disposition::Renamed });
    }
    match collision {
        "overwrite" => Ok(Destination { path: candidate, disposition: Disposition::Overwritten }),
        "skip" => Ok(Destination { path: candidate, disposition: Disposition::Skipped }),
        _ => Ok(Destination { path: unique_path(&candidate), disposition: Disposition::Renamed }),
    }
}

/// Convenience for tools that write a directory of results (e.g. extracted frames).
pub fn resolve_output_folder(input: &Path, spec: &OutputSpec, folder_suffix: &str) -> AppResult<PathBuf> {
    let dir = output_dir_for(input, spec)?;
    let base = sanitize_filename(&format!("{}{}", stem(input), folder_suffix));
    let mut candidate = dir.join(&base);
    if candidate.exists() {
        candidate = unique_path(&candidate);
    }
    std::fs::create_dir_all(&candidate)?;
    Ok(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_separators_and_traversal() {
        let escaped = sanitize_filename("../../etc/passwd");
        assert!(!escaped.contains('/'));
        assert!(!escaped.starts_with('.'));
        assert_eq!(Path::new(&escaped).components().count(), 1);
        assert_eq!(sanitize_filename(".."), "untitled");
        assert_eq!(sanitize_filename(""), "untitled");
        assert_eq!(sanitize_filename("   "), "untitled");
        assert_eq!(sanitize_filename("a/b"), "a_b");
        assert_eq!(sanitize_filename("safe name.jpg"), "safe name.jpg");
        assert!(!sanitize_filename("evil\0name").contains('\0'));
    }

    #[test]
    fn sanitize_caps_length() {
        let long = "x".repeat(500);
        assert_eq!(sanitize_filename(&long).chars().count(), 200);
    }

    #[test]
    fn normalize_resolves_dot_segments() {
        assert_eq!(normalize(Path::new("/a/b/../c/./d")), PathBuf::from("/a/c/d"));
    }

    #[test]
    fn unique_path_increments() {
        let dir = std::env::temp_dir().join(format!("toolbox-test-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("file.jpg");
        assert_eq!(unique_path(&p), p);
        std::fs::write(&p, b"x").unwrap();
        assert_eq!(unique_path(&p), dir.join("file_1.jpg"));
        std::fs::write(dir.join("file_1.jpg"), b"x").unwrap();
        assert_eq!(unique_path(&p), dir.join("file_2.jpg"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn destination_never_overwrites_the_input() {
        let dir = std::env::temp_dir().join(format!("toolbox-test-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("photo.jpg");
        std::fs::write(&input, b"x").unwrap();
        let spec = OutputSpec { collision: "overwrite".into(), ..Default::default() };
        let dest = resolve_destination(&input, &spec, "jpg").unwrap();
        assert_ne!(dest.path, input);
        assert_eq!(dest.disposition, Disposition::Renamed);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn destination_applies_suffix_and_extension() {
        let dir = std::env::temp_dir().join(format!("toolbox-test-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("photo.heic");
        std::fs::write(&input, b"x").unwrap();
        let spec = OutputSpec { suffix: Some("-converted".into()), ..Default::default() };
        let dest = resolve_destination(&input, &spec, "jpg").unwrap();
        assert_eq!(dest.path, dir.join("photo-converted.jpg"));
        std::fs::remove_dir_all(&dir).ok();
    }
}

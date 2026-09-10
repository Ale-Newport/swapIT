use crate::error::{AppError, AppResult, ErrorKind};
use crate::jobs::JobCtx;
use crate::paths::{self, Disposition, OutputSpec};
use crate::types::{now_ms, BatchResult, FileResult};
use serde::Serialize;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;
use walkdir::WalkDir;

fn rel_name(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

#[tauri::command]
pub async fn create_archive(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    format: Option<String>,
    archive_name: Option<String>,
    output: OutputSpec,
) -> AppResult<FileResult> {
    if inputs.is_empty() {
        return Err(AppError::invalid("Select files or folders to compress."));
    }
    let format = format.unwrap_or_else(|| "zip".into()).to_lowercase();
    // Collect every file to add, remembering the root each came from.
    let mut entries: Vec<(PathBuf, String)> = Vec::new();
    let mut first_path: Option<PathBuf> = None;
    for raw in &inputs {
        let p = PathBuf::from(raw);
        let canonical = std::fs::canonicalize(&p)
            .map_err(|e| AppError::with_details(ErrorKind::NotFound, format!("Could not read “{raw}”."), e.to_string()))?;
        if first_path.is_none() {
            first_path = Some(canonical.clone());
        }
        if canonical.is_dir() {
            let root = canonical.parent().unwrap_or(&canonical).to_path_buf();
            for entry in WalkDir::new(&canonical).into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_file() {
                    entries.push((entry.path().to_path_buf(), rel_name(&root, entry.path())));
                }
            }
        } else {
            entries.push((canonical.clone(), paths::display_name(&canonical)));
        }
    }
    if entries.is_empty() {
        return Err(AppError::invalid("Nothing to compress — the selection contains no files."));
    }

    let anchor = first_path.unwrap();
    let mut spec = output.clone();
    if spec.filename.is_none() {
        spec.filename = Some(
            archive_name
                .filter(|n| !n.trim().is_empty())
                .unwrap_or_else(|| paths::stem(&anchor)),
        );
    }
    let ext = match format.as_str() {
        "tar" => "tar",
        "tar.gz" | "tgz" | "targz" => "tar.gz",
        _ => "zip",
    };
    let dest = paths::resolve_destination(&anchor, &spec, ext)?;
    if dest.is_skipped() {
        return Ok(FileResult::skipped(&dest, &anchor));
    }
    let ctx = JobCtx::new(app, job_id, entries.len());
    let started = now_ms();

    match ext {
        "zip" => {
            let file = std::fs::File::create(&dest.path)?;
            let mut zip = zip::ZipWriter::new(file);
            let options: zip::write::FileOptions<'_, ()> =
                zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            let mut buf = vec![0u8; 256 * 1024];
            for (i, (path, name)) in entries.iter().enumerate() {
                ctx.bail_if_cancelled()?;
                ctx.emit_item(i, 0.0, path);
                zip.start_file(name.clone(), options)?;
                let mut f = std::fs::File::open(path)?;
                loop {
                    let n = f.read(&mut buf)?;
                    if n == 0 {
                        break;
                    }
                    zip.write_all(&buf[..n])?;
                }
            }
            zip.finish()?;
        }
        "tar" | "tar.gz" => {
            let file = std::fs::File::create(&dest.path)?;
            if ext == "tar" {
                let mut builder = tar::Builder::new(file);
                for (i, (path, name)) in entries.iter().enumerate() {
                    ctx.bail_if_cancelled()?;
                    ctx.emit_item(i, 0.0, path);
                    builder.append_path_with_name(path, name)?;
                }
                builder.finish()?;
            } else {
                let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::default());
                let mut builder = tar::Builder::new(encoder);
                for (i, (path, name)) in entries.iter().enumerate() {
                    ctx.bail_if_cancelled()?;
                    ctx.emit_item(i, 0.0, path);
                    builder.append_path_with_name(path, name)?;
                }
                builder.into_inner()?.finish()?;
            }
        }
        _ => unreachable!(),
    }

    Ok(FileResult::new(&dest.path, dest.disposition)
        .with_note(format!("{} files, {} ms", entries.len(), now_ms().saturating_sub(started))))
}

impl From<zip::result::ZipError> for AppError {
    fn from(e: zip::result::ZipError) -> Self {
        let message = match &e {
            zip::result::ZipError::FileNotFound => "That entry is not in the archive.".to_string(),
            zip::result::ZipError::InvalidArchive(_) => "This file is not a valid ZIP archive.".to_string(),
            zip::result::ZipError::UnsupportedArchive(msg) => {
                if msg.contains("ncrypt") {
                    "This ZIP archive is password protected — Toolbox cannot open it.".to_string()
                } else {
                    format!("This ZIP archive uses a feature Toolbox does not support ({msg}).")
                }
            }
            _ => "The ZIP archive could not be read.".to_string(),
        };
        AppError::with_details(ErrorKind::Process, message, e.to_string())
    }
}

/// Reject any archive entry that would escape the destination directory (Zip Slip).
fn safe_join(dest_root: &Path, entry_name: &str) -> AppResult<PathBuf> {
    let candidate = Path::new(entry_name);
    let mut out = dest_root.to_path_buf();
    for comp in candidate.components() {
        match comp {
            Component::Normal(part) => {
                let cleaned = paths::sanitize_filename(&part.to_string_lossy());
                out.push(cleaned);
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::invalid(format!(
                    "The archive contains an unsafe path (“{entry_name}”) and was not extracted."
                )));
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn extract_archive(
    app: AppHandle,
    job_id: String,
    input: String,
    destination: Option<String>,
) -> AppResult<BatchResult> {
    let file = paths::validate_input_file(&input)?;
    let name = paths::display_name(&file);
    let lower = name.to_lowercase();
    let dest_root = match destination.as_deref().filter(|d| !d.trim().is_empty()) {
        Some(d) => PathBuf::from(d),
        None => {
            let parent = file.parent().unwrap_or(Path::new("."));
            let stem = lower
                .trim_end_matches(".tar.gz")
                .trim_end_matches(".tgz")
                .trim_end_matches(".zip")
                .trim_end_matches(".tar")
                .to_string();
            let base = if stem.is_empty() { paths::stem(&file) } else { stem };
            let candidate = parent.join(paths::sanitize_filename(&base));
            if candidate.exists() { paths::unique_path(&candidate) } else { candidate }
        }
    };
    std::fs::create_dir_all(&dest_root)?;
    let started = now_ms();
    let mut batch = BatchResult::default();

    if lower.ends_with(".zip") {
        let reader = std::fs::File::open(&file)?;
        let mut zip = zip::ZipArchive::new(reader)?;
        let total = zip.len();
        let ctx = JobCtx::new(app, job_id, total);
        for i in 0..total {
            if ctx.is_cancelled() {
                batch.cancelled = true;
                break;
            }
            let mut entry = zip.by_index(i)?;
            let entry_name = entry.name().to_string();
            ctx.emit(i, Some(i as f64 / total.max(1) as f64), Some(entry_name.clone()), None);
            if entry.is_dir() {
                continue;
            }
            let out_path = match safe_join(&dest_root, &entry_name) {
                Ok(p) => p,
                Err(e) => {
                    batch.push_failure(Path::new(&entry_name), e);
                    continue;
                }
            };
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let final_path = if out_path.exists() { paths::unique_path(&out_path) } else { out_path };
            let mut writer = std::fs::File::create(&final_path)?;
            std::io::copy(&mut entry, &mut writer)?;
            batch.results.push(FileResult::from_source(&final_path, &file, Disposition::Created));
        }
    } else if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") || lower.ends_with(".tar") {
        let reader = std::fs::File::open(&file)?;
        let ctx = JobCtx::new(app, job_id, 0);
        let boxed: Box<dyn Read> = if lower.ends_with(".tar") {
            Box::new(reader)
        } else {
            Box::new(flate2::read::GzDecoder::new(reader))
        };
        let mut archive = tar::Archive::new(boxed);
        let entries = archive.entries().map_err(|e| {
            AppError::with_details(ErrorKind::Process, "This file is not a valid TAR archive.", e.to_string())
        })?;
        for (i, entry) in entries.enumerate() {
            if ctx.is_cancelled() {
                batch.cancelled = true;
                break;
            }
            let mut entry = entry.map_err(|e| {
                AppError::with_details(ErrorKind::Process, "An archive entry could not be read.", e.to_string())
            })?;
            let entry_name = entry.path().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
            ctx.emit(i, None, Some(entry_name.clone()), None);
            if entry.header().entry_type().is_dir() {
                continue;
            }
            let out_path = match safe_join(&dest_root, &entry_name) {
                Ok(p) => p,
                Err(e) => {
                    batch.push_failure(Path::new(&entry_name), e);
                    continue;
                }
            };
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let final_path = if out_path.exists() { paths::unique_path(&out_path) } else { out_path };
            let mut writer = std::fs::File::create(&final_path)?;
            std::io::copy(&mut entry, &mut writer)?;
            batch.results.push(FileResult::from_source(&final_path, &file, Disposition::Created));
        }
    } else {
        return Err(AppError::unsupported(format!(
            "Toolbox can extract .zip, .tar and .tar.gz archives — “{name}” is not one of those."
        )));
    }

    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveEntry {
    pub name: String,
    pub size: u64,
    pub compressed: u64,
    pub is_dir: bool,
}

#[tauri::command]
pub fn list_archive(input: String) -> AppResult<Vec<ArchiveEntry>> {
    let file = paths::validate_input_file(&input)?;
    let lower = paths::display_name(&file).to_lowercase();
    let mut out = Vec::new();
    if lower.ends_with(".zip") {
        let reader = std::fs::File::open(&file)?;
        let mut zip = zip::ZipArchive::new(reader)?;
        for i in 0..zip.len() {
            let entry = zip.by_index(i)?;
            out.push(ArchiveEntry {
                name: entry.name().to_string(),
                size: entry.size(),
                compressed: entry.compressed_size(),
                is_dir: entry.is_dir(),
            });
        }
    } else if lower.ends_with(".tar") || lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
        let reader = std::fs::File::open(&file)?;
        let boxed: Box<dyn Read> = if lower.ends_with(".tar") {
            Box::new(reader)
        } else {
            Box::new(flate2::read::GzDecoder::new(reader))
        };
        let mut archive = tar::Archive::new(boxed);
        for entry in archive.entries().map_err(|e| {
            AppError::with_details(ErrorKind::Process, "This file is not a valid TAR archive.", e.to_string())
        })? {
            let entry = entry.map_err(|e| {
                AppError::with_details(ErrorKind::Process, "An archive entry could not be read.", e.to_string())
            })?;
            let size = entry.header().size().unwrap_or(0);
            out.push(ArchiveEntry {
                name: entry.path().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
                size,
                compressed: size,
                is_dir: entry.header().entry_type().is_dir(),
            });
        }
    } else {
        return Err(AppError::unsupported("Toolbox can list .zip, .tar and .tar.gz archives."));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zip_slip_paths_are_rejected() {
        let root = PathBuf::from("/tmp/dest");
        assert!(safe_join(&root, "../../etc/passwd").is_err());
        assert!(safe_join(&root, "/etc/passwd").is_err());
        assert!(safe_join(&root, "a/../../b").is_err());
    }

    #[test]
    fn normal_entries_stay_inside_the_destination() {
        let root = PathBuf::from("/tmp/dest");
        let p = safe_join(&root, "folder/sub/file.txt").unwrap();
        assert!(p.starts_with(&root));
        assert!(p.ends_with("folder/sub/file.txt"));
    }

    #[test]
    fn entry_names_are_sanitised() {
        let root = PathBuf::from("/tmp/dest");
        let p = safe_join(&root, "we:ird*name?.txt").unwrap();
        assert!(p.to_string_lossy().contains("we_ird_name_.txt"));
    }
}

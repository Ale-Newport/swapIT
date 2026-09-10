use crate::error::{AppError, AppResult};
use crate::jobs::JobCtx;
use crate::paths;
use crate::types::now_ms;
use md5::Md5;
use serde::Serialize;
use sha1::Sha1;
use sha2::{Digest, Sha256, Sha512};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileHashes {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub md5: Option<String>,
    pub sha1: Option<String>,
    pub sha256: Option<String>,
    pub sha512: Option<String>,
}

/// Hash a file by streaming it — a 40 GB video never lands in memory.
fn hash_file(path: &Path, algos: &[String]) -> AppResult<FileHashes> {
    let mut file = std::fs::File::open(path)?;
    let want = |a: &str| algos.is_empty() || algos.iter().any(|x| x.eq_ignore_ascii_case(a));
    let mut md5 = want("md5").then(Md5::new);
    let mut sha1 = want("sha1").then(Sha1::new);
    let mut sha256 = want("sha256").then(Sha256::new);
    let mut sha512 = want("sha512").then(Sha512::new);

    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        let chunk = &buf[..n];
        if let Some(h) = md5.as_mut() { h.update(chunk); }
        if let Some(h) = sha1.as_mut() { h.update(chunk); }
        if let Some(h) = sha256.as_mut() { h.update(chunk); }
        if let Some(h) = sha512.as_mut() { h.update(chunk); }
    }
    Ok(FileHashes {
        path: path.to_string_lossy().to_string(),
        name: paths::display_name(path),
        size: std::fs::metadata(path).map(|m| m.len()).unwrap_or(0),
        md5: md5.map(|h| hex::encode(h.finalize())),
        sha1: sha1.map(|h| hex::encode(h.finalize())),
        sha256: sha256.map(|h| hex::encode(h.finalize())),
        sha512: sha512.map(|h| hex::encode(h.finalize())),
    })
}

#[tauri::command]
pub async fn hash_files(app: AppHandle, job_id: String, inputs: Vec<String>, algorithms: Vec<String>) -> AppResult<Vec<FileHashes>> {
    let files = paths::validate_inputs(&inputs)?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let mut out = Vec::new();
    for (i, f) in files.iter().enumerate() {
        ctx.bail_if_cancelled()?;
        ctx.emit_item(i, 0.0, f);
        out.push(hash_file(f, &algorithms)?);
    }
    ctx.emit(files.len(), Some(1.0), None, None);
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub files: Vec<String>,
    pub wasted: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateReport {
    pub groups: Vec<DuplicateGroup>,
    pub scanned: usize,
    pub total_wasted: u64,
    pub elapsed_ms: u64,
}

/// Find duplicates in two stages: group by size (free), then hash only the collisions.
#[tauri::command]
pub async fn find_duplicates(
    app: AppHandle,
    job_id: String,
    folders: Vec<String>,
    recursive: Option<bool>,
    min_bytes: Option<u64>,
) -> AppResult<DuplicateReport> {
    let recursive = recursive.unwrap_or(true);
    let min_bytes = min_bytes.unwrap_or(1);
    if folders.is_empty() {
        return Err(AppError::invalid("Choose at least one folder to scan."));
    }
    let started = now_ms();
    let mut by_size: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    for folder in &folders {
        let root = paths::validate_input_dir(folder)?;
        let walker = if recursive { WalkDir::new(&root) } else { WalkDir::new(&root).max_depth(1) };
        for entry in walker.into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            if meta.len() < min_bytes {
                continue;
            }
            by_size.entry(meta.len()).or_default().push(entry.path().to_path_buf());
        }
    }

    let candidates: Vec<(u64, Vec<PathBuf>)> = by_size.into_iter().filter(|(_, v)| v.len() > 1).collect();
    let scanned: usize = candidates.iter().map(|(_, v)| v.len()).sum();
    let ctx = JobCtx::new(app, job_id, scanned.max(1));

    let mut groups: HashMap<String, (u64, Vec<String>)> = HashMap::new();
    let mut processed = 0usize;
    for (size, files) in candidates {
        for f in files {
            if ctx.is_cancelled() {
                break;
            }
            ctx.emit_item(processed, 0.0, &f);
            processed += 1;
            if let Ok(h) = hash_file(&f, &["sha256".to_string()]) {
                if let Some(digest) = h.sha256 {
                    let slot = groups.entry(digest).or_insert((size, Vec::new()));
                    slot.1.push(f.to_string_lossy().to_string());
                }
            }
        }
    }

    let mut out: Vec<DuplicateGroup> = groups
        .into_iter()
        .filter(|(_, (_, files))| files.len() > 1)
        .map(|(hash, (size, files))| {
            let wasted = size * (files.len() as u64 - 1);
            DuplicateGroup { hash, size, files, wasted }
        })
        .collect();
    out.sort_by_key(|g| std::cmp::Reverse(g.wasted));
    let total_wasted = out.iter().map(|g| g.wasted).sum();

    Ok(DuplicateReport { groups: out, scanned, total_wasted, elapsed_ms: now_ms().saturating_sub(started) })
}

#[tauri::command]
pub fn hash_text(text: String, algorithm: String) -> AppResult<String> {
    let bytes = text.as_bytes();
    Ok(match algorithm.to_lowercase().as_str() {
        "md5" => hex::encode(Md5::digest(bytes)),
        "sha1" => hex::encode(Sha1::digest(bytes)),
        "sha256" => hex::encode(Sha256::digest(bytes)),
        "sha512" => hex::encode(Sha512::digest(bytes)),
        other => return Err(AppError::unsupported(format!("Unknown hash algorithm “{other}”."))),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_digests_match() {
        assert_eq!(hash_text("abc".into(), "md5".into()).unwrap(), "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(hash_text("abc".into(), "sha1".into()).unwrap(), "a9993e364706816aba3e25717850c26c9cd0d89d");
        assert_eq!(
            hash_text("abc".into(), "sha256".into()).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn unknown_algorithm_is_rejected() {
        assert!(hash_text("abc".into(), "crc32".into()).is_err());
    }

    #[test]
    fn streaming_hash_matches_oneshot() {
        let dir = std::env::temp_dir().join(format!("tb-hash-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("f.bin");
        let data = vec![7u8; 3 * 1024 * 1024 + 17];
        std::fs::write(&p, &data).unwrap();
        let h = hash_file(&p, &["sha256".into()]).unwrap();
        assert_eq!(h.sha256.unwrap(), hex::encode(Sha256::digest(&data)));
        std::fs::remove_dir_all(&dir).ok();
    }
}

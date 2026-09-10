use crate::paths::Disposition;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// One produced artefact, reported back to the UI for the result screen.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileResult {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub source: Option<String>,
    pub source_size: Option<u64>,
    pub disposition: Disposition,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

impl FileResult {
    pub fn new(path: &Path, disposition: Disposition) -> Self {
        let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        Self {
            path: path.to_string_lossy().to_string(),
            name: crate::paths::display_name(path),
            size,
            source: None,
            source_size: None,
            disposition,
            note: None,
        }
    }
    pub fn from_source(path: &Path, source: &Path, disposition: Disposition) -> Self {
        let mut r = Self::new(path, disposition);
        r.source = Some(source.to_string_lossy().to_string());
        r.source_size = std::fs::metadata(source).map(|m| m.len()).ok();
        r
    }
    /// The report for an input left untouched by the "skip" collision policy.
    pub fn skipped(dest: &crate::paths::Destination, source: &Path) -> Self {
        Self::from_source(&dest.path, source, Disposition::Skipped)
            .with_note("Already exists — skipped")
    }

    pub fn with_note(mut self, note: impl Into<String>) -> Self {
        self.note = Some(note.into());
        self
    }
}

/// A per-item failure inside a batch. The batch keeps going.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFailure {
    pub path: String,
    pub name: String,
    pub message: String,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub results: Vec<FileResult>,
    pub failures: Vec<FileFailure>,
    pub cancelled: bool,
    pub elapsed_ms: u64,
}

impl BatchResult {
    pub fn push_failure(&mut self, path: &Path, err: crate::error::AppError) {
        let crate::error::AppError::Friendly { message, details, .. } = err;
        self.failures.push(FileFailure {
            path: path.to_string_lossy().to_string(),
            name: crate::paths::display_name(path),
            message,
            details,
        });
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobArgs {
    pub job_id: String,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

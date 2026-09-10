use crate::binaries::{self, BinaryStatus};
use crate::error::{AppError, AppResult, ErrorKind};
use crate::jobs;
use crate::paths::{self, OutputSpec};
use crate::settings::{self, Settings};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;

#[tauri::command]
pub fn get_settings() -> Settings {
    settings::load()
}

#[tauri::command]
pub fn update_settings(patch: Value) -> AppResult<Settings> {
    settings::patch(patch)
}

#[tauri::command]
pub fn check_binaries() -> Vec<BinaryStatus> {
    binaries::probe_all()
}

#[tauri::command]
pub fn check_binary(id: String) -> BinaryStatus {
    binaries::probe(&id)
}

#[tauri::command]
pub fn cancel_job(job_id: String) -> bool {
    jobs::cancel(&job_id)
}

/// Compute — but do not create — the path a frontend-side writer should use.
/// Keeps the collision policy in one place even for tools that produce their bytes in JS.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedOutput {
    pub path: String,
    pub name: String,
    pub disposition: crate::paths::Disposition,
}

#[tauri::command]
pub fn plan_output(source: Option<String>, output: OutputSpec, ext: String) -> AppResult<PlannedOutput> {
    let input = match source.as_deref() {
        Some(s) if !s.trim().is_empty() => paths::validate_input_file(s)?,
        _ => {
            // No source file: the output folder must be explicit.
            let dir = output
                .dir
                .as_deref()
                .filter(|d| !d.trim().is_empty())
                .ok_or_else(|| AppError::invalid("Choose an output folder first."))?;
            PathBuf::from(dir).join("untitled")
        }
    };
    let dest = paths::resolve_destination(&input, &output, &ext)?;
    Ok(PlannedOutput {
        name: paths::display_name(&dest.path),
        path: dest.path.to_string_lossy().to_string(),
        disposition: dest.disposition,
    })
}

/// Make a directory (used before frontend-side writes).
#[tauri::command]
pub fn ensure_dir(path: String) -> AppResult<String> {
    let p = PathBuf::from(&path);
    std::fs::create_dir_all(&p)?;
    Ok(p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::not_found("That file is no longer on disk."));
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open")
            .arg("-R")
            .arg(&p)
            .spawn()
            .map_err(|e| AppError::with_details(ErrorKind::Process, "Could not open Finder.", e.to_string()))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let dir = p.parent().unwrap_or(&p);
        opener_open(dir)?;
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn opener_open(p: &std::path::Path) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(p)
        .spawn()
        .map_err(|e| AppError::with_details(ErrorKind::Process, "Could not open the file manager.", e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn open_path(path: String) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::not_found("That file is no longer on disk."));
    }
    #[cfg(target_os = "macos")]
    let program = "/usr/bin/open";
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(&p)
        .spawn()
        .map_err(|e| AppError::with_details(ErrorKind::Process, "Could not open that file.", e.to_string()))?;
    Ok(())
}

/// Show the Homebrew command for a dependency. Toolbox never installs anything by itself.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallInstructions {
    pub id: String,
    pub label: String,
    pub command: String,
    pub homebrew_available: bool,
}

#[tauri::command]
pub fn install_instructions(id: String) -> AppResult<InstallInstructions> {
    let spec = binaries::spec(&id).ok_or_else(|| AppError::invalid(format!("Unknown dependency “{id}”.")))?;
    Ok(InstallInstructions {
        id: spec.id.to_string(),
        label: spec.label.to_string(),
        command: spec.install_hint.to_string(),
        homebrew_available: which::which("brew").is_ok(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub home: String,
    pub downloads: String,
    pub desktop: String,
    pub documents: String,
    pub pictures: String,
    pub config: String,
    pub temp: String,
}

#[tauri::command]
pub fn app_paths() -> AppPaths {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    let s = |p: Option<PathBuf>| p.unwrap_or_else(|| home.clone()).to_string_lossy().to_string();
    AppPaths {
        home: home.to_string_lossy().to_string(),
        downloads: s(dirs::download_dir()),
        desktop: s(dirs::desktop_dir()),
        documents: s(dirs::document_dir()),
        pictures: s(dirs::picture_dir()),
        config: settings::config_dir().to_string_lossy().to_string(),
        temp: std::env::temp_dir().to_string_lossy().to_string(),
    }
}

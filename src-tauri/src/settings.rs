use crate::error::{AppError, AppResult};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Explicit binary path overrides, keyed by binary id ("ffmpeg", "magick", …).
    #[serde(default)]
    pub binaries: Map<String, Value>,
    #[serde(default)]
    pub default_output_dir: Option<String>,
    #[serde(default = "d_same_dir")]
    pub output_mode: String,
    #[serde(default = "d_rename")]
    pub collision: String,
    #[serde(default = "d_true")]
    pub preserve_metadata: bool,
    #[serde(default = "d_jpeg_q")]
    pub jpeg_quality: u8,
    #[serde(default = "d_webp_q")]
    pub webp_quality: u8,
    #[serde(default = "d_light")]
    pub theme: String,
    #[serde(default = "d_true")]
    pub recent_history: bool,
    #[serde(default)]
    pub clipboard_history: bool,
    #[serde(default = "d_true")]
    pub notifications: bool,
    #[serde(default = "d_true")]
    pub remember_output_dir: bool,
    #[serde(default = "d_true")]
    pub open_last_tool: bool,
    #[serde(default = "d_libx264")]
    pub default_video_codec: String,
    #[serde(default = "d_crf")]
    pub default_video_crf: u8,
    /// Anything the frontend wants to persist that the backend does not interpret.
    #[serde(default, flatten)]
    pub extra: Map<String, Value>,
}

fn d_same_dir() -> String { "same_dir".into() }
fn d_rename() -> String { "rename".into() }
fn d_true() -> bool { true }
fn d_jpeg_q() -> u8 { 85 }
fn d_webp_q() -> u8 { 82 }
fn d_light() -> String { "light".into() }
fn d_libx264() -> String { "libx264".into() }
fn d_crf() -> u8 { 23 }

impl Default for Settings {
    fn default() -> Self {
        Self {
            binaries: Map::new(),
            default_output_dir: None,
            output_mode: d_same_dir(),
            collision: d_rename(),
            preserve_metadata: true,
            jpeg_quality: d_jpeg_q(),
            webp_quality: d_webp_q(),
            theme: d_light(),
            recent_history: true,
            clipboard_history: false,
            notifications: true,
            remember_output_dir: true,
            open_last_tool: true,
            default_video_codec: d_libx264(),
            default_video_crf: d_crf(),
            extra: Map::new(),
        }
    }
}

impl Settings {
    pub fn binary_override(&self, id: &str) -> Option<String> {
        self.binaries
            .get(id)
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    }
}

static CACHE: Lazy<RwLock<Option<Settings>>> = Lazy::new(|| RwLock::new(None));

pub fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
        .join("Toolbox")
}

pub fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

pub fn load() -> Settings {
    if let Some(cached) = CACHE.read().ok().and_then(|g| g.clone()) {
        return cached;
    }
    let loaded = std::fs::read_to_string(settings_path())
        .ok()
        .and_then(|raw| serde_json::from_str::<Settings>(&raw).ok())
        .unwrap_or_default();
    if let Ok(mut guard) = CACHE.write() {
        *guard = Some(loaded.clone());
    }
    loaded
}

pub fn save(settings: &Settings) -> AppResult<()> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir)?;
    let raw = serde_json::to_string_pretty(settings)?;
    std::fs::write(settings_path(), raw)?;
    if let Ok(mut guard) = CACHE.write() {
        *guard = Some(settings.clone());
    }
    Ok(())
}

/// Merge a partial JSON patch into the stored settings.
pub fn patch(patch: Value) -> AppResult<Settings> {
    let current = load();
    let mut base = serde_json::to_value(&current)?;
    let (Value::Object(base_map), Value::Object(patch_map)) = (&mut base, patch) else {
        return Err(AppError::invalid("Settings patch must be an object."));
    };
    for (k, v) in patch_map {
        if k == "binaries" {
            if let (Some(Value::Object(existing)), Value::Object(incoming)) =
                (base_map.get_mut("binaries"), v.clone())
            {
                for (bk, bv) in incoming {
                    existing.insert(bk, bv);
                }
                continue;
            }
        }
        base_map.insert(k, v);
    }
    let merged: Settings = serde_json::from_value(base)?;
    save(&merged)?;
    Ok(merged)
}

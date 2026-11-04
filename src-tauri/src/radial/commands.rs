//! Tauri commands of the radial layer (docs/RADIAL.md §3).

use super::config::{RadialConfig, SHORTCUT_KINDS};
use super::hotkeys::ShortcutStatus;
use super::window::LayoutArgs;
use super::{permissions, service, window, OpenPayload, Point, ShowRequest, Trigger, STATE};
use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tauri::AppHandle;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ShowArgs {
    pub paths: Vec<String>,
    pub folder: Option<String>,
    pub trigger: Option<Trigger>,
    pub intent: Option<String>,
    pub at: Option<Point>,
}

/// Show the ring for explicit paths — the main window's way in.
#[tauri::command]
pub fn radial_show(app: AppHandle, args: ShowArgs) -> AppResult<()> {
    let mut req = ShowRequest::new(args.trigger.unwrap_or(Trigger::App), args.intent.as_deref().unwrap_or("ring"));
    req.paths = args.paths;
    req.folder = args.folder;
    req.at = args.at.map(|p| (p.x, p.y));
    super::show_for_paths(&app, req);
    Ok(())
}

#[tauri::command]
pub fn radial_hide(app: AppHandle, restore_focus: Option<bool>) -> AppResult<()> {
    window::hide(&app, restore_focus.unwrap_or(true));
    Ok(())
}

/// The webview has painted the ring for `session`: let the window be seen.
#[tauri::command]
pub fn radial_ready(app: AppHandle, session: u64) -> AppResult<()> {
    let handle = app.clone();
    let _ = handle.run_on_main_thread(move || window::reveal(&app, session));
    Ok(())
}

#[tauri::command]
pub fn radial_release_focus(app: AppHandle) -> AppResult<()> {
    window::release_focus(&app);
    Ok(())
}

#[tauri::command]
pub fn radial_set_layout(app: AppHandle, layout: LayoutArgs) -> AppResult<()> {
    let handle = app.clone();
    let _ = handle.run_on_main_thread(move || window::set_layout(&app, layout));
    Ok(())
}

/// The payload of the ring that is currently up, so a webview that mounted after the
/// `radial://open` event (cold start) can still pick it up. Not in the original contract.
#[tauri::command]
pub fn radial_last_open() -> Option<OpenPayload> {
    STATE.lock().ok().filter(|st| st.visible).and_then(|st| st.last_open.clone())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DragStatus {
    pub enabled: bool,
    pub running: bool,
    pub modifier: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinderActionStatus {
    pub installed: bool,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RadialStatus {
    pub shortcuts: BTreeMap<String, ShortcutStatus>,
    pub drag: DragStatus,
    pub finder_action: FinderActionStatus,
    pub automation: String,
    pub tray: bool,
    pub version: String,
}

#[tauri::command]
pub fn radial_status(app: AppHandle) -> AppResult<RadialStatus> {
    let cfg = RadialConfig::load();
    let (mut shortcuts, drag_running, tray) = STATE
        .lock()
        .map(|st| (st.shortcuts.clone(), st.drag_running, st.tray))
        .unwrap_or_default();
    for kind in SHORTCUT_KINDS {
        shortcuts.entry(kind.to_string()).or_insert_with(|| ShortcutStatus {
            accelerator: cfg.shortcut(kind).to_string(),
            registered: false,
            error: None,
        });
    }
    Ok(RadialStatus {
        shortcuts,
        drag: DragStatus {
            enabled: cfg.enabled && cfg.drag_enabled,
            running: drag_running,
            modifier: cfg.drag_modifier.as_str().to_string(),
        },
        finder_action: FinderActionStatus {
            installed: service::installed(),
            path: service::workflow_path().to_string_lossy().to_string(),
        },
        automation: permissions::automation_status().to_string(),
        tray,
        version: app.package_info().version.to_string(),
    })
}

#[tauri::command]
pub fn install_finder_action() -> AppResult<String> {
    Ok(service::install()?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn uninstall_finder_action() -> AppResult<()> {
    service::uninstall()
}

#[tauri::command]
pub fn open_in_main(app: AppHandle, route: String, files: Option<Vec<String>>) -> AppResult<()> {
    super::open_in_main(&app, &route, &files.unwrap_or_default());
    Ok(())
}

#[tauri::command]
pub fn open_privacy_pane(pane: String) -> AppResult<()> {
    permissions::open_privacy_pane(&pane)
}

/// Fires a harmless Apple Event at Finder so macOS shows its permission prompt, and
/// waits for the answer.
#[tauri::command]
pub async fn request_automation_permission() -> AppResult<String> {
    let status = tauri::async_runtime::spawn_blocking(permissions::request_automation)
        .await
        .unwrap_or("unknown");
    Ok(status.to_string())
}

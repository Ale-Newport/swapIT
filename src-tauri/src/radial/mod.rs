//! The radial menu's native layer. See `docs/RADIAL.md` for the contract with the
//! frontend; this module owns the window, shortcuts, Finder context, glass, drag
//! trigger, tray and the app lifecycle around them.

pub mod commands;
pub mod config;
pub mod context;
pub mod drag;
pub mod geometry;
pub mod glass;
pub mod hotkeys;
pub mod permissions;
pub mod service;
pub mod tray;
pub mod urls;
pub mod window;

use config::RadialConfig;
use context::{FinderContext, FrontApp, FINDER_BUNDLE_ID};
use hotkeys::ShortcutStatus;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use window::LayoutArgs;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Trigger {
    Hotkey,
    Drag,
    OpenWith,
    App,
    Tray,
    Service,
    Url,
    NoteHotkey,
    RecordHotkey,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// Payload of `radial://open` (docs/RADIAL.md §4).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenPayload {
    pub id: u64,
    pub trigger: Trigger,
    pub intent: String,
    pub paths: Vec<String>,
    pub folder: Option<String>,
    pub front_app: Option<FrontApp>,
    pub hold_key: bool,
    pub permission: Option<String>,
    pub cursor: Point,
}

/// Everything `window::present` needs, gathered off the main thread.
#[derive(Debug, Clone)]
pub struct ShowRequest {
    pub trigger: Trigger,
    pub intent: String,
    pub paths: Vec<String>,
    pub folder: Option<String>,
    /// Logical, top-left-origin screen coordinates; `None` = the pointer.
    pub at: Option<(f64, f64)>,
    pub activate: bool,
    /// Shortcut kind whose key-up should be reported (`hold-to-select`), if any.
    pub hold_kind: Option<String>,
    pub permission: Option<String>,
    pub front_app: Option<FrontApp>,
    pub prev_pid: Option<i32>,
}

impl ShowRequest {
    pub fn new(trigger: Trigger, intent: &str) -> Self {
        Self {
            trigger,
            intent: intent.to_string(),
            paths: Vec::new(),
            folder: None,
            at: None,
            activate: true,
            hold_kind: None,
            permission: None,
            front_app: None,
            prev_pid: None,
        }
    }
}

#[derive(Default)]
pub struct State {
    pub session: u64,
    pub visible: bool,
    pub sticky: bool,
    pub drag_mode: bool,
    pub drop_received: bool,
    pub focused_once: bool,
    pub prev_pid: Option<i32>,
    pub last_open: Option<OpenPayload>,
    pub key_down: BTreeMap<String, bool>,
    pub hold_kind: Option<String>,
    pub ring_layout: Option<LayoutArgs>,
    pub shortcuts: BTreeMap<String, ShortcutStatus>,
    pub drag_running: bool,
    pub tray: bool,
    /// Global shortcuts are released while the settings page records a new one, so pressing
    /// the old combination does not fire it. `suspend_epoch` lets a stale auto-resume be ignored.
    pub shortcuts_suspended: bool,
    pub suspend_epoch: u64,
}

impl State {
    pub fn next_session(&mut self) -> u64 {
        self.session += 1;
        self.session
    }
    pub fn reset_visibility(&mut self) {
        self.visible = false;
        self.sticky = false;
        self.drag_mode = false;
        self.drop_received = false;
        self.focused_once = false;
        self.hold_kind = None;
    }
}

pub static STATE: Lazy<Mutex<State>> = Lazy::new(|| Mutex::new(State::default()));

/// Argument the login item is started with: come up quietly in the menu bar.
pub const BACKGROUND_FLAG: &str = "--background";

/// Longest the shortcuts stay released if the page that asked for it never says it is done.
const SUSPEND_LIMIT: Duration = Duration::from_secs(60);

/// The folder a hand-off file from the Quick Action may live in.
pub fn cache_dir() -> std::path::PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("Library/Caches"))
        .join("app.toolbox.desktop")
}

// ------------------------------------------------------------------ setup

/// Called once from `setup`: build the hidden window, then bring settings to life.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    window::create(app)?;
    reconcile(app);
    Ok(())
}

/// Bring shortcuts, drag monitor, tray and dock policy in line with the settings.
/// Idempotent; called at startup and after every `update_settings`.
pub fn reconcile(app: &AppHandle) {
    let cfg = RadialConfig::load();
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let statuses = hotkeys::apply(&handle, &cfg);
        drag::sync(&handle, &cfg);
        let tray_on = tray::sync(&handle, &cfg);
        apply_dock(&handle, &cfg, main_window_visible(&handle));
        if let Ok(mut st) = STATE.lock() {
            st.shortcuts = statuses;
            st.tray = tray_on;
        }
    });
}

fn main_window_visible(app: &AppHandle) -> bool {
    app.get_webview_window("main").and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

fn apply_dock(app: &AppHandle, cfg: &RadialConfig, main_visible: bool) {
    let policy = if cfg.dock_icon(main_visible) {
        tauri::ActivationPolicy::Regular
    } else {
        tauri::ActivationPolicy::Accessory
    };
    let _ = app.set_activation_policy(policy);
}

/// Put the Dock icon in line with whether the main window is open. `main_visible` is passed in
/// because the window may not have reported its new state yet when this runs.
pub fn sync_dock(app: &AppHandle, main_visible: bool) {
    apply_dock(app, &RadialConfig::load(), main_visible);
}

/// Re-register the global shortcuts from the saved settings.
pub fn refresh_shortcuts(app: &AppHandle) {
    let cfg = RadialConfig::load();
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let statuses = hotkeys::apply(&handle, &cfg);
        if let Ok(mut st) = STATE.lock() {
            st.shortcuts = statuses;
        }
    });
}

/// Release (or take back) the global shortcuts while the settings page records a new one.
/// A page that never answers cannot leave them off: they come back after `SUSPEND_LIMIT`.
pub fn suspend_shortcuts(app: &AppHandle, suspended: bool) {
    let epoch = STATE
        .lock()
        .map(|mut st| {
            st.shortcuts_suspended = suspended;
            st.suspend_epoch += 1;
            st.suspend_epoch
        })
        .unwrap_or(0);
    refresh_shortcuts(app);
    if suspended {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(SUSPEND_LIMIT);
            let stale = STATE.lock().map(|st| st.shortcuts_suspended && st.suspend_epoch == epoch).unwrap_or(false);
            if stale {
                suspend_shortcuts(&app, false);
            }
        });
    }
}

// ------------------------------------------------------------------ showing

fn own_pid() -> i32 {
    std::process::id() as i32
}

/// Gather the Finder context (this can take ~100 ms, so never on the main thread) and
/// show the ring.
pub fn show_with_finder(app: &AppHandle, trigger: Trigger, intent: &str, hold_kind: Option<&str>) {
    let app = app.clone();
    let intent = intent.to_string();
    let hold_kind = hold_kind.map(str::to_string);
    std::thread::spawn(move || {
        let cfg = RadialConfig::load();
        let front = context::frontmost();
        let (front_app, prev_pid) = match &front {
            Some(f) if f.pid != own_pid() => (Some(f.app.clone()), Some(f.pid)),
            Some(f) => (Some(f.app.clone()), None),
            None => (None, None),
        };
        let is_finder = front_app.as_ref().is_some_and(|a| a.bundle_id == FINDER_BUNDLE_ID);
        let finder = if is_finder { context::finder_context(Duration::from_millis(2200)) } else { FinderContext::default() };

        let mut req = ShowRequest::new(trigger, &intent);
        req.folder = Some(finder.folder.clone().unwrap_or_else(|| cfg.create_dir_or_desktop()));
        req.paths = finder.paths;
        req.permission = finder.permission;
        req.front_app = front_app;
        req.prev_pid = prev_pid;
        req.hold_kind = hold_kind;
        let handle = app.clone();
        let _ = handle.run_on_main_thread(move || window::present(&app, req));
    });
}

/// Show the ring for explicit paths (main window, Open With, URL, Quick Action).
pub fn show_for_paths(app: &AppHandle, mut req: ShowRequest) {
    let cfg = RadialConfig::load();
    if req.folder.is_none() {
        req.folder = req
            .paths
            .first()
            .and_then(|p| std::path::Path::new(p).parent().map(|d| d.to_string_lossy().to_string()))
            .filter(|d| !d.is_empty())
            .or_else(|| Some(cfg.create_dir_or_desktop()));
    }
    if req.front_app.is_none() {
        if let Some(f) = context::frontmost() {
            if f.pid != own_pid() {
                req.prev_pid = req.prev_pid.or(Some(f.pid));
                req.front_app = Some(f.app);
            }
        }
    }
    if req.prev_pid.is_none() && matches!(req.trigger, Trigger::OpenWith | Trigger::Service | Trigger::Url) {
        req.prev_pid = window::finder_pid();
    }
    let handle = app.clone();
    let app = app.clone();
    let _ = handle.run_on_main_thread(move || window::present(&app, req));
}

// ------------------------------------------------------------------ shortcuts

pub fn on_shortcut_pressed(app: &AppHandle, kind: &str) {
    let Some((trigger, intent)) = hotkeys::spec_for(kind) else { return };
    let cfg = RadialConfig::load();
    if !cfg.enabled {
        return;
    }
    let (visible, drag_mode) = STATE
        .lock()
        .map(|mut st| {
            st.key_down.insert(kind.to_string(), true);
            (st.visible, st.drag_mode)
        })
        .unwrap_or((false, false));
    // Pressing the shortcut again while the ring is up closes it.
    if kind == "radial" && visible && !drag_mode {
        window::hide(app, true);
        return;
    }
    let hold = (kind == "radial" && cfg.hold_to_select).then_some(kind);
    show_with_finder(app, trigger, intent, hold);
}

pub fn on_shortcut_released(app: &AppHandle, kind: &str) {
    let report = STATE
        .lock()
        .map(|mut st| {
            st.key_down.insert(kind.to_string(), false);
            let report = st.visible && st.hold_kind.as_deref() == Some(kind);
            if report {
                st.hold_kind = None;
            }
            report
        })
        .unwrap_or(false);
    if report {
        let _ = app.emit_to(window::LABEL, "radial://released", serde_json::json!({}));
    }
}

// ------------------------------------------------------------------ lifecycle

/// Bring the main window up. In menu bar mode the Dock icon comes with it.
pub fn open_main_window(app: &AppHandle) {
    sync_dock(app, true);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// First thing after startup: show the window, unless this is a login launch that should stay
/// in the menu bar. The window is created hidden so a quiet launch never flashes it.
pub fn launch_main_window(app: &AppHandle, background: bool) {
    if RadialConfig::load().quiet_launch(background) {
        sync_dock(app, false);
    } else {
        open_main_window(app);
    }
}

/// A login item written by an earlier version has no `--background` flag, so it would open the
/// window at every login. Rewrite it — but only when it points at this very executable, so a
/// development build never takes over the real one's login item.
pub fn refresh_launch_agent(app: &AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let Ok(exe) = std::env::current_exe() else { return };
    let exe = exe.to_string_lossy().to_string();
    let Some(dir) = dirs::home_dir().map(|h| h.join("Library/LaunchAgents")) else { return };
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let outdated = entries.flatten().any(|e| {
        e.path().extension().is_some_and(|x| x == "plist")
            && std::fs::read_to_string(e.path()).is_ok_and(|t| t.contains(&exe) && !t.contains(BACKGROUND_FLAG))
    });
    if outdated {
        let launcher = app.autolaunch();
        let _ = launcher.disable();
        let _ = launcher.enable();
    }
}

/// Show the main window and ask it to navigate (`app://navigate`).
pub fn open_in_main(app: &AppHandle, route: &str, files: &[String]) {
    window::hide(app, false);
    open_main_window(app);
    let _ = app.emit_to("main", "app://navigate", serde_json::json!({ "route": route, "files": files }));
}

fn handle_opened(app: &AppHandle, opened: &[url::Url]) {
    let Some(parsed) = urls::parse_opened(opened) else { return };
    if let Some(route) = parsed.route {
        open_in_main(app, &route, &[]);
        return;
    }
    let from_files = opened.iter().any(|u| u.scheme() == "file");
    let mut paths = parsed.paths;
    if let Some(list) = &parsed.list {
        paths.extend(urls::read_list_file(list, &cache_dir()));
    }
    let trigger = parsed.trigger.unwrap_or(if from_files { Trigger::OpenWith } else { Trigger::Url });
    let intent = parsed.intent.unwrap_or_else(|| "ring".to_string());
    let mut req = ShowRequest::new(trigger, &intent);
    req.paths = paths;
    req.folder = parsed.folder;
    req.at = parsed.at;
    show_for_paths(app, req);
}

/// `RunEvent` hook: file/URL opens and Dock clicks.
pub fn on_run_event(app: &AppHandle, event: &RunEvent) {
    match event {
        RunEvent::Opened { urls } => handle_opened(app, urls),
        RunEvent::Reopen { has_visible_windows, .. } if !*has_visible_windows => open_main_window(app),
        RunEvent::Exit => drag::stop(),
        _ => {}
    }
}

/// Window events of the `radial` window: focus loss hides it, a drop confirms the drag.
pub fn on_radial_window_event(app: &AppHandle, event: &WindowEvent) {
    match event {
        WindowEvent::Focused(true) => {
            if let Ok(mut st) = STATE.lock() {
                st.focused_once = true;
            }
        }
        WindowEvent::Focused(false) => {
            let hide = STATE.lock().map(|st| st.visible && !st.sticky && st.focused_once).unwrap_or(false);
            if hide {
                // The user clicked into another app: do not pull focus back from it.
                window::hide(app, false);
            }
        }
        WindowEvent::DragDrop(tauri::DragDropEvent::Drop { .. }) => {
            if let Ok(mut st) = STATE.lock() {
                st.drop_received = true;
            }
        }
        _ => {}
    }
}

/// Main-window events: closing hides it while the app stays alive for the shortcut, the ring
/// and the menu bar icon.
pub fn on_main_window_event(window: &tauri::Window, event: &WindowEvent) {
    let app = window.app_handle();
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            if RadialConfig::load().keeps_running() {
                api.prevent_close();
                let _ = window.hide();
                // Menu bar mode: the Dock icon goes with the window.
                sync_dock(app, false);
            }
        }
        // The hidden radial window would otherwise keep the process alive forever.
        WindowEvent::Destroyed if !RadialConfig::load().keeps_running() => app.exit(0),
        _ => {}
    }
}

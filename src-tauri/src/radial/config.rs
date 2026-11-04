//! The radial menu's settings, read from the `extra` map of `settings.json`.
//!
//! The frontend owns the schema (it writes the keys through `update_settings`);
//! this module only interprets them, with the defaults from `docs/RADIAL.md` §1.

use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;

pub const SHORTCUT_KINDS: [&str; 3] = ["radial", "note", "record"];

pub fn default_shortcut(kind: &str) -> &'static str {
    match kind {
        "radial" => "Control+Alt+Space",
        "note" => "Control+Alt+N",
        "record" => "Control+Alt+R",
        _ => "",
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DragModifier {
    Alt,
    Ctrl,
    Shift,
    Cmd,
}

impl DragModifier {
    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "alt" | "option" | "opt" => Some(Self::Alt),
            "ctrl" | "control" => Some(Self::Ctrl),
            "shift" => Some(Self::Shift),
            "cmd" | "command" | "meta" | "super" => Some(Self::Cmd),
            _ => None,
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Alt => "alt",
            Self::Ctrl => "ctrl",
            Self::Shift => "shift",
            Self::Cmd => "cmd",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Appearance {
    Auto,
    Light,
    Dark,
}

impl Appearance {
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "light" => Self::Light,
            "dark" => Self::Dark,
            _ => Self::Auto,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RadialConfig {
    pub enabled: bool,
    /// accelerator per kind (`radial`, `note`, `record`); empty string = disabled.
    pub shortcuts: BTreeMap<String, String>,
    pub hold_to_select: bool,
    pub drag_enabled: bool,
    pub drag_modifier: DragModifier,
    pub create_dir: Option<String>,
    pub keep_running: bool,
    pub menu_bar_icon: bool,
    pub show_in_dock: bool,
    /// Toolbox lives in the menu bar: no Dock icon, no window until asked for.
    pub menu_bar_mode: bool,
    pub theme: Appearance,
}

fn boolean(extra: &Map<String, Value>, key: &str, default: bool) -> bool {
    extra.get(key).and_then(Value::as_bool).unwrap_or(default)
}

impl RadialConfig {
    pub fn from_extra(extra: &Map<String, Value>) -> Self {
        let configured = extra.get("radialShortcuts").and_then(Value::as_object);
        let mut shortcuts = BTreeMap::new();
        for kind in SHORTCUT_KINDS {
            let value = match configured.and_then(|m| m.get(kind)) {
                // An explicit string — including the empty one — wins.
                Some(Value::String(s)) => s.trim().to_string(),
                _ => default_shortcut(kind).to_string(),
            };
            shortcuts.insert(kind.to_string(), value);
        }
        Self {
            enabled: boolean(extra, "radialEnabled", true),
            shortcuts,
            hold_to_select: boolean(extra, "radialHoldToSelect", true),
            drag_enabled: boolean(extra, "radialDragEnabled", true),
            drag_modifier: extra
                .get("radialDragModifier")
                .and_then(Value::as_str)
                .and_then(DragModifier::parse)
                .unwrap_or(DragModifier::Alt),
            create_dir: extra
                .get("radialCreateDir")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string),
            keep_running: boolean(extra, "keepRunning", true),
            menu_bar_icon: boolean(extra, "menuBarIcon", true),
            show_in_dock: boolean(extra, "showInDock", true),
            menu_bar_mode: boolean(extra, "menuBarMode", false),
            theme: extra
                .get("radialTheme")
                .and_then(Value::as_str)
                .map(Appearance::parse)
                .unwrap_or(Appearance::Auto),
        }
    }

    pub fn load() -> Self {
        Self::from_extra(&crate::settings::load().extra)
    }

    /// Where new files go when Finder gives no folder.
    pub fn create_dir_or_desktop(&self) -> String {
        if let Some(dir) = &self.create_dir {
            if std::path::Path::new(dir).is_dir() {
                return dir.clone();
            }
        }
        dirs::desktop_dir()
            .or_else(dirs::home_dir)
            .unwrap_or_else(|| PathBuf::from("/"))
            .to_string_lossy()
            .to_string()
    }

    pub fn shortcut(&self, kind: &str) -> &str {
        self.shortcuts.get(kind).map(String::as_str).unwrap_or("")
    }

    /// Closing the window leaves Toolbox running. Menu bar mode always does.
    pub fn keeps_running(&self) -> bool {
        self.keep_running || self.menu_bar_mode
    }

    /// The menu bar icon is shown. Menu bar mode needs it: it is the only way back in.
    pub fn tray_visible(&self) -> bool {
        self.menu_bar_icon || self.menu_bar_mode
    }

    /// Whether the Dock shows Toolbox. In menu bar mode it does only while the window is open,
    /// so the window behaves like any other app's and the Dock stays clean the rest of the time.
    pub fn dock_icon(&self, main_window_visible: bool) -> bool {
        if self.menu_bar_mode {
            main_window_visible
        } else {
            self.show_in_dock
        }
    }

    /// A launch at login (`--background`) stays quiet when the menu bar icon can bring the
    /// window back; otherwise there would be no way to reach Toolbox at all.
    pub fn quiet_launch(&self, background: bool) -> bool {
        background && self.tray_visible() && self.keeps_running()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn extra(v: Value) -> Map<String, Value> {
        v.as_object().cloned().unwrap_or_default()
    }

    #[test]
    fn defaults_match_the_contract() {
        let c = RadialConfig::from_extra(&Map::new());
        assert!(c.enabled && c.hold_to_select && c.drag_enabled);
        assert_eq!(c.drag_modifier, DragModifier::Alt);
        assert_eq!(c.shortcut("radial"), "Control+Alt+Space");
        assert_eq!(c.shortcut("note"), "Control+Alt+N");
        assert_eq!(c.shortcut("record"), "Control+Alt+R");
        assert!(c.keep_running && c.menu_bar_icon && c.show_in_dock);
        assert!(!c.menu_bar_mode);
        assert_eq!(c.theme, Appearance::Auto);
        assert!(c.create_dir.is_none());
    }

    #[test]
    fn menu_bar_mode_keeps_the_icon_and_the_process_whatever_else_is_set() {
        let c = RadialConfig::from_extra(&extra(json!({
            "menuBarMode": true,
            "keepRunning": false,
            "menuBarIcon": false,
            "showInDock": true,
        })));
        assert!(c.menu_bar_mode && c.keeps_running() && c.tray_visible());
        // Dock icon only while the window is open.
        assert!(c.dock_icon(true));
        assert!(!c.dock_icon(false));
    }

    #[test]
    fn normal_mode_follows_the_individual_switches() {
        let c = RadialConfig::from_extra(&extra(json!({
            "keepRunning": false,
            "menuBarIcon": false,
            "showInDock": false,
        })));
        assert!(!c.keeps_running() && !c.tray_visible());
        assert!(!c.dock_icon(true) && !c.dock_icon(false));
        let docked = RadialConfig::from_extra(&Map::new());
        assert!(docked.dock_icon(false));
    }

    #[test]
    fn a_login_launch_is_quiet_only_when_the_icon_can_bring_the_window_back() {
        let normal = RadialConfig::from_extra(&Map::new());
        assert!(normal.quiet_launch(true));
        // A launch from Launchpad always shows the window.
        assert!(!normal.quiet_launch(false));
        // No icon, nothing keeping it alive: the window is the only way in.
        let stranded = RadialConfig::from_extra(&extra(json!({ "menuBarIcon": false, "keepRunning": false })));
        assert!(!stranded.quiet_launch(true));
        let menu_bar = RadialConfig::from_extra(&extra(json!({ "menuBarMode": true, "menuBarIcon": false })));
        assert!(menu_bar.quiet_launch(true));
    }

    #[test]
    fn an_empty_shortcut_disables_just_that_one() {
        let c = RadialConfig::from_extra(&extra(json!({
            "radialShortcuts": { "radial": "Command+Shift+K", "note": "" }
        })));
        assert_eq!(c.shortcut("radial"), "Command+Shift+K");
        assert_eq!(c.shortcut("note"), "");
        // A key that is absent keeps its default.
        assert_eq!(c.shortcut("record"), "Control+Alt+R");
    }

    #[test]
    fn reads_every_toggle_and_the_modifier() {
        let c = RadialConfig::from_extra(&extra(json!({
            "radialEnabled": false,
            "radialHoldToSelect": false,
            "radialDragEnabled": false,
            "radialDragModifier": "ctrl",
            "radialCreateDir": "  /tmp  ",
            "keepRunning": false,
            "menuBarIcon": false,
            "showInDock": false,
            "radialTheme": "dark",
        })));
        assert!(!c.enabled && !c.hold_to_select && !c.drag_enabled);
        assert_eq!(c.drag_modifier, DragModifier::Ctrl);
        assert_eq!(c.create_dir.as_deref(), Some("/tmp"));
        assert!(!c.keep_running && !c.menu_bar_icon && !c.show_in_dock);
        assert_eq!(c.theme, Appearance::Dark);
    }

    #[test]
    fn garbage_values_fall_back_to_defaults() {
        let c = RadialConfig::from_extra(&extra(json!({
            "radialDragModifier": "hyper",
            "radialEnabled": "yes",
            "radialShortcuts": 7,
            "radialTheme": 3,
        })));
        assert_eq!(c.drag_modifier, DragModifier::Alt);
        assert!(c.enabled);
        assert_eq!(c.shortcut("radial"), "Control+Alt+Space");
        assert_eq!(c.theme, Appearance::Auto);
    }

    #[test]
    fn modifier_names_are_forgiving() {
        assert_eq!(DragModifier::parse("Option"), Some(DragModifier::Alt));
        assert_eq!(DragModifier::parse("Command"), Some(DragModifier::Cmd));
        assert_eq!(DragModifier::parse(" SHIFT "), Some(DragModifier::Shift));
        assert_eq!(DragModifier::parse("fn"), None);
    }

    #[test]
    fn create_dir_falls_back_when_the_folder_is_gone() {
        let c = RadialConfig::from_extra(&extra(json!({ "radialCreateDir": "/definitely/not/here" })));
        assert_ne!(c.create_dir_or_desktop(), "/definitely/not/here");
    }
}

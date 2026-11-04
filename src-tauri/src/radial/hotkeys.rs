//! Global shortcuts. They are registered natively (Carbon hot keys under the hood), so
//! they work while Toolbox is in the background — which is the whole point.
//!
//! Each kind (`radial`, `note`, `record`) maps to a trigger + intent. The radial one
//! also reports key-up so "hold, flick towards a petal, release" works.

use super::config::{RadialConfig, SHORTCUT_KINDS};
use super::Trigger;
use serde::Serialize;
use std::str::FromStr;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
pub struct ShortcutStatus {
    pub accelerator: String,
    pub registered: bool,
    pub error: Option<String>,
}

/// Parse and sanity-check an accelerator such as `Control+Alt+Space`.
///
/// A shortcut with no modifier at all would swallow ordinary typing system-wide, so it
/// is refused unless it is a function key.
pub fn parse_accelerator(raw: &str) -> Result<Shortcut, String> {
    let cleaned = raw.trim();
    if cleaned.is_empty() {
        return Err("Press a key combination first.".into());
    }
    let shortcut = Shortcut::from_str(cleaned)
        .map_err(|_| format!("“{cleaned}” is not a valid shortcut. Try something like Control+Alt+Space."))?;
    let is_function_key = format!("{:?}", shortcut.key).starts_with('F')
        && format!("{:?}", shortcut.key)[1..].chars().all(|c| c.is_ascii_digit());
    if shortcut.mods.is_empty() && !is_function_key {
        return Err("Use at least one modifier key (⌃ ⌥ ⇧ ⌘) so the shortcut cannot hijack typing.".into());
    }
    Ok(shortcut)
}

pub fn spec_for(kind: &str) -> Option<(Trigger, &'static str)> {
    Some(match kind {
        "radial" => (Trigger::Hotkey, "ring"),
        "note" => (Trigger::NoteHotkey, "create:markdown"),
        "record" => (Trigger::RecordHotkey, "record"),
        _ => return None,
    })
}

/// (Re)register every configured shortcut and return the per-kind status.
pub fn apply(app: &AppHandle, cfg: &RadialConfig) -> std::collections::BTreeMap<String, ShortcutStatus> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let mut statuses = std::collections::BTreeMap::new();

    for kind in SHORTCUT_KINDS {
        let accelerator = cfg.shortcut(kind).to_string();
        let mut status = ShortcutStatus { accelerator: accelerator.clone(), registered: false, error: None };
        if accelerator.is_empty() || !cfg.enabled {
            statuses.insert(kind.to_string(), status);
            continue;
        }
        match parse_accelerator(&accelerator) {
            Err(message) => status.error = Some(message),
            Ok(shortcut) => {
                let kind_owned = kind.to_string();
                let outcome = gs.on_shortcut(shortcut, move |app, _shortcut, event| match event.state {
                    ShortcutState::Pressed => super::on_shortcut_pressed(app, &kind_owned),
                    ShortcutState::Released => super::on_shortcut_released(app, &kind_owned),
                });
                match outcome {
                    Ok(()) => status.registered = true,
                    Err(e) => {
                        status.error = Some(format!(
                            "Could not register {accelerator}: another app or macOS may already use it. ({e})"
                        ))
                    }
                }
            }
        }
        statuses.insert(kind.to_string(), status);
    }
    statuses
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_accelerators_parse() {
        for acc in ["Control+Alt+Space", "Control+Alt+N", "Control+Alt+R"] {
            assert!(parse_accelerator(acc).is_ok(), "{acc} should parse");
        }
    }

    #[test]
    fn modifier_spellings_are_accepted() {
        for acc in ["Ctrl+Option+Space", "Cmd+Shift+K", "Command+Alt+1", "Super+Shift+Space", "Alt+Shift+F5"] {
            assert!(parse_accelerator(acc).is_ok(), "{acc} should parse");
        }
    }

    #[test]
    fn a_bare_letter_is_refused_but_a_function_key_is_fine() {
        assert!(parse_accelerator("N").is_err());
        assert!(parse_accelerator("Space").is_err());
        assert!(parse_accelerator("F5").is_ok());
        assert!(parse_accelerator("F13").is_ok());
    }

    #[test]
    fn garbage_is_refused_with_a_readable_message() {
        let e = parse_accelerator("Control+Banana").unwrap_err();
        assert!(e.contains("not a valid shortcut"), "{e}");
        assert!(parse_accelerator("   ").is_err());
        assert!(parse_accelerator("").is_err());
    }

    #[test]
    fn every_kind_has_a_trigger() {
        for kind in SHORTCUT_KINDS {
            assert!(spec_for(kind).is_some());
        }
        assert!(spec_for("bogus").is_none());
    }
}

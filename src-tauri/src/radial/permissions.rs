//! macOS privacy plumbing: can we send Apple Events to Finder, and a shortcut to the
//! right System Settings pane when the answer is no.

use crate::error::{AppError, AppResult, ErrorKind};
use once_cell::sync::Lazy;
use std::sync::Mutex;

static AUTOMATION: Lazy<Mutex<&'static str>> = Lazy::new(|| Mutex::new("unknown"));

/// Remember what the last real Finder call taught us ("granted" / "denied").
pub fn remember_automation(state: &'static str) {
    if let Ok(mut g) = AUTOMATION.lock() {
        *g = state;
    }
}

pub fn last_known_automation() -> &'static str {
    AUTOMATION.lock().map(|g| *g).unwrap_or("unknown")
}

#[cfg(target_os = "macos")]
mod ae {
    use std::ffi::c_void;

    #[repr(C)]
    pub struct AEDesc {
        pub descriptor_type: u32,
        pub data_handle: *mut c_void,
    }

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        pub fn AECreateDesc(type_code: u32, data: *const c_void, size: isize, result: *mut AEDesc) -> i16;
        pub fn AEDisposeDesc(desc: *mut AEDesc) -> i16;
        pub fn AEDeterminePermissionToAutomateTarget(
            target: *const AEDesc,
            event_class: u32,
            event_id: u32,
            ask_user_if_needed: u8,
        ) -> i32;
    }

    pub const TYPE_APPLICATION_BUNDLE_ID: u32 = u32::from_be_bytes(*b"bund");
    pub const WILDCARD: u32 = u32::from_be_bytes(*b"****");
}

/// Map the OSStatus of `AEDeterminePermissionToAutomateTarget` onto our vocabulary.
pub fn status_from_os(status: i32) -> &'static str {
    match status {
        0 => "granted",
        -1743 => "denied",
        // -1744: would need to ask (not asked yet), -600: Finder not running, others.
        _ => "unknown",
    }
}

/// Query (and, when `ask`, prompt for) permission to control `bundle_id`.
#[cfg(target_os = "macos")]
fn determine(bundle_id: &str, ask: bool) -> &'static str {
    use std::ffi::c_void;
    let mut desc = ae::AEDesc { descriptor_type: 0, data_handle: std::ptr::null_mut() };
    let status = unsafe {
        let created = ae::AECreateDesc(
            ae::TYPE_APPLICATION_BUNDLE_ID,
            bundle_id.as_ptr() as *const c_void,
            bundle_id.len() as isize,
            &mut desc,
        );
        if created != 0 {
            return "unknown";
        }
        let s = ae::AEDeterminePermissionToAutomateTarget(&desc, ae::WILDCARD, ae::WILDCARD, u8::from(ask));
        ae::AEDisposeDesc(&mut desc);
        s
    };
    status_from_os(status)
}

#[cfg(not(target_os = "macos"))]
fn determine(_bundle_id: &str, _ask: bool) -> &'static str {
    "unknown"
}

/// Current permission to control Finder, without prompting.
pub fn automation_status() -> &'static str {
    let live = determine(super::context::FINDER_BUNDLE_ID, false);
    if live == "unknown" {
        // Finder not running, or not decided yet: fall back to what a real call told us.
        return last_known_automation();
    }
    remember_automation(live);
    live
}

/// Fire a harmless Apple Event at Finder so macOS shows its prompt. Blocks until the
/// user answers, so call it off the main thread.
pub fn request_automation() -> &'static str {
    let result = determine(super::context::FINDER_BUNDLE_ID, true);
    if result != "unknown" {
        remember_automation(result);
    }
    result
}

pub fn privacy_pane_url(pane: &str) -> Option<&'static str> {
    Some(match pane {
        "automation" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
        "microphone" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
        "accessibility" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        "files" => "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders",
        _ => return None,
    })
}

pub fn open_privacy_pane(pane: &str) -> AppResult<()> {
    let url = privacy_pane_url(pane).ok_or_else(|| AppError::invalid(format!("Unknown privacy pane “{pane}”.")))?;
    std::process::Command::new("/usr/bin/open")
        .arg(url)
        .spawn()
        .map_err(|e| AppError::with_details(ErrorKind::Process, "Could not open System Settings.", e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn os_status_maps_to_the_contract_vocabulary() {
        assert_eq!(status_from_os(0), "granted");
        assert_eq!(status_from_os(-1743), "denied");
        assert_eq!(status_from_os(-1744), "unknown");
        assert_eq!(status_from_os(-600), "unknown");
    }

    #[test]
    fn every_pane_has_a_url_and_junk_has_none() {
        for pane in ["automation", "microphone", "accessibility", "files"] {
            assert!(privacy_pane_url(pane).is_some_and(|u| u.starts_with("x-apple.systempreferences:")));
        }
        assert!(privacy_pane_url("wallpaper").is_none());
    }
}

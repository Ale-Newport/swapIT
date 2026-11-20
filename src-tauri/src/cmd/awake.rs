//! Keep the Mac awake for a while — the radial menu's "Keep awake" petal.
//!
//! This is `caffeinate` run on Toolbox's behalf, nothing more: it holds a power assertion for the
//! chosen time and macOS drops it by itself afterwards. Three flags are used:
//!
//! * `-i` keeps the Mac from going to sleep when idle, `-m` keeps the disk spinning for the same
//!   reason. The display is deliberately *not* held on, so the screen still turns off and the
//!   battery is spared.
//! * `-s` keeps the Mac awake when the lid is closed — macOS only honours that on AC power
//!   (`caffeinate(8)`), which is why the result carries `onBattery` for the UI to say so.
//! * `-w <pid>` ties the assertion to Toolbox: if the app quits or crashes, `caffeinate` lets go
//!   too, so the Mac can never be left awake by accident.
//!
//! Only one session exists at a time; starting another replaces it, which is how "extend" works.

use crate::error::{AppError, AppResult};
use crate::types::now_ms;
use serde::Serialize;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

const CAFFEINATE: &str = "/usr/bin/caffeinate";
const PMSET: &str = "/usr/bin/pmset";
/// A week. The UI never offers more; this only stops a hand-written call from asking for years.
const MAX_MINUTES: u32 = 7 * 24 * 60;

struct Session {
    child: Child,
    started_at: u64,
    /// `None` = until the user stops it.
    ends_at: Option<u64>,
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AwakeStatus {
    pub active: bool,
    /// Unix milliseconds. `None` when the session has no end (or nothing is running).
    pub started_at: Option<u64>,
    pub ends_at: Option<u64>,
    /// The Mac is running on its battery right now: a closed lid would still put it to sleep.
    pub on_battery: bool,
}

/// Whether the Mac is drawing from its battery. Desktops and anything unreadable count as "no".
fn on_battery() -> bool {
    Command::new(PMSET)
        .args(["-g", "batt"])
        .stdin(Stdio::null())
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("Battery Power"))
        .unwrap_or(false)
}

/// Drop the finished session, if any, and report what is left.
fn current(slot: &mut Option<Session>) -> Option<&Session> {
    if let Some(session) = slot.as_mut() {
        // `caffeinate` exits on its own at the end of the time; `try_wait` also reaps it.
        if !matches!(session.child.try_wait(), Ok(None)) {
            *slot = None;
        }
    }
    slot.as_ref()
}

fn status_of(slot: &mut Option<Session>) -> AwakeStatus {
    let battery = on_battery();
    match current(slot) {
        Some(s) => AwakeStatus { active: true, started_at: Some(s.started_at), ends_at: s.ends_at, on_battery: battery },
        None => AwakeStatus { active: false, started_at: None, ends_at: None, on_battery: battery },
    }
}

fn stop_session(slot: &mut Option<Session>) {
    if let Some(mut session) = slot.take() {
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
}

/// Called when Toolbox exits so the assertion goes with it, even before `-w` notices.
pub fn shutdown() {
    if let Ok(mut slot) = SESSION.lock() {
        stop_session(&mut slot);
    }
}

fn spawn(minutes: Option<u32>) -> AppResult<Child> {
    let mut cmd = Command::new(CAFFEINATE);
    cmd.args(["-i", "-m", "-s"]);
    if let Some(m) = minutes {
        cmd.arg("-t").arg((u64::from(m) * 60).to_string());
    }
    cmd.arg("-w").arg(std::process::id().to_string());
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    cmd.spawn().map_err(|e| {
        AppError::with_details(
            crate::error::ErrorKind::Process,
            "Toolbox could not ask macOS to stay awake.",
            format!("{CAFFEINATE}: {e}"),
        )
    })
}

/// Keep the Mac awake for `minutes` (`None` = until stopped). Replaces a running session.
#[tauri::command]
pub fn keep_awake_start(minutes: Option<u32>) -> AppResult<AwakeStatus> {
    if let Some(m) = minutes {
        if m == 0 || m > MAX_MINUTES {
            return Err(AppError::invalid("Choose a time between a minute and a week."));
        }
    }
    let mut slot = SESSION.lock().map_err(|_| AppError::internal("Keep-awake state is unavailable."))?;
    stop_session(&mut slot);
    let child = spawn(minutes)?;
    let started_at = now_ms();
    let ends_at = minutes.map(|m| started_at + u64::from(m) * 60_000);
    *slot = Some(Session { child, started_at, ends_at });
    Ok(status_of(&mut slot))
}

#[tauri::command]
pub fn keep_awake_stop() -> AppResult<AwakeStatus> {
    let mut slot = SESSION.lock().map_err(|_| AppError::internal("Keep-awake state is unavailable."))?;
    stop_session(&mut slot);
    Ok(status_of(&mut slot))
}

#[tauri::command]
pub fn keep_awake_status() -> AppResult<AwakeStatus> {
    let mut slot = SESSION.lock().map_err(|_| AppError::internal("Keep-awake state is unavailable."))?;
    Ok(status_of(&mut slot))
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    /// One test, because the session is process-wide and tests run in parallel.
    #[test]
    fn a_session_starts_replaces_expires_and_stops() {
        shutdown();
        assert!(!keep_awake_status().unwrap().active);

        let first = keep_awake_start(Some(60)).unwrap();
        assert!(first.active);
        assert!(first.ends_at.unwrap() > first.started_at.unwrap());
        assert!(keep_awake_status().unwrap().active);

        // Starting again replaces the session instead of stacking another assertion.
        let second = keep_awake_start(None).unwrap();
        assert!(second.active);
        assert_eq!(second.ends_at, None);

        let stopped = keep_awake_stop().unwrap();
        assert!(!stopped.active);
        assert_eq!(stopped.ends_at, None);

        // A session whose time runs out is noticed without anyone stopping it.
        let short = Command::new(CAFFEINATE).args(["-i", "-t", "1"]).spawn().unwrap();
        *SESSION.lock().unwrap() = Some(Session { child: short, started_at: now_ms(), ends_at: Some(now_ms() + 1000) });
        assert!(keep_awake_status().unwrap().active);
        std::thread::sleep(std::time::Duration::from_millis(1600));
        assert!(!keep_awake_status().unwrap().active);
    }

    #[test]
    fn absurd_times_are_refused() {
        assert!(keep_awake_start(Some(0)).is_err());
        assert!(keep_awake_start(Some(MAX_MINUTES + 1)).is_err());
    }
}

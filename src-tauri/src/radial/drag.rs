//! The Filee gesture: start dragging files from anywhere, hold the modifier, and the
//! ring appears under the pointer; drop on a petal.
//!
//! Detection uses global `NSEvent` monitors for mouse events only, which macOS allows
//! without Accessibility or Input Monitoring: a drag of *files* is recognised by the drag
//! pasteboard (`NSPasteboardNameDrag`) holding file URLs, and the modifier is read
//! with `+[NSEvent modifierFlags]`. The ring is shown without activating Toolbox, so the
//! source app keeps the drag. Ending the drag is detected by polling the left button,
//! because the mouse-up of a drag session is not reliably visible to monitors.

use super::config::{DragModifier, RadialConfig};
use super::{window, ShowRequest, Trigger, STATE};
use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags, NSEventType, NSPasteboard, NSPasteboardNameDrag};
use objc2_foundation::{NSString, NSURL};
use once_cell::sync::Lazy;
use std::cell::RefCell;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// How long the button must stay up, with no drop, before the ring gives up.
const DROP_GRACE: Duration = Duration::from_millis(350);

thread_local! {
    static MONITOR: RefCell<Option<Retained<AnyObject>>> = const { RefCell::new(None) };
}

static MODIFIER: AtomicU8 = AtomicU8::new(0);

#[derive(Default)]
struct DragState {
    /// `changeCount` of the drag pasteboard when we last looked at it.
    seen_count: isize,
    /// File paths of the drag in progress, if it is a file drag.
    candidate: Option<Vec<String>>,
    /// The ring has already been shown for this gesture.
    shown: bool,
}

static DRAG: Lazy<Mutex<DragState>> = Lazy::new(|| Mutex::new(DragState::default()));

fn modifier_code(m: DragModifier) -> u8 {
    match m {
        DragModifier::Alt => 0,
        DragModifier::Ctrl => 1,
        DragModifier::Shift => 2,
        DragModifier::Cmd => 3,
    }
}

fn modifier_down() -> bool {
    let flags = NSEvent::modifierFlags_class();
    let wanted = match MODIFIER.load(Ordering::Relaxed) {
        1 => NSEventModifierFlags::Control,
        2 => NSEventModifierFlags::Shift,
        3 => NSEventModifierFlags::Command,
        _ => NSEventModifierFlags::Option,
    };
    flags.contains(wanted)
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceButtonState(state: i32, button: u32) -> bool;
}

/// Is the left mouse button physically down right now? (combined session state, left)
fn left_button_down() -> bool {
    unsafe { CGEventSourceButtonState(0, 0) }
}

/// File paths on the drag pasteboard, or `None` when the drag carries no files.
fn drag_file_paths() -> Option<Vec<String>> {
    let pb = NSPasteboard::pasteboardWithName(unsafe { NSPasteboardNameDrag });
    let items = pb.pasteboardItems()?;
    let file_url = NSString::from_str("public.file-url");
    let mut paths: Vec<String> = Vec::new();
    for item in items.iter() {
        let Some(text) = item.stringForType(&file_url) else { continue };
        let Some(url) = NSURL::URLWithString(&text) else { continue };
        // Resolves `file:///.file/id=…` reference URLs to real paths.
        let url = url.filePathURL().unwrap_or(url);
        if let Some(path) = url.path() {
            let path = path.to_string();
            if !paths.contains(&path) {
                paths.push(path);
            }
        }
    }
    (!paths.is_empty()).then_some(paths)
}

fn drag_change_count() -> isize {
    NSPasteboard::pasteboardWithName(unsafe { NSPasteboardNameDrag }).changeCount()
}

fn on_mouse_down() {
    // A new gesture: forget the previous one, and only trust pasteboard content that
    // changes from now on (a stale drag pasteboard must not summon the ring).
    if let Ok(mut st) = DRAG.lock() {
        st.candidate = None;
        st.shown = false;
        st.seen_count = drag_change_count();
    }
}

fn on_mouse_dragged(app: &AppHandle) {
    if super::window::is_visible() {
        return;
    }
    let paths = {
        let Ok(mut st) = DRAG.lock() else { return };
        if st.shown {
            return;
        }
        let count = drag_change_count();
        if count != st.seen_count {
            st.seen_count = count;
            st.candidate = drag_file_paths();
        }
        match st.candidate.clone() {
            Some(paths) if modifier_down() => {
                st.shown = true;
                paths
            }
            _ => return,
        }
    };
    let mut req = ShowRequest::new(Trigger::Drag, "ring");
    req.folder = paths
        .first()
        .and_then(|p| std::path::Path::new(p).parent().map(|d| d.to_string_lossy().to_string()));
    req.paths = paths;
    req.activate = false;
    req.front_app = super::context::frontmost().map(|f| f.app);
    window::present(app, req);
}

/// Start or stop the monitors to match the settings. Main thread only.
pub fn sync(app: &AppHandle, cfg: &RadialConfig) {
    MODIFIER.store(modifier_code(cfg.drag_modifier), Ordering::Relaxed);
    let wanted = cfg.enabled && cfg.drag_enabled;
    let running = MONITOR.with(|m| m.borrow().is_some());
    if wanted && !running {
        let app = app.clone();
        let handler = RcBlock::new(move |event: NonNull<NSEvent>| {
            let event = unsafe { event.as_ref() };
            match event.r#type() {
                NSEventType::LeftMouseDown => on_mouse_down(),
                NSEventType::LeftMouseDragged => on_mouse_dragged(&app),
                _ => {}
            }
        });
        let mask = NSEventMask::LeftMouseDown | NSEventMask::LeftMouseDragged;
        let monitor = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mask, &handler);
        MONITOR.with(|m| *m.borrow_mut() = monitor);
    } else if !wanted && running {
        stop_on_main();
    }
    if let Ok(mut st) = STATE.lock() {
        st.drag_running = MONITOR.with(|m| m.borrow().is_some());
    }
}

fn stop_on_main() {
    MONITOR.with(|m| {
        if let Some(monitor) = m.borrow_mut().take() {
            unsafe { NSEvent::removeMonitor(&monitor) };
        }
    });
}

/// Stop monitoring (app exit). Safe from any thread: the monitor is removed on the main
/// thread when we are on it, and otherwise left to die with the process.
pub fn stop() {
    if objc2::MainThreadMarker::new().is_some() {
        stop_on_main();
    }
}

/// Hide the ring if the drag ends without a drop. Runs until the session changes.
pub fn watch_for_end(app: &AppHandle, session: u64) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut released_at: Option<Instant> = None;
        loop {
            std::thread::sleep(Duration::from_millis(40));
            let live = STATE
                .lock()
                .map(|st| st.session == session && st.visible && st.drag_mode && !st.drop_received)
                .unwrap_or(false);
            if !live {
                return;
            }
            if left_button_down() {
                released_at = None;
                continue;
            }
            let since = *released_at.get_or_insert_with(Instant::now);
            if since.elapsed() < DROP_GRACE {
                continue;
            }
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                // A drop may have landed while we were queued.
                let still = STATE
                    .lock()
                    .map(|st| st.session == session && st.visible && st.drag_mode && !st.drop_received)
                    .unwrap_or(false);
                if still {
                    let _ = handle.emit_to(window::LABEL, "radial://drag-ended", serde_json::json!({}));
                    window::hide_now(&handle, false);
                }
            });
            return;
        }
    });
}

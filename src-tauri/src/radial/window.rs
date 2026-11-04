//! The `radial` window: creation, placement, showing and hiding. Everything that touches
//! AppKit lives here or in `glass`, and runs on the main thread.

use super::config::{Appearance, RadialConfig};
use super::geometry::{self, Anchor, Rect, Shape};
use super::{OpenPayload, Point, ShowRequest, State, STATE};
use objc2::rc::Retained;
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSApplication, NSApplicationActivationOptions, NSEvent, NSRunningApplication, NSScreen, NSWindow,
    NSWindowCollectionBehavior,
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "radial";

/// Window level above pop-up menus, so the ring floats over everything (full-screen apps
/// included, together with the collection behaviour below).
const LEVEL_POPUP_MENU: isize = 101;

/// Set once the webview has loaded and had time to register its listeners.
static READY: AtomicBool = AtomicBool::new(false);

pub fn is_ready() -> bool {
    READY.load(Ordering::SeqCst)
}

/// A layout request from the frontend (`radial_set_layout`) — also the default ring.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutArgs {
    pub width: f64,
    pub height: f64,
    pub anchor: Anchor,
    pub shape: Shape,
    #[serde(default)]
    pub sticky: bool,
    #[serde(default)]
    pub appearance: Option<String>,
}

impl LayoutArgs {
    /// 400×400 window, ring of petals 82–180 around a 70 pt core: `docs/RADIAL.md` §2.
    pub fn default_ring() -> Self {
        Self {
            width: 400.0,
            height: 400.0,
            anchor: Anchor::Cursor,
            shape: Shape::Ring { outer: 180.0, inner: 82.0, core: 70.0 },
            sticky: false,
            appearance: None,
        }
    }
}

fn mtm() -> MainThreadMarker {
    MainThreadMarker::new().expect("AppKit calls must run on the main thread")
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Toolbox Radial")
        .inner_size(400.0, 400.0)
        .visible(false)
        .focused(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .accept_first_mouse(true)
        .visible_on_all_workspaces(true)
        .on_page_load(|_webview, payload| {
            if let tauri::webview::PageLoadEvent::Finished = payload.event() {
                // React registers its listeners a beat after the load event.
                std::thread::spawn(|| {
                    std::thread::sleep(std::time::Duration::from_millis(450));
                    READY.store(true, Ordering::SeqCst);
                });
            }
        })
        .build()?;

    let ptr = window.ns_window()? as *mut NSWindow;
    if let Some(ns) = unsafe { Retained::retain(ptr) } {
        configure(&ns);
        super::glass::install(&ns, mtm());
        // Render the default ring mask now so the first show is instant.
        let ring = LayoutArgs::default_ring();
        let appearance = RadialConfig::load().theme;
        super::glass::apply(&ring.shape, ring.width, ring.height, appearance, 2.0);
    }
    Ok(())
}

fn configure(win: &NSWindow) {
    win.setLevel(LEVEL_POPUP_MENU);
    win.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle,
    );
    win.setHidesOnDeactivate(false);
    win.setHasShadow(false);
    win.setOpaque(false);
    win.setMovable(false);
}

pub fn ns_window(app: &AppHandle) -> Option<Retained<NSWindow>> {
    let window = app.get_webview_window(LABEL)?;
    let ptr = window.ns_window().ok()? as *mut NSWindow;
    unsafe { Retained::retain(ptr) }
}

// ------------------------------------------------------------------ screens

fn primary_height(mtm: MainThreadMarker) -> f64 {
    NSScreen::screens(mtm).firstObject().map(|s| s.frame().size.height).unwrap_or(900.0)
}

fn to_rect(r: NSRect) -> Rect {
    Rect::new(r.origin.x, r.origin.y, r.size.width, r.size.height)
}

/// (visible frame, backing scale) of the screen containing `point`, or of the first one.
fn screen_at(mtm: MainThreadMarker, point: (f64, f64)) -> (Rect, f64) {
    let screens = NSScreen::screens(mtm);
    let mut fallback: Option<(Rect, f64)> = None;
    for screen in screens.iter() {
        let entry = (to_rect(screen.visibleFrame()), screen.backingScaleFactor());
        if to_rect(screen.frame()).contains(point.0, point.1) {
            return entry;
        }
        fallback.get_or_insert(entry);
    }
    fallback.unwrap_or((Rect::new(0.0, 0.0, 1440.0, 900.0), 2.0))
}

/// The pointer in AppKit coordinates (bottom-left origin).
pub fn cursor_appkit() -> (f64, f64) {
    let p = NSEvent::mouseLocation();
    (p.x, p.y)
}

/// The pointer in logical, top-left-origin screen coordinates (what the frontend sees).
pub fn cursor_logical(mtm: MainThreadMarker) -> Point {
    let (x, y) = cursor_appkit();
    Point { x, y: primary_height(mtm) - y }
}

// ------------------------------------------------------------------ layout

/// Resize/move the window for `layout` and reshape the glass behind it — in one
/// main-thread turn, so the compositor never shows the old mask on the new size.
pub fn apply_layout(win: &NSWindow, layout: &LayoutArgs, cursor: (f64, f64), mtm: MainThreadMarker) {
    let frame = win.frame();
    let current_center = (frame.origin.x + frame.size.width / 2.0, frame.origin.y + frame.size.height / 2.0);
    let probe = if layout.anchor == Anchor::Keep { current_center } else { cursor };
    let (visible, scale) = screen_at(mtm, probe);
    let target = geometry::place(layout.anchor, layout.width, layout.height, cursor, current_center, visible);

    let appearance = layout
        .appearance
        .as_deref()
        .map(Appearance::parse)
        .unwrap_or_else(|| RadialConfig::load().theme);
    super::glass::apply(&layout.shape, layout.width, layout.height, appearance, scale);

    win.setFrame_display(
        NSRect::new(NSPoint::new(target.x, target.y), NSSize::new(target.w, target.h)),
        true,
    );
}

// ------------------------------------------------------------------ show / hide

/// Show the ring. Must run on the main thread.
pub fn present(app: &AppHandle, req: ShowRequest) {
    if !is_ready() {
        // The webview is still loading (cold start from a URL): wait for it, then retry.
        let app = app.clone();
        std::thread::spawn(move || {
            for _ in 0..160 {
                if is_ready() {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            let handle = app.clone();
            let _ = handle.run_on_main_thread(move || present(&app, req));
        });
        return;
    }
    let mtm = mtm();
    let Some(win) = ns_window(app) else { return };

    let cursor = match req.at {
        Some((x, y)) => (x, primary_height(mtm) - y),
        None => cursor_appkit(),
    };
    let layout = STATE.lock().ok().and_then(|s| s.ring_layout.clone()).unwrap_or_else(LayoutArgs::default_ring);
    let layout = LayoutArgs { anchor: Anchor::Cursor, sticky: false, ..layout };
    apply_layout(&win, &layout, cursor, mtm);
    // The blur is native and appears instantly; the web layer needs a few frames to paint.
    // Showing one without the other flashes an empty ring, so stay transparent until the
    // webview says it is ready (or a short grace period runs out).
    win.setAlphaValue(0.0);

    let payload = {
        let mut st = STATE.lock().expect("radial state poisoned");
        st.next_session();
        let hold_key = req.hold_kind.as_deref().is_some_and(|k| st.key_down.get(k).copied().unwrap_or(false));
        st.hold_kind = hold_key.then(|| req.hold_kind.clone()).flatten();
        st.visible = true;
        st.sticky = false;
        st.drag_mode = req.trigger == super::Trigger::Drag;
        st.drop_received = false;
        st.focused_once = false;
        st.prev_pid = req.prev_pid;
        let payload = OpenPayload {
            id: st.session,
            trigger: req.trigger,
            intent: req.intent.clone(),
            paths: req.paths.clone(),
            folder: req.folder.clone(),
            front_app: req.front_app.clone(),
            hold_key,
            permission: req.permission.clone(),
            cursor: cursor_logical(mtm),
        };
        st.last_open = Some(payload.clone());
        payload
    };

    let _ = app.emit_to(LABEL, "radial://open", &payload);

    if req.activate {
        let ns_app = NSApplication::sharedApplication(mtm);
        #[allow(deprecated)]
        ns_app.activateIgnoringOtherApps(true);
        win.makeKeyAndOrderFront(None);
    } else {
        // Drag mode: do not steal the focus from the app the user is dragging out of.
        win.orderFrontRegardless();
    }

    // Safety net: if the webview never answers, reveal anyway rather than leave nothing on screen.
    let (handle, session) = (app.clone(), payload.id);
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(READY_GRACE_MS));
        let h = handle.clone();
        let _ = h.run_on_main_thread(move || reveal(&handle, session));
    });

    if payload.trigger == super::Trigger::Drag {
        super::drag::watch_for_end(app, payload.id);
    }
}

/// How long to wait for the webview to paint before showing the window regardless.
const READY_GRACE_MS: u64 = 450;

/// Fade the window in once the web layer has painted `session`. Stale calls (a newer ring has
/// opened, or this one was hidden) do nothing. Must run on the main thread.
pub fn reveal(app: &AppHandle, session: u64) {
    let current = STATE.lock().map(|s| (s.session, s.visible)).unwrap_or((0, false));
    if current.0 != session || !current.1 {
        return;
    }
    if let Some(win) = ns_window(app) {
        win.setAlphaValue(1.0);
    }
}

/// Hide the ring. `restore_focus` hands the keyboard back to the app that had it.
pub fn hide(app: &AppHandle, restore_focus: bool) {
    let app = app.clone();
    let handle = app.clone();
    let _ = handle.run_on_main_thread(move || hide_now(&app, restore_focus));
}

pub fn hide_now(app: &AppHandle, restore_focus: bool) {
    let was_visible;
    let prev;
    {
        let mut st = STATE.lock().expect("radial state poisoned");
        was_visible = st.visible;
        prev = st.prev_pid;
        st.reset_visibility();
    }
    if let Some(win) = ns_window(app) {
        win.orderOut(None);
    }
    if restore_focus {
        activate_pid(prev);
    }
    if was_visible {
        let _ = app.emit_to(LABEL, "radial://hidden", serde_json::json!({}));
    }
}

pub fn activate_pid(pid: Option<i32>) {
    let Some(pid) = pid else { return };
    if let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
        app.activateWithOptions(NSApplicationActivationOptions(0));
    }
}

/// pid of the running Finder, used as the "previous app" when Open With launched us.
pub fn finder_pid() -> Option<i32> {
    let apps = NSRunningApplication::runningApplicationsWithBundleIdentifier(&NSString::from_str(
        super::context::FINDER_BUNDLE_ID,
    ));
    apps.firstObject().map(|a| a.processIdentifier())
}

/// Re-activate the previous app but leave the window up (the ring collapsing to a pill).
pub fn release_focus(app: &AppHandle) {
    let prev = {
        let mut st = STATE.lock().expect("radial state poisoned");
        st.sticky = true;
        st.prev_pid
    };
    let _ = app;
    activate_pid(prev);
}

pub fn set_layout(app: &AppHandle, layout: LayoutArgs) {
    let mtm = mtm();
    let Some(win) = ns_window(app) else { return };
    if matches!(layout.shape, Shape::Ring { .. }) {
        let mut st: std::sync::MutexGuard<'_, State> = STATE.lock().expect("radial state poisoned");
        st.ring_layout = Some(layout.clone());
    }
    let cursor = cursor_appkit();
    apply_layout(&win, &layout, cursor, mtm);
    STATE.lock().expect("radial state poisoned").sticky = layout.sticky;
}

pub fn is_visible() -> bool {
    STATE.lock().map(|s| s.visible).unwrap_or(false)
}

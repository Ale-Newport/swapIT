//! Menu-bar icon: the always-there entry point (and the way to quit once the main
//! window has been closed to keep the shortcuts alive).

use super::config::RadialConfig;
use super::{Trigger, STATE};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::AppHandle;

const TRAY_ID: &str = "toolbox-tray";
const ICON: &[u8] = include_bytes!("../../icons/tray.png");

/// What each tray entry does: `(menu id, title, shortcut kind shown next to it)`.
const ENTRIES: [(&str, &str, Option<&str>); 4] = [
    ("radial", "Radial Menu", Some("radial")),
    ("new-text", "New Text File", None),
    ("note", "New Markdown Note", Some("note")),
    ("record", "Record Audio", Some("record")),
];

fn build_menu(app: &AppHandle, cfg: &RadialConfig) -> tauri::Result<Menu<tauri::Wry>> {
    let mut items: Vec<MenuItem<tauri::Wry>> = Vec::new();
    for (id, title, kind) in ENTRIES {
        let accel = kind.map(|k| cfg.shortcut(k)).filter(|a| !a.is_empty());
        // An accelerator macOS cannot render is better dropped than failing the menu.
        let item = match MenuItem::with_id(app, id, title, true, accel) {
            Ok(item) => item,
            Err(_) => MenuItem::with_id(app, id, title, true, None::<&str>)?,
        };
        items.push(item);
    }
    let open = MenuItem::with_id(app, "open", "Open Toolbox", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let customize = MenuItem::with_id(app, "customize", "Customize Rings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Toolbox", true, Some("CmdOrCtrl+Q"))?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    Menu::with_items(
        app,
        &[&items[0], &sep1, &items[1], &items[2], &items[3], &sep2, &open, &customize, &settings, &quit],
    )
}

fn on_menu_event(app: &AppHandle, id: &str) {
    match id {
        "radial" => super::show_with_finder(app, Trigger::Tray, "ring", None),
        "new-text" => super::show_with_finder(app, Trigger::Tray, "create:text", None),
        "note" => super::show_with_finder(app, Trigger::Tray, "create:markdown", None),
        "record" => super::show_with_finder(app, Trigger::Tray, "record", None),
        "open" => super::open_in_main(app, "/", &[]),
        "customize" => super::open_in_main(app, "/radial#rings", &[]),
        "settings" => super::open_in_main(app, "/settings", &[]),
        "quit" => app.exit(0),
        _ => {}
    }
}

/// Create/refresh/hide the tray to match the settings. Returns whether it is visible.
/// Main thread only.
pub fn sync(app: &AppHandle, cfg: &RadialConfig) -> bool {
    let existing = app.tray_by_id(TRAY_ID);
    if !cfg.tray_visible() {
        if let Some(tray) = existing {
            let _ = tray.set_visible(false);
        }
        return false;
    }
    let Ok(menu) = build_menu(app, cfg) else { return false };
    if let Some(tray) = existing {
        let _ = tray.set_menu(Some(menu));
        let _ = tray.set_visible(true);
        return true;
    }
    let Ok(icon) = Image::from_bytes(ICON) else { return false };
    let built = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Toolbox")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| on_menu_event(app, event.id().as_ref()))
        .build(app);
    if let Ok(mut st) = STATE.lock() {
        st.tray = built.is_ok();
    }
    built.is_ok()
}

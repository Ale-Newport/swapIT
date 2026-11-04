//! The native half of the liquid-glass look: an `NSVisualEffectView` sitting *under* the
//! transparent webview, shaped by an alpha mask rendered in Rust.
//!
//! A webview cannot blur what is behind its own window, so the blur has to come from
//! the window server. `maskImage` lets the blur take any silhouette — the petal ring,
//! the centre disc, a pill, a card — and the web layer draws tint, rim light, icons and
//! labels on top with exactly the same radii (they come from one descriptor).

use super::config::Appearance;
use super::geometry::{mask_alpha, Shape};
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{ExtendedColorType, ImageEncoder};
use objc2::rc::Retained;
use objc2::{AnyThread, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua, NSApplication, NSAppearanceNameDarkAqua, NSAutoresizingMaskOptions, NSImage,
    NSVisualEffectBlendingMode, NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView, NSWindow,
    NSWindowOrderingMode,
};
use objc2_foundation::{NSArray, NSData, NSSize};
use std::cell::RefCell;
use std::collections::HashMap;

thread_local! {
    /// AppKit views are main-thread only, so the handle lives in main-thread storage.
    static EFFECT: RefCell<Option<Retained<NSVisualEffectView>>> = const { RefCell::new(None) };
    static LAST_KEY: RefCell<String> = const { RefCell::new(String::new()) };
    /// Rendered masks by shape key, so flipping ring → pill → ring costs nothing.
    static MASKS: RefCell<HashMap<String, Retained<NSImage>>> = RefCell::new(HashMap::new());
}

/// Enough for the ring, the pill, a few cards and both appearances.
const MASK_CACHE_LIMIT: usize = 12;

/// Insert the effect view below the webview in the window's content view.
pub fn install(window: &NSWindow, mtm: MainThreadMarker) {
    let Some(content) = window.contentView() else { return };
    let view = NSVisualEffectView::initWithFrame(NSVisualEffectView::alloc(mtm), content.bounds());
    view.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
    view.setState(NSVisualEffectState::Active);
    view.setMaterial(material_for(Appearance::Auto));
    view.setAutoresizingMask(NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable);
    content.addSubview_positioned_relativeTo(&view, NSWindowOrderingMode::Below, None);
    view.setHidden(true);
    EFFECT.with(|e| *e.borrow_mut() = Some(view));
}

/// Which system material reads as "glass" for each appearance.
///
/// Picked by eye against a busy backdrop (see `docs/RADIAL.md`): in light mode the HUD
/// material is bright and transparent enough for the wallpaper's colour to bleed
/// through; in dark mode it turns into a flat grey, while the menu material stays
/// smoky and clear.
fn material_for(appearance: Appearance) -> NSVisualEffectMaterial {
    match appearance {
        Appearance::Dark => NSVisualEffectMaterial::Menu,
        Appearance::Light | Appearance::Auto => NSVisualEffectMaterial::HUDWindow,
    }
}

/// `Auto` follows the system: resolve it to a concrete light/dark choice, because the
/// right material differs between the two.
fn resolve_auto(appearance: Appearance) -> Appearance {
    if appearance != Appearance::Auto {
        return appearance;
    }
    let Some(mtm) = MainThreadMarker::new() else { return Appearance::Light };
    let names = NSArray::from_slice(&[unsafe { NSAppearanceNameAqua }, unsafe { NSAppearanceNameDarkAqua }]);
    let best = NSApplication::sharedApplication(mtm).effectiveAppearance().bestMatchFromAppearancesWithNames(&names);
    match best {
        Some(name) if name.isEqualToString(unsafe { NSAppearanceNameDarkAqua }) => Appearance::Dark,
        _ => Appearance::Light,
    }
}

fn encode_mask_png(width: u32, height: u32, alpha: &[u8]) -> Option<Vec<u8>> {
    let mut rgba = Vec::with_capacity(alpha.len() * 4);
    for a in alpha {
        rgba.extend_from_slice(&[255, 255, 255, *a]);
    }
    let mut out = Vec::new();
    // Speed over size: this is decoded once, straight away, never stored.
    PngEncoder::new_with_quality(&mut out, CompressionType::Fast, FilterType::NoFilter)
        .write_image(&rgba, width, height, ExtendedColorType::Rgba8)
        .ok()?;
    Some(out)
}

/// Shape the blur like `shape` for a `w`×`h` point window and pick the appearance.
/// Cheap to call repeatedly: an unchanged request is a no-op.
pub fn apply(shape: &Shape, w: f64, h: f64, appearance: Appearance, backing_scale: f64) {
    EFFECT.with(|slot| {
        let slot = slot.borrow();
        let Some(view) = slot.as_ref() else { return };

        if matches!(shape, Shape::None) {
            view.setHidden(true);
            LAST_KEY.with(|k| k.borrow_mut().clear());
            return;
        }

        let appearance = resolve_auto(appearance);
        let scale = backing_scale.max(2.0);
        let key = format!("{shape:?}|{w}x{h}|{scale}|{appearance:?}");
        let unchanged = LAST_KEY.with(|k| *k.borrow() == key);
        if unchanged && !view.isHidden() {
            return;
        }

        // The appearance decides light vs dark frost; `Auto` follows the system.
        let named = match appearance {
            Appearance::Auto => None,
            Appearance::Light => unsafe { NSAppearance::appearanceNamed(NSAppearanceNameAqua) },
            Appearance::Dark => unsafe { NSAppearance::appearanceNamed(NSAppearanceNameDarkAqua) },
        };
        view.setAppearance(named.as_deref());
        view.setMaterial(material_for(appearance));

        let mask_key = format!("{shape:?}|{w}x{h}|{scale}");
        let cached = MASKS.with(|m| m.borrow().get(&mask_key).cloned());
        let image = cached.or_else(|| {
            let (pw, ph, alpha) = mask_alpha(shape, w, h, scale);
            let png = encode_mask_png(pw, ph, &alpha)?;
            let image = NSImage::initWithData(NSImage::alloc(), &NSData::with_bytes(&png))?;
            // Pixels are 2× (or more); the point size makes AppKit draw it sharp.
            image.setSize(NSSize::new(w, h));
            MASKS.with(|m| {
                let mut m = m.borrow_mut();
                if m.len() >= MASK_CACHE_LIMIT {
                    m.clear();
                }
                m.insert(mask_key, image.clone());
            });
            Some(image)
        });
        if let Some(image) = image {
            view.setMaskImage(Some(&image));
        }
        view.setHidden(false);
        LAST_KEY.with(|k| *k.borrow_mut() = key);
    });
}

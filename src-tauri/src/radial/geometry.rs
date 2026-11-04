//! Pure geometry for the radial overlay: where the window goes, and the alpha mask
//! that shapes the native blur behind it. No AppKit here, so it is unit-testable.
//!
//! Coordinates follow AppKit: origin bottom-left, y grows upwards, units are points.

use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    pub fn new(x: f64, y: f64, w: f64, h: f64) -> Self {
        Self { x, y, w, h }
    }
    pub fn max_x(&self) -> f64 {
        self.x + self.w
    }
    pub fn max_y(&self) -> f64 {
        self.y + self.h
    }
    pub fn mid_x(&self) -> f64 {
        self.x + self.w / 2.0
    }
    pub fn mid_y(&self) -> f64 {
        self.y + self.h / 2.0
    }
    pub fn contains(&self, px: f64, py: f64) -> bool {
        px >= self.x && px < self.max_x() && py >= self.y && py < self.max_y()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Anchor {
    Cursor,
    Keep,
    Top,
    Center,
}

/// The shape the native glass takes. Mirrors the TypeScript descriptor one to one.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Shape {
    /// A petal ring plus a separate centre disc, centred in the window.
    Ring { outer: f64, inner: f64, core: f64 },
    /// A rounded rectangle, optionally inset from every window edge so the web layer
    /// has a transparent margin to draw its own shadow in.
    Rrect {
        radius: f64,
        #[serde(default)]
        inset: f64,
    },
    /// No native glass at all.
    None,
}

/// Gap below the top of the visible frame for the `top` anchor (pill / HUD).
pub const TOP_MARGIN: f64 = 28.0;

/// Where a `w`×`h` window goes for `anchor`, kept fully inside `visible`.
///
/// * `cursor` — the pointer, used by `Anchor::Cursor`.
/// * `current_center` — the window's present centre, used by `Anchor::Keep`.
pub fn place(anchor: Anchor, w: f64, h: f64, cursor: (f64, f64), current_center: (f64, f64), visible: Rect) -> Rect {
    let (cx, cy) = match anchor {
        Anchor::Cursor => cursor,
        Anchor::Keep => current_center,
        Anchor::Center => (visible.mid_x(), visible.mid_y()),
        Anchor::Top => (visible.mid_x(), visible.max_y() - TOP_MARGIN - h / 2.0),
    };
    let x = clamp_axis(cx - w / 2.0, w, visible.x, visible.max_x());
    let y = clamp_axis(cy - h / 2.0, h, visible.y, visible.max_y());
    Rect::new(x, y, w, h)
}

/// Keep `[start, start+len]` inside `[lo, hi]`; if it cannot fit, pin it to `lo`.
fn clamp_axis(start: f64, len: f64, lo: f64, hi: f64) -> f64 {
    if len >= hi - lo {
        return lo;
    }
    start.max(lo).min(hi - len)
}

/// Signed distance (in the same unit as the inputs, negative inside) from `(px, py)`
/// to `shape`, for a `w`×`h` window.
pub fn signed_distance(shape: &Shape, w: f64, h: f64, px: f64, py: f64) -> f64 {
    match *shape {
        Shape::Ring { outer, inner, core } => {
            let d = ((px - w / 2.0).powi(2) + (py - h / 2.0).powi(2)).sqrt();
            let annulus = (inner - d).max(d - outer);
            let disc = d - core;
            annulus.min(disc)
        }
        Shape::Rrect { radius, inset } => {
            let half_w = (w / 2.0 - inset).max(0.0);
            let half_h = (h / 2.0 - inset).max(0.0);
            let r = radius.min(half_w).min(half_h).max(0.0);
            let qx = (px - w / 2.0).abs() - (half_w - r);
            let qy = (py - h / 2.0).abs() - (half_h - r);
            let outside = (qx.max(0.0).powi(2) + qy.max(0.0).powi(2)).sqrt();
            outside + qx.max(qy).min(0.0) - r
        }
        Shape::None => f64::INFINITY,
    }
}

/// Anti-aliased coverage mask, one byte per pixel, row-major, top row first.
///
/// `scale` is pixels per point (2.0 on a Retina display). Shape distances are
/// evaluated at pixel centres in points and converted to pixels, so the edge is a
/// one-pixel linear ramp whatever the scale.
pub fn mask_alpha(shape: &Shape, w: f64, h: f64, scale: f64) -> (u32, u32, Vec<u8>) {
    let pw = (w * scale).round().max(1.0) as u32;
    let ph = (h * scale).round().max(1.0) as u32;
    let mut out = Vec::with_capacity((pw * ph) as usize);
    for iy in 0..ph {
        for ix in 0..pw {
            let px = (f64::from(ix) + 0.5) / scale;
            let py = (f64::from(iy) + 0.5) / scale;
            let d_px = signed_distance(shape, w, h, px, py) * scale;
            let a = (0.5 - d_px).clamp(0.0, 1.0);
            out.push((a * 255.0).round() as u8);
        }
    }
    (pw, ph, out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const VF: Rect = Rect { x: 0.0, y: 0.0, w: 1440.0, h: 860.0 };

    #[test]
    fn cursor_anchor_centres_on_pointer() {
        let r = place(Anchor::Cursor, 560.0, 560.0, (700.0, 400.0), (0.0, 0.0), VF);
        assert_eq!((r.x, r.y), (420.0, 120.0));
    }

    #[test]
    fn cursor_anchor_is_clamped_to_every_edge() {
        let r = place(Anchor::Cursor, 560.0, 560.0, (10.0, 10.0), (0.0, 0.0), VF);
        assert_eq!((r.x, r.y), (0.0, 0.0));
        let r = place(Anchor::Cursor, 560.0, 560.0, (1435.0, 855.0), (0.0, 0.0), VF);
        assert_eq!((r.max_x(), r.max_y()), (1440.0, 860.0));
    }

    #[test]
    fn clamping_respects_a_visible_frame_that_is_not_at_the_origin() {
        // A second monitor to the right of and above the primary one.
        let vf = Rect::new(1440.0, 200.0, 1920.0, 1055.0);
        let r = place(Anchor::Cursor, 560.0, 560.0, (1450.0, 210.0), (0.0, 0.0), vf);
        assert_eq!((r.x, r.y), (1440.0, 200.0));
    }

    #[test]
    fn top_anchor_sits_below_the_menu_bar_and_centred() {
        let r = place(Anchor::Top, 420.0, 120.0, (0.0, 0.0), (0.0, 0.0), VF);
        assert_eq!(r.mid_x(), 720.0);
        assert_eq!(r.max_y(), 860.0 - TOP_MARGIN);
    }

    #[test]
    fn keep_anchor_preserves_the_centre_when_resizing() {
        let r = place(Anchor::Keep, 300.0, 200.0, (0.0, 0.0), (700.0, 400.0), VF);
        assert_eq!((r.mid_x(), r.mid_y()), (700.0, 400.0));
    }

    #[test]
    fn a_window_larger_than_the_screen_is_pinned_to_its_origin() {
        let tiny = Rect::new(0.0, 0.0, 400.0, 300.0);
        let r = place(Anchor::Center, 560.0, 560.0, (0.0, 0.0), (0.0, 0.0), tiny);
        assert_eq!((r.x, r.y), (0.0, 0.0));
    }

    #[test]
    fn ring_mask_has_a_transparent_gap_between_core_and_petals() {
        let shape = Shape::Ring { outer: 250.0, inner: 112.0, core: 92.0 };
        let (pw, ph, a) = mask_alpha(&shape, 560.0, 560.0, 1.0);
        assert_eq!((pw, ph), (560, 560));
        let at = |x: f64, y: f64| a[(y as usize) * 560 + x as usize];
        // Centre of the core disc: opaque.
        assert_eq!(at(280.0, 280.0), 255);
        // In the gap (r = 102): transparent.
        assert_eq!(at(280.0 + 102.0, 280.0), 0);
        // Inside the petal ring (r = 180): opaque.
        assert_eq!(at(280.0 + 180.0, 280.0), 255);
        // Outside the ring (r = 270) and in the corner: transparent.
        assert_eq!(at(280.0 + 270.0, 280.0), 0);
        assert_eq!(at(2.0, 2.0), 0);
    }

    #[test]
    fn ring_edges_are_anti_aliased() {
        let shape = Shape::Ring { outer: 250.0, inner: 112.0, core: 92.0 };
        let (_, _, a) = mask_alpha(&shape, 560.0, 560.0, 2.0);
        let partial = a.iter().filter(|v| **v > 0 && **v < 255).count();
        assert!(partial > 1000, "expected a soft edge, got {partial} partial pixels");
    }

    #[test]
    fn rrect_inset_leaves_a_transparent_margin() {
        let shape = Shape::Rrect { radius: 28.0, inset: 18.0 };
        let (pw, _ph, a) = mask_alpha(&shape, 420.0, 120.0, 1.0);
        let at = |x: usize, y: usize| a[y * pw as usize + x];
        assert_eq!(at(5, 60), 0, "inside the margin");
        assert_eq!(at(210, 60), 255, "inside the card");
        assert_eq!(at(210, 10), 0, "above the card");
        // The corner of the card is rounded: the very corner pixel is outside.
        assert_eq!(at(19, 19), 0);
    }

    #[test]
    fn rrect_radius_is_clamped_to_the_card() {
        // A radius bigger than half the height degrades to a capsule, never to NaN.
        let shape = Shape::Rrect { radius: 500.0, inset: 0.0 };
        let (_, _, a) = mask_alpha(&shape, 200.0, 60.0, 1.0);
        assert_eq!(a[30 * 200 + 100], 255);
    }

    #[test]
    fn none_shape_is_never_covered() {
        let (_, _, a) = mask_alpha(&Shape::None, 10.0, 10.0, 1.0);
        assert!(a.iter().all(|v| *v == 0));
    }

    #[test]
    fn shape_json_matches_the_frontend_descriptor() {
        let ring: Shape = serde_json::from_str(r#"{"kind":"ring","outer":250,"inner":112,"core":92}"#).unwrap();
        assert_eq!(ring, Shape::Ring { outer: 250.0, inner: 112.0, core: 92.0 });
        let card: Shape = serde_json::from_str(r#"{"kind":"rrect","radius":28}"#).unwrap();
        assert_eq!(card, Shape::Rrect { radius: 28.0, inset: 0.0 });
        let inset: Shape = serde_json::from_str(r#"{"kind":"rrect","radius":28,"inset":18}"#).unwrap();
        assert_eq!(inset, Shape::Rrect { radius: 28.0, inset: 18.0 });
        let none: Shape = serde_json::from_str(r#"{"kind":"none"}"#).unwrap();
        assert_eq!(none, Shape::None);
    }
}

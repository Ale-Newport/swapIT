use crate::binaries;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::jobs::{self, JobCtx};
use crate::paths::{self, Disposition, OutputSpec};
use crate::settings;
use crate::types::{now_ms, BatchResult, FileResult};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Formats the pure-Rust engine can decode without any external binary.
const NATIVE_DECODE: &[&str] = &[
    "png", "jpg", "jpeg", "jfif", "gif", "bmp", "ico", "tif", "tiff", "webp", "tga", "qoi", "pnm", "pbm", "pgm", "ppm", "dds", "hdr", "exr", "ff", "avif",
];
/// Formats the pure-Rust engine can encode.
const NATIVE_ENCODE: &[&str] = &["png", "jpg", "jpeg", "gif", "bmp", "ico", "tif", "tiff", "tga", "qoi", "ppm", "exr"];

pub fn is_native_decodable(ext: &str) -> bool {
    NATIVE_DECODE.contains(&ext.to_lowercase().as_str())
}

fn format_for_ext(ext: &str) -> Option<ImageFormat> {
    match ext.to_lowercase().as_str() {
        "png" => Some(ImageFormat::Png),
        "jpg" | "jpeg" | "jfif" => Some(ImageFormat::Jpeg),
        "gif" => Some(ImageFormat::Gif),
        "bmp" => Some(ImageFormat::Bmp),
        "ico" => Some(ImageFormat::Ico),
        "tif" | "tiff" => Some(ImageFormat::Tiff),
        "webp" => Some(ImageFormat::WebP),
        "tga" => Some(ImageFormat::Tga),
        "qoi" => Some(ImageFormat::Qoi),
        "ppm" | "pnm" | "pgm" | "pbm" => Some(ImageFormat::Pnm),
        "exr" => Some(ImageFormat::OpenExr),
        "hdr" => Some(ImageFormat::Hdr),
        "avif" => Some(ImageFormat::Avif),
        "dds" => Some(ImageFormat::Dds),
        _ => None,
    }
}

// ------------------------------------------------------------------ operations

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResizeOpt {
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// "fit" (default, keeps aspect, never upscales past the box), "fill" (crop to box),
    /// "exact" (ignores aspect), "percent".
    #[serde(default)]
    pub mode: Option<String>,
    pub percent: Option<f32>,
    #[serde(default)]
    pub allow_upscale: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropOpt {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaddingOpt {
    pub top: u32,
    pub right: u32,
    pub bottom: u32,
    pub left: u32,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BorderOpt {
    pub width: u32,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowOpt {
    #[serde(default = "d_blur")]
    pub blur: u32,
    #[serde(default)]
    pub offset_x: i32,
    #[serde(default = "d_off")]
    pub offset_y: i32,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default = "d_spread")]
    pub spread: u32,
}
fn d_blur() -> u32 { 24 }
fn d_off() -> i32 { 12 }
fn d_spread() -> u32 { 48 }

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageWatermarkOpt {
    /// Path to a PNG/JPEG used as the watermark.
    pub logo: Option<String>,
    pub text: Option<String>,
    #[serde(default = "d_pos")]
    pub position: String,
    #[serde(default = "d_opacity")]
    pub opacity: f32,
    #[serde(default = "d_scale")]
    pub scale: f32,
    #[serde(default = "d_margin")]
    pub margin: u32,
    #[serde(default)]
    pub color: Option<String>,
}
fn d_pos() -> String { "bottom-right".into() }
fn d_opacity() -> f32 { 0.5 }
fn d_scale() -> f32 { 0.2 }
fn d_margin() -> u32 { 24 }

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageOps {
    pub format: Option<String>,
    pub quality: Option<u8>,
    pub resize: Option<ResizeOpt>,
    pub crop: Option<CropOpt>,
    /// 90, 180 or 270 degrees clockwise.
    pub rotate: Option<i32>,
    #[serde(default)]
    pub flip_horizontal: bool,
    #[serde(default)]
    pub flip_vertical: bool,
    #[serde(default)]
    pub grayscale: bool,
    #[serde(default)]
    pub strip_metadata: bool,
    /// Flatten transparency onto this colour ("#ffffff").
    pub background: Option<String>,
    pub padding: Option<PaddingOpt>,
    pub border: Option<BorderOpt>,
    pub rounded: Option<u32>,
    pub shadow: Option<ShadowOpt>,
    pub watermark: Option<ImageWatermarkOpt>,
    /// Target an approximate maximum output size by searching quality downwards.
    pub max_bytes: Option<u64>,
    /// Multi-size output for ICO/favicon generation.
    pub ico_sizes: Option<Vec<u32>>,
}

pub fn parse_color(raw: &str) -> AppResult<Rgba<u8>> {
    let s = raw.trim().trim_start_matches('#');
    let parse = |i: usize, len: usize| -> AppResult<u8> {
        let slice = &s[i..i + len];
        let v = u8::from_str_radix(&if len == 1 { slice.repeat(2) } else { slice.to_string() }, 16)
            .map_err(|_| AppError::invalid(format!("“{raw}” is not a valid colour.")))?;
        Ok(v)
    };
    match s.len() {
        3 => Ok(Rgba([parse(0, 1)?, parse(1, 1)?, parse(2, 1)?, 255])),
        4 => Ok(Rgba([parse(0, 1)?, parse(1, 1)?, parse(2, 1)?, parse(3, 1)?])),
        6 => Ok(Rgba([parse(0, 2)?, parse(2, 2)?, parse(4, 2)?, 255])),
        8 => Ok(Rgba([parse(0, 2)?, parse(2, 2)?, parse(4, 2)?, parse(6, 2)?])),
        _ => Err(AppError::invalid(format!("“{raw}” is not a valid colour. Use #RGB, #RRGGBB or #RRGGBBAA."))),
    }
}

// ------------------------------------------------------------------ decoding

/// Decode any input the app supports. Native formats go through the Rust `image`
/// crate; HEIC/AVIF/SVG and anything else fall back to `sips` (built into macOS)
/// and then ImageMagick, so the common path needs no external dependency at all.
pub async fn decode(path: &Path) -> AppResult<DynamicImage> {
    let ext = paths::extension(path);
    if is_native_decodable(&ext) {
        match image::open(path) {
            Ok(img) => return Ok(img),
            Err(e) => {
                // Fall through to external decoders — a mislabelled extension is common.
                let _ = e;
            }
        }
    }
    decode_external(path, &ext).await
}

async fn decode_external(path: &Path, ext: &str) -> AppResult<DynamicImage> {
    let tmp_dir = std::env::temp_dir().join(format!("toolbox-decode-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&tmp_dir)?;
    let tmp_png = tmp_dir.join("decoded.png");
    let cleanup = |dir: &Path| {
        std::fs::remove_dir_all(dir).ok();
    };

    // 1. macOS `sips` reads HEIC/HEIF and most Apple formats with zero installs.
    #[cfg(target_os = "macos")]
    if Path::new("/usr/bin/sips").exists() && ext != "svg" {
        let args = [
            "-s".to_string(),
            "format".to_string(),
            "png".to_string(),
            path.to_string_lossy().to_string(),
            "--out".to_string(),
            tmp_png.to_string_lossy().to_string(),
        ];
        if let Ok(out) = jobs::run(None, Path::new("/usr/bin/sips"), &args).await {
            if out.ok() && tmp_png.exists() {
                let img = image::open(&tmp_png);
                cleanup(&tmp_dir);
                if let Ok(img) = img {
                    return Ok(img);
                }
            }
        }
    }

    // 2. ImageMagick handles the long tail (SVG, PSD, exotic TIFFs, …).
    if let Some(magick) = binaries::resolve("magick") {
        std::fs::create_dir_all(&tmp_dir).ok();
        let is_convert_alias = magick.file_name().map(|n| n == "convert").unwrap_or(false);
        let mut args: Vec<String> = Vec::new();
        if !is_convert_alias {
            args.push("convert".to_string());
        }
        if ext == "svg" {
            args.push("-background".into());
            args.push("none".into());
            args.push("-density".into());
            args.push("300".into());
        }
        args.push(format!("{}[0]", path.to_string_lossy()));
        args.push(tmp_png.to_string_lossy().to_string());
        let out = jobs::run(None, &magick, &args).await?;
        if out.ok() && tmp_png.exists() {
            let img = image::open(&tmp_png);
            cleanup(&tmp_dir);
            return Ok(img?);
        }
        cleanup(&tmp_dir);
        return Err(jobs::explain_failure("Reading this image", &out));
    }

    cleanup(&tmp_dir);
    Err(AppError::with_details(
        ErrorKind::MissingDependency,
        format!("Toolbox cannot read “.{ext}” images without ImageMagick."),
        "Install it with `brew install imagemagick`, or set the path in Settings › Advanced.",
    ))
}

// ------------------------------------------------------------------ pipeline

fn apply_resize(img: DynamicImage, r: &ResizeOpt) -> DynamicImage {
    let (w, h) = img.dimensions();
    let mode = r.mode.as_deref().unwrap_or("fit");
    if mode == "percent" {
        let p = r.percent.unwrap_or(100.0).max(1.0) / 100.0;
        let nw = ((w as f32 * p).round() as u32).max(1);
        let nh = ((h as f32 * p).round() as u32).max(1);
        return img.resize_exact(nw, nh, FilterType::Lanczos3);
    }
    let tw = r.width.unwrap_or(0);
    let th = r.height.unwrap_or(0);
    if tw == 0 && th == 0 {
        return img;
    }
    match mode {
        "exact" => img.resize_exact(tw.max(1), th.max(1), FilterType::Lanczos3),
        "fill" => img.resize_to_fill(tw.max(1), th.max(1), FilterType::Lanczos3),
        _ => {
            let bw = if tw == 0 { u32::MAX } else { tw };
            let bh = if th == 0 { u32::MAX } else { th };
            if !r.allow_upscale && w <= bw && h <= bh {
                return img;
            }
            img.resize(bw, bh, FilterType::Lanczos3)
        }
    }
}

fn flatten_onto(img: &DynamicImage, color: Rgba<u8>) -> DynamicImage {
    let (w, h) = img.dimensions();
    let mut canvas = RgbaImage::from_pixel(w, h, color);
    image::imageops::overlay(&mut canvas, &img.to_rgba8(), 0, 0);
    DynamicImage::ImageRgba8(canvas)
}

fn round_corners(img: &DynamicImage, radius: u32) -> DynamicImage {
    let mut rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let r = radius.min(w / 2).min(h / 2) as f32;
    if r <= 0.0 {
        return DynamicImage::ImageRgba8(rgba);
    }
    // Supersampled coverage so the corners stay smooth.
    for y in 0..h {
        for x in 0..w {
            let fx = x as f32 + 0.5;
            let fy = y as f32 + 0.5;
            let cx = if fx < r { r } else if fx > w as f32 - r { w as f32 - r } else { fx };
            let cy = if fy < r { r } else if fy > h as f32 - r { h as f32 - r } else { fy };
            let dx = fx - cx;
            let dy = fy - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist > r {
                let alpha_factor = (1.0 - (dist - r)).clamp(0.0, 1.0);
                let px = rgba.get_pixel_mut(x, y);
                px[3] = (px[3] as f32 * alpha_factor) as u8;
            }
        }
    }
    DynamicImage::ImageRgba8(rgba)
}

fn add_padding(img: &DynamicImage, p: &PaddingOpt, fallback: Rgba<u8>) -> AppResult<DynamicImage> {
    let color = match &p.color {
        Some(c) if !c.trim().is_empty() && c != "transparent" => parse_color(c)?,
        Some(_) => Rgba([0, 0, 0, 0]),
        None => fallback,
    };
    let (w, h) = img.dimensions();
    let nw = w + p.left + p.right;
    let nh = h + p.top + p.bottom;
    let mut canvas = RgbaImage::from_pixel(nw.max(1), nh.max(1), color);
    image::imageops::overlay(&mut canvas, &img.to_rgba8(), p.left as i64, p.top as i64);
    Ok(DynamicImage::ImageRgba8(canvas))
}

fn box_blur_alpha(mask: &mut [f32], w: usize, h: usize, radius: usize) {
    if radius == 0 {
        return;
    }
    let mut tmp = vec![0f32; w * h];
    let window = (radius * 2 + 1) as f32;
    for y in 0..h {
        let mut acc = 0f32;
        for x in 0..(radius.min(w)) {
            acc += mask[y * w + x];
        }
        for x in 0..w {
            let add = x + radius;
            if add < w {
                acc += mask[y * w + add];
            }
            if x > radius {
                acc -= mask[y * w + (x - radius - 1)];
            }
            tmp[y * w + x] = acc / window;
        }
    }
    for x in 0..w {
        let mut acc = 0f32;
        for y in 0..(radius.min(h)) {
            acc += tmp[y * w + x];
        }
        for y in 0..h {
            let add = y + radius;
            if add < h {
                acc += tmp[(add) * w + x];
            }
            if y > radius {
                acc -= tmp[(y - radius - 1) * w + x];
            }
            mask[y * w + x] = acc / window;
        }
    }
}

fn drop_shadow(img: &DynamicImage, s: &ShadowOpt) -> AppResult<DynamicImage> {
    let color = match &s.color {
        Some(c) if !c.trim().is_empty() => parse_color(c)?,
        _ => Rgba([0, 0, 0, 110]),
    };
    let src = img.to_rgba8();
    let (w, h) = src.dimensions();
    let pad = s.spread.max(s.blur) + s.offset_x.unsigned_abs() + s.offset_y.unsigned_abs();
    let nw = w + pad * 2;
    let nh = h + pad * 2;
    let (nwu, nhu) = (nw as usize, nh as usize);

    let mut mask = vec![0f32; nwu * nhu];
    for y in 0..h {
        for x in 0..w {
            let a = src.get_pixel(x, y)[3] as f32 / 255.0;
            let tx = x as i64 + pad as i64 + s.offset_x as i64;
            let ty = y as i64 + pad as i64 + s.offset_y as i64;
            if tx >= 0 && ty >= 0 && (tx as u32) < nw && (ty as u32) < nh {
                mask[ty as usize * nwu + tx as usize] = a;
            }
        }
    }
    box_blur_alpha(&mut mask, nwu, nhu, (s.blur / 2) as usize);
    box_blur_alpha(&mut mask, nwu, nhu, (s.blur / 3) as usize);

    let mut canvas = RgbaImage::from_pixel(nw, nh, Rgba([0, 0, 0, 0]));
    for y in 0..nh {
        for x in 0..nw {
            let a = mask[y as usize * nwu + x as usize].clamp(0.0, 1.0);
            if a > 0.002 {
                canvas.put_pixel(
                    x,
                    y,
                    Rgba([color[0], color[1], color[2], (color[3] as f32 * a) as u8]),
                );
            }
        }
    }
    image::imageops::overlay(&mut canvas, &src, pad as i64, pad as i64);
    Ok(DynamicImage::ImageRgba8(canvas))
}

fn position_for(pos: &str, cw: u32, ch: u32, ow: u32, oh: u32, margin: u32) -> (i64, i64) {
    let m = margin as i64;
    let (cw, ch, ow, oh) = (cw as i64, ch as i64, ow as i64, oh as i64);
    match pos {
        "top-left" => (m, m),
        "top-right" => (cw - ow - m, m),
        "top-center" => ((cw - ow) / 2, m),
        "center" => ((cw - ow) / 2, (ch - oh) / 2),
        "bottom-left" => (m, ch - oh - m),
        "bottom-center" => ((cw - ow) / 2, ch - oh - m),
        _ => (cw - ow - m, ch - oh - m),
    }
}

async fn apply_watermark(img: DynamicImage, wm: &ImageWatermarkOpt) -> AppResult<DynamicImage> {
    let (cw, ch) = img.dimensions();
    let overlay: DynamicImage = if let Some(logo) = wm.logo.as_deref().filter(|l| !l.trim().is_empty()) {
        let logo_path = paths::validate_input_file(logo)?;
        let logo_img = Box::pin(decode(&logo_path)).await?;
        let target_w = ((cw as f32) * wm.scale.clamp(0.02, 1.0)).round().max(1.0) as u32;
        logo_img.resize(target_w, u32::MAX, FilterType::Lanczos3)
    } else if let Some(text) = wm.text.as_deref().filter(|t| !t.trim().is_empty()) {
        render_text_overlay(text, ((cw as f32) * wm.scale.clamp(0.02, 1.0)) as u32, wm.color.as_deref())?
    } else {
        return Err(AppError::invalid("Provide watermark text or choose a logo image."));
    };

    let mut base = img.to_rgba8();
    let (ow, oh) = overlay.dimensions();
    let (x, y) = position_for(&wm.position, cw, ch, ow, oh, wm.margin);
    let mut faded = overlay.to_rgba8();
    let alpha = wm.opacity.clamp(0.0, 1.0);
    for px in faded.pixels_mut() {
        px[3] = (px[3] as f32 * alpha) as u8;
    }
    image::imageops::overlay(&mut base, &faded, x, y);
    Ok(DynamicImage::ImageRgba8(base))
}

/// Minimal built-in 5×7 bitmap font so text watermarks need no font files or
/// external binaries. Deliberately simple: uppercase, digits and common symbols.
fn glyph(c: char) -> [u8; 7] {
    match c.to_ascii_uppercase() {
        'A' => [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
        'B' => [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
        'C' => [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
        'D' => [0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E],
        'E' => [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
        'F' => [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
        'G' => [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F],
        'H' => [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
        'I' => [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
        'J' => [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
        'K' => [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
        'L' => [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
        'M' => [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
        'N' => [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
        'O' => [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
        'P' => [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
        'Q' => [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
        'R' => [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
        'S' => [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E],
        'T' => [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
        'U' => [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
        'V' => [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
        'W' => [0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11],
        'X' => [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
        'Y' => [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
        'Z' => [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
        '0' => [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
        '1' => [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
        '2' => [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F],
        '3' => [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
        '4' => [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
        '5' => [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
        '6' => [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
        '7' => [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
        '8' => [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
        '9' => [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
        '.' => [0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C],
        ',' => [0x00, 0x00, 0x00, 0x00, 0x0C, 0x04, 0x08],
        '-' => [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00],
        '_' => [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F],
        '/' => [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
        '\\' => [0x10, 0x08, 0x08, 0x04, 0x02, 0x02, 0x01],
        ':' => [0x00, 0x0C, 0x0C, 0x00, 0x0C, 0x0C, 0x00],
        '!' => [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
        '?' => [0x0E, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
        '@' => [0x0E, 0x11, 0x17, 0x15, 0x17, 0x10, 0x0E],
        '#' => [0x0A, 0x1F, 0x0A, 0x0A, 0x0A, 0x1F, 0x0A],
        '+' => [0x00, 0x04, 0x04, 0x1F, 0x04, 0x04, 0x00],
        '=' => [0x00, 0x00, 0x1F, 0x00, 0x1F, 0x00, 0x00],
        '(' => [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
        ')' => [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
        '\'' => [0x04, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00],
        '"' => [0x0A, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00],
        '&' => [0x0C, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0D],
        '*' => [0x00, 0x0A, 0x04, 0x1F, 0x04, 0x0A, 0x00],
        '%' => [0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x03],
        ' ' => [0x00; 7],
        _ => [0x00, 0x0E, 0x0E, 0x0E, 0x0E, 0x0E, 0x00],
    }
}

/// Render `text` as an RGBA overlay approximately `target_width` pixels wide.
pub fn render_text_overlay(text: &str, target_width: u32, color: Option<&str>) -> AppResult<DynamicImage> {
    let color = match color {
        Some(c) if !c.trim().is_empty() => parse_color(c)?,
        _ => Rgba([255, 255, 255, 255]),
    };
    let text: String = text.chars().take(200).collect();
    let cols = text.chars().count().max(1) as u32;
    // Each glyph is 5 wide + 1 space = 6 cells.
    let scale = ((target_width.max(24) as f32) / (cols * 6) as f32).round().max(1.0) as u32;
    let w = cols * 6 * scale;
    let h = 7 * scale + scale * 2;
    let mut canvas = RgbaImage::from_pixel(w.max(1), h.max(1), Rgba([0, 0, 0, 0]));
    for (i, ch) in text.chars().enumerate() {
        let g = glyph(ch);
        for (row, bits) in g.iter().enumerate() {
            for col in 0..5u32 {
                if bits & (1 << (4 - col)) != 0 {
                    let x0 = (i as u32 * 6 + col) * scale;
                    let y0 = row as u32 * scale + scale;
                    for dy in 0..scale {
                        for dx in 0..scale {
                            let (x, y) = (x0 + dx, y0 + dy);
                            if x < w && y < h {
                                canvas.put_pixel(x, y, color);
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(DynamicImage::ImageRgba8(canvas))
}

/// Run the whole op pipeline over one decoded image.
pub async fn apply_ops(mut img: DynamicImage, ops: &ImageOps) -> AppResult<DynamicImage> {
    if let Some(c) = &ops.crop {
        let (w, h) = img.dimensions();
        if c.x >= w || c.y >= h {
            return Err(AppError::invalid("The crop area starts outside the image."));
        }
        let cw = c.width.min(w - c.x).max(1);
        let chh = c.height.min(h - c.y).max(1);
        img = img.crop_imm(c.x, c.y, cw, chh);
    }
    if let Some(r) = &ops.resize {
        img = apply_resize(img, r);
    }
    match ops.rotate.unwrap_or(0).rem_euclid(360) {
        90 => img = img.rotate90(),
        180 => img = img.rotate180(),
        270 => img = img.rotate270(),
        _ => {}
    }
    if ops.flip_horizontal {
        img = img.fliph();
    }
    if ops.flip_vertical {
        img = img.flipv();
    }
    if ops.grayscale {
        img = DynamicImage::ImageLuma8(img.to_luma8());
    }
    if let Some(bg) = ops.background.as_deref().filter(|b| !b.trim().is_empty() && *b != "transparent") {
        img = flatten_onto(&img, parse_color(bg)?);
    }
    if let Some(radius) = ops.rounded.filter(|r| *r > 0) {
        img = round_corners(&img, radius);
    }
    if let Some(b) = &ops.border {
        if b.width > 0 {
            let pad = PaddingOpt {
                top: b.width,
                right: b.width,
                bottom: b.width,
                left: b.width,
                color: b.color.clone(),
            };
            img = add_padding(&img, &pad, Rgba([0, 0, 0, 255]))?;
        }
    }
    if let Some(p) = &ops.padding {
        img = add_padding(&img, p, Rgba([0, 0, 0, 0]))?;
    }
    if let Some(s) = &ops.shadow {
        img = drop_shadow(&img, s)?;
    }
    if let Some(wm) = &ops.watermark {
        img = apply_watermark(img, wm).await?;
    }
    Ok(img)
}

// ------------------------------------------------------------------ encoding

fn encode_native(img: &DynamicImage, ext: &str, quality: u8) -> AppResult<Vec<u8>> {
    let mut buf: Vec<u8> = Vec::new();
    match ext {
        "jpg" | "jpeg" => {
            // JPEG has no alpha; flatten onto white so transparency does not go black.
            let rgb = flatten_onto(img, Rgba([255, 255, 255, 255])).to_rgb8();
            let mut cursor = Cursor::new(&mut buf);
            let mut enc = JpegEncoder::new_with_quality(&mut cursor, quality.clamp(1, 100));
            enc.encode_image(&DynamicImage::ImageRgb8(rgb))?;
        }
        "ico" => {
            // ICO tops out at 256×256 per frame.
            let resized = if img.width() > 256 || img.height() > 256 {
                img.resize(256, 256, FilterType::Lanczos3)
            } else {
                img.clone()
            };
            let mut cursor = Cursor::new(&mut buf);
            resized.write_to(&mut cursor, ImageFormat::Ico)?;
        }
        other => {
            let fmt = format_for_ext(other)
                .ok_or_else(|| AppError::unsupported(format!("Toolbox cannot write “.{other}” images.")))?;
            let mut cursor = Cursor::new(&mut buf);
            // GIF/PNG-style formats want RGBA; EXR/HDR want float, handled by the crate.
            img.write_to(&mut cursor, fmt)?;
        }
    }
    Ok(buf)
}

/// Encode through ImageMagick for formats the Rust engine cannot write
/// (lossy WebP, AVIF, HEIC).
async fn encode_external(img: &DynamicImage, ext: &str, quality: u8) -> AppResult<Vec<u8>> {
    let magick = binaries::resolve("magick").ok_or_else(|| {
        AppError::with_details(
            ErrorKind::MissingDependency,
            format!("Writing “.{ext}” images needs ImageMagick."),
            "Install it with `brew install imagemagick`, or pick PNG/JPEG instead.",
        )
    })?;
    let dir = std::env::temp_dir().join(format!("toolbox-enc-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dir)?;
    let src = dir.join("in.png");
    let dst = dir.join(format!("out.{ext}"));
    img.save(&src)?;
    let is_convert_alias = magick.file_name().map(|n| n == "convert").unwrap_or(false);
    let mut args: Vec<String> = Vec::new();
    if !is_convert_alias {
        args.push("convert".into());
    }
    args.push(src.to_string_lossy().to_string());
    args.push("-quality".into());
    args.push(quality.clamp(1, 100).to_string());
    args.push(dst.to_string_lossy().to_string());
    let out = jobs::run(None, &magick, &args).await?;
    if !out.ok() || !dst.exists() {
        std::fs::remove_dir_all(&dir).ok();
        return Err(jobs::explain_failure(&format!("Writing {} image", ext.to_uppercase()), &out));
    }
    let bytes = std::fs::read(&dst)?;
    std::fs::remove_dir_all(&dir).ok();
    Ok(bytes)
}

pub async fn encode(img: &DynamicImage, ext: &str, quality: u8) -> AppResult<Vec<u8>> {
    let ext = ext.trim_start_matches('.').to_lowercase();
    if NATIVE_ENCODE.contains(&ext.as_str()) {
        return encode_native(img, &ext, quality);
    }
    if ext == "webp" {
        // The Rust encoder is lossless only. Prefer ImageMagick when quality matters.
        if binaries::resolve("magick").is_some() {
            return encode_external(img, &ext, quality).await;
        }
        let mut buf: Vec<u8> = Vec::new();
        img.write_to(&mut Cursor::new(&mut buf), ImageFormat::WebP)?;
        return Ok(buf);
    }
    encode_external(img, &ext, quality).await
}

/// Encode repeatedly, lowering quality until the result fits `max_bytes`.
async fn encode_within_budget(img: &DynamicImage, ext: &str, start_quality: u8, max_bytes: u64) -> AppResult<(Vec<u8>, u8)> {
    let mut lo = 20u8;
    let mut hi = start_quality.clamp(20, 100);
    let mut best = encode(img, ext, hi).await?;
    let mut best_q = hi;
    if (best.len() as u64) <= max_bytes {
        return Ok((best, best_q));
    }
    // Binary search on quality — 6 probes is plenty.
    for _ in 0..6 {
        if hi <= lo + 1 {
            break;
        }
        let mid = lo + (hi - lo) / 2;
        let candidate = encode(img, ext, mid).await?;
        if (candidate.len() as u64) <= max_bytes {
            best = candidate;
            best_q = mid;
            lo = mid;
        } else {
            hi = mid;
        }
        if best_q == mid {
            lo = mid;
        }
    }
    Ok((best, best_q))
}

// ------------------------------------------------------------------ commands

fn default_quality(ext: &str) -> u8 {
    let cfg = settings::load();
    match ext {
        "webp" => cfg.webp_quality,
        _ => cfg.jpeg_quality,
    }
}

#[tauri::command]
pub async fn process_images(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    ops: ImageOps,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    let files = paths::validate_inputs(&inputs)?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();

    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.05, f);
        let result = process_one(&ctx, i, f, &ops, &output).await;
        match result {
            Ok(Some(r)) => batch.results.push(r),
            Ok(None) => {}
            Err(e) if e.kind() == ErrorKind::Cancelled => {
                batch.cancelled = true;
                break;
            }
            Err(e) => batch.push_failure(f, e),
        }
        ctx.emit_item(i + 1, 0.0, f);
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

async fn process_one(
    ctx: &JobCtx,
    index: usize,
    file: &Path,
    ops: &ImageOps,
    output: &OutputSpec,
) -> AppResult<Option<FileResult>> {
    let target_ext = ops
        .format
        .as_deref()
        .filter(|f| !f.trim().is_empty())
        .map(|f| f.trim_start_matches('.').to_lowercase())
        .unwrap_or_else(|| {
            let e = paths::extension(file);
            if e.is_empty() { "png".to_string() } else { e }
        });

    let dest = paths::resolve_destination(file, output, &target_ext)?;
    if dest.disposition == Disposition::Skipped {
        return Ok(Some(FileResult::from_source(&dest.path, file, Disposition::Skipped).with_note("Already exists — skipped")));
    }

    ctx.emit_item(index, 0.15, file);
    let img = decode(file).await?;
    ctx.bail_if_cancelled()?;
    ctx.emit_item(index, 0.45, file);

    // ICO multi-size output is a special case: several frames in one container.
    if target_ext == "ico" {
        if let Some(sizes) = ops.ico_sizes.as_ref().filter(|s| !s.is_empty()) {
            let bytes = encode_ico_multi(&img, sizes)?;
            std::fs::write(&dest.path, bytes)?;
            return Ok(Some(FileResult::from_source(&dest.path, file, dest.disposition)));
        }
    }

    let processed = apply_ops(img, ops).await?;
    ctx.bail_if_cancelled()?;
    ctx.emit_item(index, 0.75, file);

    let quality = ops.quality.unwrap_or_else(|| default_quality(&target_ext));
    let (bytes, used_quality) = match ops.max_bytes {
        Some(limit) if limit > 0 => encode_within_budget(&processed, &target_ext, quality, limit).await?,
        _ => (encode(&processed, &target_ext, quality).await?, quality),
    };

    std::fs::write(&dest.path, &bytes)?;
    let mut result = FileResult::from_source(&dest.path, file, dest.disposition);
    if ops.max_bytes.is_some() {
        result.note = Some(format!("quality {used_quality}"));
    }
    Ok(Some(result))
}

/// Build a multi-resolution .ico. Written by hand because the `image` crate only
/// emits single-frame ICOs.
fn encode_ico_multi(img: &DynamicImage, sizes: &[u32]) -> AppResult<Vec<u8>> {
    let mut frames: Vec<(u32, Vec<u8>)> = Vec::new();
    let mut sizes: Vec<u32> = sizes.iter().copied().filter(|s| *s > 0 && *s <= 256).collect();
    sizes.sort_unstable();
    sizes.dedup();
    if sizes.is_empty() {
        sizes = vec![16, 32, 48, 256];
    }
    for size in &sizes {
        let resized = img.resize_exact(*size, *size, FilterType::Lanczos3);
        let mut png: Vec<u8> = Vec::new();
        resized.write_to(&mut Cursor::new(&mut png), ImageFormat::Png)?;
        frames.push((*size, png));
    }
    let count = frames.len() as u16;
    let mut out: Vec<u8> = Vec::new();
    out.extend_from_slice(&0u16.to_le_bytes()); // reserved
    out.extend_from_slice(&1u16.to_le_bytes()); // type: icon
    out.extend_from_slice(&count.to_le_bytes());
    let mut offset = 6 + 16 * frames.len() as u32;
    for (size, data) in &frames {
        let dim = if *size >= 256 { 0u8 } else { *size as u8 };
        out.push(dim);
        out.push(dim);
        out.push(0); // palette
        out.push(0); // reserved
        out.extend_from_slice(&1u16.to_le_bytes()); // colour planes
        out.extend_from_slice(&32u16.to_le_bytes()); // bpp
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(&offset.to_le_bytes());
        offset += data.len() as u32;
    }
    for (_, data) in &frames {
        out.extend_from_slice(data);
    }
    Ok(out)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub path: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub megapixels: f64,
    pub aspect_ratio: String,
    pub color_type: String,
    pub format: String,
    pub size: u64,
    pub has_alpha: bool,
}

fn gcd(a: u32, b: u32) -> u32 {
    if b == 0 { a } else { gcd(b, a % b) }
}

#[tauri::command]
pub async fn image_info(inputs: Vec<String>) -> AppResult<Vec<ImageInfo>> {
    let files = paths::validate_inputs(&inputs)?;
    let mut out = Vec::new();
    for f in files {
        let img = decode(&f).await?;
        let (w, h) = img.dimensions();
        let g = gcd(w.max(1), h.max(1)).max(1);
        let color = format!("{:?}", img.color());
        out.push(ImageInfo {
            path: f.to_string_lossy().to_string(),
            name: paths::display_name(&f),
            width: w,
            height: h,
            megapixels: (w as f64 * h as f64) / 1_000_000.0,
            aspect_ratio: format!("{}:{}", w / g, h / g),
            has_alpha: img.color().has_alpha(),
            color_type: color,
            format: paths::extension(&f).to_uppercase(),
            size: std::fs::metadata(&f).map(|m| m.len()).unwrap_or(0),
        });
    }
    Ok(out)
}

// ------------------------------------------------------------------ palettes

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaletteColor {
    pub hex: String,
    pub rgb: [u8; 3],
    pub population: usize,
    pub percentage: f64,
}

/// Median-cut quantisation — deterministic, fast, and good enough for a palette strip.
fn median_cut(mut pixels: Vec<[u8; 3]>, target: usize) -> Vec<(Vec<[u8; 3]>, usize)> {
    if pixels.is_empty() {
        return vec![];
    }
    let mut buckets: Vec<Vec<[u8; 3]>> = vec![std::mem::take(&mut pixels)];
    while buckets.len() < target {
        // Split the bucket with the widest channel range.
        let mut best_idx = 0usize;
        let mut best_range = 0u8;
        let mut best_channel = 0usize;
        for (i, b) in buckets.iter().enumerate() {
            if b.len() < 2 {
                continue;
            }
            for c in 0..3 {
                let (mut lo, mut hi) = (255u8, 0u8);
                for p in b.iter() {
                    lo = lo.min(p[c]);
                    hi = hi.max(p[c]);
                }
                let range = hi - lo;
                if range > best_range {
                    best_range = range;
                    best_idx = i;
                    best_channel = c;
                }
            }
        }
        if best_range == 0 {
            break;
        }
        let mut bucket = buckets.swap_remove(best_idx);
        bucket.sort_unstable_by_key(|p| p[best_channel]);
        let mid = bucket.len() / 2;
        let right = bucket.split_off(mid);
        buckets.push(bucket);
        buckets.push(right);
    }
    buckets.into_iter().map(|b| { let n = b.len(); (b, n) }).collect()
}

#[tauri::command]
pub async fn extract_palette(input: String, count: Option<usize>) -> AppResult<Vec<PaletteColor>> {
    let file = paths::validate_input_file(&input)?;
    let img = decode(&file).await?;
    // Downsample first — a 50 MP photo does not need every pixel to find 8 colours.
    let small = img.resize(200, 200, FilterType::Triangle).to_rgba8();
    let pixels: Vec<[u8; 3]> = small
        .pixels()
        .filter(|p| p[3] > 16)
        .map(|p| [p[0], p[1], p[2]])
        .collect();
    if pixels.is_empty() {
        return Err(AppError::invalid("This image is fully transparent — there are no colours to extract."));
    }
    let total = pixels.len();
    let target = count.unwrap_or(8).clamp(1, 64);
    let buckets = median_cut(pixels, target);
    let mut out: Vec<PaletteColor> = buckets
        .into_iter()
        .filter(|(b, _)| !b.is_empty())
        .map(|(bucket, population)| {
            let n = bucket.len() as u64;
            let sum = bucket.iter().fold([0u64; 3], |mut acc, p| {
                acc[0] += p[0] as u64;
                acc[1] += p[1] as u64;
                acc[2] += p[2] as u64;
                acc
            });
            let rgb = [(sum[0] / n) as u8, (sum[1] / n) as u8, (sum[2] / n) as u8];
            PaletteColor {
                hex: format!("#{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2]),
                rgb,
                population,
                percentage: (population as f64 / total as f64) * 100.0,
            }
        })
        .collect();
    out.sort_by_key(|c| std::cmp::Reverse(c.population));
    Ok(out)
}

/// Pick the colour at a pixel — used by the eyedropper tool.
#[tauri::command]
pub async fn pick_color_at(input: String, x: u32, y: u32) -> AppResult<PaletteColor> {
    let file = paths::validate_input_file(&input)?;
    let img = decode(&file).await?;
    let (w, h) = img.dimensions();
    if x >= w || y >= h {
        return Err(AppError::invalid("That point is outside the image."));
    }
    let p = img.get_pixel(x, y);
    Ok(PaletteColor {
        hex: format!("#{:02X}{:02X}{:02X}", p[0], p[1], p[2]),
        rgb: [p[0], p[1], p[2]],
        population: 1,
        percentage: 100.0,
    })
}

// ------------------------------------------------------------------ contact sheet

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactSheetOpts {
    #[serde(default = "d_cols")]
    pub columns: u32,
    #[serde(default = "d_thumb")]
    pub thumb_size: u32,
    #[serde(default = "d_gap")]
    pub gap: u32,
    #[serde(default)]
    pub background: Option<String>,
    #[serde(default)]
    pub labels: bool,
}
fn d_cols() -> u32 { 4 }
fn d_thumb() -> u32 { 320 }
fn d_gap() -> u32 { 12 }

#[tauri::command]
pub async fn contact_sheet(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    opts: ContactSheetOpts,
    output: OutputSpec,
) -> AppResult<FileResult> {
    let files = paths::validate_inputs(&inputs)?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let cols = opts.columns.clamp(1, 20);
    let thumb = opts.thumb_size.clamp(48, 1024);
    let gap = opts.gap.min(200);
    let label_h = if opts.labels { (thumb / 12).max(12) } else { 0 };
    let rows = (files.len() as u32).div_ceil(cols);
    let bg = match opts.background.as_deref() {
        Some(c) if !c.trim().is_empty() => parse_color(c)?,
        _ => Rgba([255, 255, 255, 255]),
    };
    let sheet_w = cols * thumb + (cols + 1) * gap;
    let sheet_h = rows * (thumb + label_h) + (rows + 1) * gap;
    let mut sheet = RgbaImage::from_pixel(sheet_w.max(1), sheet_h.max(1), bg);

    for (i, f) in files.iter().enumerate() {
        ctx.bail_if_cancelled()?;
        ctx.emit_item(i, 0.0, f);
        let Ok(img) = decode(f).await else { continue };
        let t = img.resize(thumb, thumb, FilterType::Lanczos3);
        let col = (i as u32) % cols;
        let row = (i as u32) / cols;
        let cell_x = gap + col * (thumb + gap);
        let cell_y = gap + row * (thumb + label_h + gap);
        let x = cell_x + (thumb - t.width()) / 2;
        let y = cell_y + (thumb - t.height()) / 2;
        image::imageops::overlay(&mut sheet, &t.to_rgba8(), x as i64, y as i64);
        if opts.labels {
            let name: String = paths::display_name(f).chars().take(28).collect();
            if let Ok(text) = render_text_overlay(&name, thumb, Some("#555555")) {
                let ty = cell_y + thumb + 2;
                image::imageops::overlay(&mut sheet, &text.to_rgba8(), cell_x as i64, ty as i64);
            }
        }
    }

    let first = files.first().unwrap();
    let mut spec = output.clone();
    if spec.filename.is_none() {
        spec.filename = Some("contact-sheet".to_string());
    }
    let dest = paths::resolve_destination(first, &spec, "png")?;
    if dest.is_skipped() {
        return Ok(FileResult::skipped(&dest, first));
    }
    let bytes = encode(&DynamicImage::ImageRgba8(sheet), "png", 100).await?;
    std::fs::write(&dest.path, bytes)?;
    Ok(FileResult::new(&dest.path, dest.disposition).with_note(format!("{} images", files.len())))
}

// ------------------------------------------------------------------ favicons

#[tauri::command]
pub async fn generate_favicons(input: String, output_dir: String) -> AppResult<BatchResult> {
    let file = paths::validate_input_file(&input)?;
    let dir = PathBuf::from(&output_dir);
    std::fs::create_dir_all(&dir)?;
    let img = decode(&file).await?;
    let started = now_ms();
    let mut batch = BatchResult::default();

    let png_sizes: [(u32, &str); 6] = [
        (16, "favicon-16x16.png"),
        (32, "favicon-32x32.png"),
        (180, "apple-touch-icon.png"),
        (192, "android-chrome-192x192.png"),
        (512, "android-chrome-512x512.png"),
        (150, "mstile-150x150.png"),
    ];
    for (size, name) in png_sizes {
        let resized = img.resize_exact(size, size, FilterType::Lanczos3);
        let bytes = encode(&resized, "png", 100).await?;
        let dest = paths::finalize_destination(dir.join(name), &file, "overwrite")?;
        std::fs::write(&dest.path, bytes)?;
        batch.results.push(FileResult::from_source(&dest.path, &file, dest.disposition));
    }
    let ico = encode_ico_multi(&img, &[16, 32, 48])?;
    let dest = paths::finalize_destination(dir.join("favicon.ico"), &file, "overwrite")?;
    std::fs::write(&dest.path, ico)?;
    batch.results.push(FileResult::from_source(&dest.path, &file, dest.disposition));

    let snippet = r#"<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">"#;
    let snippet_path = dir.join("favicon-snippet.html");
    std::fs::write(&snippet_path, snippet)?;
    batch.results.push(FileResult::new(&snippet_path, Disposition::Created).with_note("HTML snippet"));

    let manifest = serde_json::json!({
        "name": "",
        "short_name": "",
        "icons": [
            {"src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png"}
        ],
        "theme_color": "#ffffff",
        "background_color": "#ffffff",
        "display": "standalone"
    });
    let manifest_path = dir.join("site.webmanifest");
    std::fs::write(&manifest_path, serde_json::to_string_pretty(&manifest)?)?;
    batch.results.push(FileResult::new(&manifest_path, Disposition::Created).with_note("Web manifest"));

    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

// ------------------------------------------------------------------ GIF frames

#[tauri::command]
pub async fn split_gif_frames(app: AppHandle, job_id: String, input: String, format: Option<String>, output: OutputSpec) -> AppResult<BatchResult> {
    use image::AnimationDecoder;
    let file = paths::validate_input_file(&input)?;
    let ext = format.unwrap_or_else(|| "png".into());
    let dir = paths::resolve_output_folder(&file, &output, "-frames")?;
    let reader = std::fs::File::open(&file)?;
    let decoder = image::codecs::gif::GifDecoder::new(std::io::BufReader::new(reader))
        .map_err(|e| AppError::with_details(ErrorKind::Process, "This file could not be read as an animated GIF.", e.to_string()))?;
    let frames: Vec<_> = decoder.into_frames().collect_frames().map_err(|e| {
        AppError::with_details(ErrorKind::Process, "The GIF frames could not be decoded.", e.to_string())
    })?;
    let ctx = JobCtx::new(app, job_id, frames.len());
    let started = now_ms();
    let mut batch = BatchResult::default();
    for (i, frame) in frames.into_iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.0, &file);
        let img = DynamicImage::ImageRgba8(frame.into_buffer());
        let name = format!("frame_{:04}.{}", i + 1, ext);
        let dest = dir.join(paths::sanitize_filename(&name));
        let bytes = encode(&img, &ext, 92).await?;
        std::fs::write(&dest, bytes)?;
        batch.results.push(FileResult::from_source(&dest, &file, Disposition::Created));
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

// ------------------------------------------------------------------ base64

#[tauri::command]
pub fn image_to_base64(input: String, as_data_url: Option<bool>) -> AppResult<String> {
    use base64::Engine;
    let file = paths::validate_input_file(&input)?;
    let size = std::fs::metadata(&file)?.len();
    if size > 40 * 1024 * 1024 {
        return Err(AppError::invalid("That image is larger than 40 MB — too big to inline as Base64."));
    }
    let bytes = std::fs::read(&file)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    if as_data_url.unwrap_or(true) {
        let mime = mime_guess::from_path(&file).first_raw().unwrap_or("application/octet-stream");
        Ok(format!("data:{mime};base64,{b64}"))
    } else {
        Ok(b64)
    }
}

#[tauri::command]
pub fn base64_to_image(data: String, output_path: String) -> AppResult<FileResult> {
    use base64::Engine;
    let payload = data.split(',').next_back().unwrap_or("").trim();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| AppError::with_details(ErrorKind::InvalidInput, "That text is not valid Base64 data.", e.to_string()))?;
    let dir = PathBuf::from(&output_path);
    let parent = dir.parent().ok_or_else(|| AppError::invalid("Choose where to save the image."))?;
    std::fs::create_dir_all(parent)?;
    let dest = paths::finalize_destination(dir.clone(), Path::new("/dev/null"), "rename")?;
    std::fs::write(&dest.path, &bytes)?;
    Ok(FileResult::new(&dest.path, dest.disposition))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colors_parse_in_every_notation() {
        assert_eq!(parse_color("#fff").unwrap(), Rgba([255, 255, 255, 255]));
        assert_eq!(parse_color("000000").unwrap(), Rgba([0, 0, 0, 255]));
        assert_eq!(parse_color("#ff000080").unwrap(), Rgba([255, 0, 0, 128]));
        assert!(parse_color("nope").is_err());
        assert!(parse_color("#12345").is_err());
    }

    #[test]
    fn ico_container_has_a_valid_header() {
        let img = DynamicImage::ImageRgba8(RgbaImage::from_pixel(64, 64, Rgba([1, 2, 3, 255])));
        let ico = encode_ico_multi(&img, &[16, 32]).unwrap();
        assert_eq!(&ico[0..2], &[0, 0]);
        assert_eq!(&ico[2..4], &[1, 0]);
        assert_eq!(u16::from_le_bytes([ico[4], ico[5]]), 2);
        // Offsets must land inside the buffer.
        let first_offset = u32::from_le_bytes([ico[18], ico[19], ico[20], ico[21]]) as usize;
        assert!(first_offset < ico.len());
    }

    #[test]
    fn resize_fit_does_not_upscale_by_default() {
        let img = DynamicImage::ImageRgba8(RgbaImage::new(100, 50));
        let out = apply_resize(img, &ResizeOpt { width: Some(400), height: Some(400), ..Default::default() });
        assert_eq!(out.dimensions(), (100, 50));
    }

    #[test]
    fn resize_percent_scales_both_axes() {
        let img = DynamicImage::ImageRgba8(RgbaImage::new(200, 100));
        let out = apply_resize(img, &ResizeOpt { mode: Some("percent".into()), percent: Some(50.0), ..Default::default() });
        assert_eq!(out.dimensions(), (100, 50));
    }

    #[test]
    fn resize_fill_matches_the_box_exactly() {
        let img = DynamicImage::ImageRgba8(RgbaImage::new(200, 100));
        let out = apply_resize(img, &ResizeOpt { width: Some(80), height: Some(80), mode: Some("fill".into()), ..Default::default() });
        assert_eq!(out.dimensions(), (80, 80));
    }

    #[test]
    fn palette_quantiser_returns_requested_bucket_count() {
        let pixels: Vec<[u8; 3]> = (0..1000u32)
            .map(|i| [(i % 255) as u8, ((i * 7) % 255) as u8, ((i * 13) % 255) as u8])
            .collect();
        let buckets = median_cut(pixels, 5);
        assert_eq!(buckets.len(), 5);
    }

    #[test]
    fn jpeg_encoding_flattens_alpha_instead_of_failing() {
        let img = DynamicImage::ImageRgba8(RgbaImage::from_pixel(8, 8, Rgba([255, 0, 0, 0])));
        let bytes = encode_native(&img, "jpg", 80).unwrap();
        assert_eq!(&bytes[0..2], &[0xFF, 0xD8]);
    }
}

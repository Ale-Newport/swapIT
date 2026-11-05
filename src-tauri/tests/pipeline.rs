//! End-to-end tests for the processing pipeline, using small real fixtures.
//!
//! These exercise the paths a user actually takes: decode a real file (including
//! HEIC, which needs an external decoder), run the op pipeline, encode, and write
//! through the collision-safe destination logic.

use std::path::{Path, PathBuf};
use toolbox_lib::cmd::images::{self, ImageOps, ResizeOpt};
use toolbox_lib::paths::{self, Disposition, OutputSpec};

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
}

fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("toolbox-it-{tag}-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[tokio::test]
async fn decodes_a_real_png_and_reports_its_size() {
    let img = images::decode(&fixture("sample.png")).await.expect("png should decode natively");
    assert_eq!(image::GenericImageView::dimensions(&img), (240, 160));
}

#[tokio::test]
async fn decodes_a_real_jpeg() {
    let img = images::decode(&fixture("sample.jpg")).await.expect("jpeg should decode natively");
    assert_eq!(image::GenericImageView::dimensions(&img), (240, 160));
}

/// HEIC is the conversion people reach for most, and the one format the pure-Rust
/// engine cannot read — it must come back through `sips` or ImageMagick.
#[tokio::test]
async fn decodes_heic_through_an_external_decoder() {
    let path = fixture("sample.heic");
    if !path.exists() {
        eprintln!("skipping: no HEIC fixture");
        return;
    }
    let img = images::decode(&path).await.expect("HEIC must decode via sips or ImageMagick");
    assert_eq!(image::GenericImageView::dimensions(&img), (240, 160));
}

#[tokio::test]
async fn heic_to_jpeg_produces_a_real_jpeg() {
    let path = fixture("sample.heic");
    if !path.exists() {
        return;
    }
    let img = images::decode(&path).await.unwrap();
    let bytes = images::encode(&img, "jpg", 85).await.expect("jpeg encode");
    // SOI marker plus a plausible size for a 240x160 photo.
    assert_eq!(&bytes[0..2], &[0xFF, 0xD8], "output must start with the JPEG SOI marker");
    assert!(bytes.len() > 500, "a real 240x160 JPEG should not be a stub");
    // And it must round-trip back through the decoder.
    let dir = temp_dir("heic-jpg");
    let out = dir.join("out.jpg");
    std::fs::write(&out, &bytes).unwrap();
    let reread = images::decode(&out).await.unwrap();
    assert_eq!(image::GenericImageView::dimensions(&reread), (240, 160));
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn resize_pipeline_produces_the_requested_dimensions() {
    let img = images::decode(&fixture("sample.png")).await.unwrap();
    let ops = ImageOps {
        resize: Some(ResizeOpt { width: Some(120), height: Some(120), mode: Some("fit".into()), ..Default::default() }),
        ..Default::default()
    };
    let out = images::apply_ops(img, &ops).await.unwrap();
    // "fit" keeps the aspect ratio: 240x160 into a 120 box is 120x80.
    assert_eq!(image::GenericImageView::dimensions(&out), (120, 80));
}

#[tokio::test]
async fn png_to_jpeg_round_trips_through_the_encoder() {
    let img = images::decode(&fixture("sample.png")).await.unwrap();
    let bytes = images::encode(&img, "jpg", 80).await.unwrap();
    assert_eq!(&bytes[0..2], &[0xFF, 0xD8]);

    let png = images::encode(&img, "png", 100).await.unwrap();
    assert_eq!(&png[0..8], b"\x89PNG\r\n\x1a\n", "PNG signature");
}

#[tokio::test]
async fn lower_jpeg_quality_makes_a_smaller_file() {
    let img = images::decode(&fixture("sample.png")).await.unwrap();
    let high = images::encode(&img, "jpg", 95).await.unwrap();
    let low = images::encode(&img, "jpg", 40).await.unwrap();
    assert!(low.len() < high.len(), "quality 40 ({}) should beat quality 95 ({})", low.len(), high.len());
}

/// The property that matters most for a file tool: running a conversion twice
/// must never destroy the first result.
#[test]
fn repeated_conversions_never_overwrite_each_other() {
    let dir = temp_dir("collision");
    let input = dir.join("photo.heic");
    std::fs::write(&input, b"not really heic, only the name matters here").unwrap();

    let spec = OutputSpec::default();
    let first = paths::resolve_destination(&input, &spec, "jpg").unwrap();
    assert_eq!(paths::display_name(&first.path), "photo.jpg");
    std::fs::write(&first.path, b"first result").unwrap();

    let second = paths::resolve_destination(&input, &spec, "jpg").unwrap();
    assert_eq!(paths::display_name(&second.path), "photo_1.jpg");
    assert_eq!(second.disposition, Disposition::Renamed);
    std::fs::write(&second.path, b"second result").unwrap();

    let third = paths::resolve_destination(&input, &spec, "jpg").unwrap();
    assert_eq!(paths::display_name(&third.path), "photo_2.jpg");

    // The first result is still exactly what we wrote.
    assert_eq!(std::fs::read(&first.path).unwrap(), b"first result");
    std::fs::remove_dir_all(&dir).ok();
}

/// A file name is never allowed to become a path or escape its folder.
#[test]
fn hostile_names_stay_inside_the_output_folder() {
    let dir = temp_dir("hostile");
    let input = dir.join("input.png");
    std::fs::write(&input, b"x").unwrap();

    for hostile in ["../../../etc/passwd", "..", "a/b/c", "; rm -rf ~", "name\0with\0nulls"] {
        let spec = OutputSpec { filename: Some(hostile.to_string()), ..Default::default() };
        let dest = paths::resolve_destination(&input, &spec, "jpg").unwrap();
        assert_eq!(
            dest.path.parent().unwrap(),
            dir.as_path(),
            "“{hostile}” escaped the output folder as {:?}",
            dest.path
        );
        assert!(!dest.path.to_string_lossy().contains('\0'));
    }
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn palette_extraction_returns_colours_from_the_image() {
    let dir = temp_dir("palette");
    let src = dir.join("sample.png");
    std::fs::copy(fixture("sample.png"), &src).unwrap();
    let colours = images::extract_palette(src.to_string_lossy().to_string(), Some(5)).await.unwrap();
    assert_eq!(colours.len(), 5);
    assert!(colours.iter().all(|c| c.hex.starts_with('#') && c.hex.len() == 7));
    // The gradient fixture runs blue → orange, so the palette cannot be all one colour.
    let unique: std::collections::HashSet<_> = colours.iter().map(|c| &c.hex).collect();
    assert!(unique.len() > 1, "a gradient must not collapse to one colour: {colours:?}");
    // Percentages should roughly account for the whole image.
    let total: f64 = colours.iter().map(|c| c.percentage).sum();
    assert!((total - 100.0).abs() < 1.0, "percentages summed to {total}");
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn image_info_reports_dimensions_and_aspect_ratio() {
    let infos = images::image_info(vec![fixture("sample.png").to_string_lossy().to_string()])
        .await
        .unwrap();
    let info = &infos[0];
    assert_eq!((info.width, info.height), (240, 160));
    assert_eq!(info.aspect_ratio, "3:2");
    assert!((info.megapixels - 0.0384).abs() < 0.0001);
}

#[tokio::test]
async fn a_missing_file_fails_with_a_readable_message() {
    let err = images::image_info(vec!["/definitely/not/here.png".into()]).await.unwrap_err();
    let toolbox_lib::error::AppError::Friendly { message, kind, .. } = err;
    assert_eq!(kind, toolbox_lib::error::ErrorKind::NotFound);
    assert!(message.contains("Could not find"), "unhelpful message: {message}");
    // The message must be a sentence for a person, not a raw errno.
    assert!(message.ends_with('.'), "message should read as a sentence: {message}");
}


/// The "skip" collision policy is a promise: an existing file is left byte-for-byte
/// alone. `finalize_destination` hands back the *existing* path in that case, so a
/// writer that ignores the disposition would destroy exactly what it was told to
/// preserve. Every command that writes must consult `is_skipped()` first.
#[test]
fn skip_policy_points_at_the_existing_file_and_flags_it() {
    let dir = temp_dir("skip");
    let input = dir.join("photo.heic");
    std::fs::write(&input, b"input").unwrap();
    let existing = dir.join("photo.jpg");
    std::fs::write(&existing, b"precious existing result").unwrap();

    let spec = OutputSpec { collision: "skip".into(), ..Default::default() };
    let dest = paths::resolve_destination(&input, &spec, "jpg").unwrap();

    assert!(dest.is_skipped(), "an existing destination under the skip policy must report as skipped");
    assert_eq!(dest.path, existing, "skip reports the existing path so it can be named in the result");
    // The guard is what protects the bytes; assert the file is still untouched.
    assert_eq!(std::fs::read(&existing).unwrap(), b"precious existing result");
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn skip_policy_still_writes_when_nothing_is_in_the_way() {
    let dir = temp_dir("skip-free");
    let input = dir.join("photo.heic");
    std::fs::write(&input, b"input").unwrap();

    let spec = OutputSpec { collision: "skip".into(), ..Default::default() };
    let dest = paths::resolve_destination(&input, &spec, "jpg").unwrap();
    assert!(!dest.is_skipped());
    assert_eq!(dest.disposition, Disposition::Created);
    std::fs::remove_dir_all(&dir).ok();
}

/// Lossy WebP, AVIF and HEIC are written by ImageMagick; the Rust encoders cannot do them.
/// This is what "convert to WebP/AVIF/HEIC" runs, with whatever ImageMagick is installed.
#[tokio::test]
async fn webp_avif_and_heic_are_written_through_imagemagick() {
    if toolbox_lib::binaries::resolve("magick").is_none() {
        return;
    }
    let img = images::decode(&fixture("sample.png")).await.unwrap();
    for (ext, check) in [
        ("webp", Box::new(|b: &[u8]| &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP") as Box<dyn Fn(&[u8]) -> bool>),
        ("avif", Box::new(|b: &[u8]| &b[4..8] == b"ftyp")),
        ("heic", Box::new(|b: &[u8]| &b[4..8] == b"ftyp")),
    ] {
        let bytes = images::encode(&img, ext, 80).await.unwrap_or_else(|e| panic!("{ext}: {e:?}"));
        assert!(bytes.len() > 100 && check(&bytes), "{ext} output is not a real {ext} file");
    }
}

/// SVG has no native decoder; ImageMagick rasterises it (sharply, at a high density).
#[tokio::test]
async fn an_svg_is_rasterised_through_imagemagick() {
    if toolbox_lib::binaries::resolve("magick").is_none() {
        return;
    }
    let dir = temp_dir("svg");
    let svg = dir.join("shape.svg");
    std::fs::write(
        &svg,
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="#e33"/></svg>"##,
    )
    .unwrap();
    let img = images::decode(&svg).await.expect("SVG must rasterise");
    let (w, h) = image::GenericImageView::dimensions(&img);
    assert!(w >= 100 && h >= 60 && (w as f64 / h as f64 - 100.0 / 60.0).abs() < 0.02, "got {w}x{h}");
    std::fs::remove_dir_all(&dir).ok();
}

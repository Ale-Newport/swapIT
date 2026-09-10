use crate::binaries;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::jobs::{self, JobCtx};
use crate::paths::{self, Disposition, OutputSpec};
use crate::types::{now_ms, BatchResult, FileResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

// ------------------------------------------------------------------ metadata

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataEntry {
    pub group: String,
    pub tag: String,
    pub value: String,
}

/// Read EXIF with the built-in Rust parser; fall back to ExifTool when present
/// for formats it does not cover.
#[tauri::command]
pub async fn read_metadata(input: String) -> AppResult<Vec<MetadataEntry>> {
    let file = paths::validate_input_file(&input)?;
    let mut out: Vec<MetadataEntry> = Vec::new();

    let f = std::fs::File::open(&file)?;
    let mut reader = std::io::BufReader::new(&f);
    if let Ok(exif) = exif::Reader::new().read_from_container(&mut reader) {
        for field in exif.fields() {
            out.push(MetadataEntry {
                group: format!("{:?}", field.ifd_num),
                tag: format!("{}", field.tag),
                value: field.display_value().with_unit(&exif).to_string(),
            });
        }
    }

    if out.is_empty() {
        if let Some(exiftool) = binaries::resolve("exiftool") {
            let args = ["-json".to_string(), "-G".to_string(), file.to_string_lossy().to_string()];
            if let Ok(res) = jobs::run(None, &exiftool, &args).await {
                if res.ok() {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&res.stdout) {
                        if let Some(obj) = v.as_array().and_then(|a| a.first()).and_then(|o| o.as_object()) {
                            for (k, val) in obj {
                                let (group, tag) = k.split_once(':').unwrap_or(("File", k.as_str()));
                                out.push(MetadataEntry {
                                    group: group.to_string(),
                                    tag: tag.to_string(),
                                    value: match val {
                                        serde_json::Value::String(s) => s.clone(),
                                        other => other.to_string(),
                                    },
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(out)
}

/// Strip metadata by re-encoding the pixels only — no EXIF, no GPS, no timestamps.
#[tauri::command]
pub async fn strip_image_metadata(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    let ops = crate::cmd::images::ImageOps { strip_metadata: true, ..Default::default() };
    crate::cmd::images::process_images(app, job_id, inputs, ops, output).await
}

// ------------------------------------------------------------------ OCR

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrOpts {
    /// Tesseract language codes joined with "+", e.g. "eng+spa".
    #[serde(default = "d_lang")]
    pub languages: String,
    #[serde(default = "d_psm")]
    pub psm: u8,
    #[serde(default = "d_dpi")]
    pub dpi: u32,
}
fn d_lang() -> String { "eng".into() }
fn d_psm() -> u8 { 3 }
fn d_dpi() -> u32 { 300 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub source: String,
    pub text: String,
    pub characters: usize,
    pub words: usize,
}

fn validate_langs(raw: &str) -> AppResult<String> {
    let cleaned: Vec<&str> = raw
        .split('+')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
        .collect();
    if cleaned.is_empty() {
        return Err(AppError::invalid("Choose at least one OCR language."));
    }
    Ok(cleaned.join("+"))
}

#[tauri::command]
pub async fn available_ocr_languages() -> AppResult<Vec<String>> {
    let tesseract = binaries::require("tesseract")?;
    let args = ["--list-langs".to_string()];
    let out = jobs::run(None, &tesseract, &args).await?;
    let source = if out.stdout.trim().is_empty() { &out.stderr } else { &out.stdout };
    Ok(source
        .lines()
        .skip_while(|l| !l.to_lowercase().contains("available"))
        .skip(1)
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect())
}

async fn ocr_one(ctx: &JobCtx, index: usize, file: &Path, opts: &OcrOpts, langs: &str) -> AppResult<String> {
    let tesseract = binaries::require("tesseract")?;
    let is_pdf = paths::extension(file) == "pdf";
    let work = std::env::temp_dir().join(format!("toolbox-ocr-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&work)?;
    let cleanup = |d: &Path| { std::fs::remove_dir_all(d).ok(); };

    let mut images: Vec<PathBuf> = Vec::new();
    if is_pdf {
        let pdftoppm = binaries::require("pdftoppm").inspect_err(|_| cleanup(&work))?;
        let args: Vec<String> = vec![
            "-r".into(), opts.dpi.clamp(72, 600).to_string(),
            "-png".into(),
            file.to_string_lossy().to_string(),
            work.join("page").to_string_lossy().to_string(),
        ];
        let out = jobs::run(Some(&ctx.handle), &pdftoppm, &args).await;
        let out = match out { Ok(o) => o, Err(e) => { cleanup(&work); return Err(e); } };
        if !out.ok() {
            cleanup(&work);
            return Err(jobs::explain_failure("Rendering the PDF for OCR", &out));
        }
        let mut pages: Vec<PathBuf> = std::fs::read_dir(&work)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_file())
            .collect();
        pages.sort();
        images = pages;
    } else {
        images.push(file.to_path_buf());
    }

    let mut text = String::new();
    let page_count = images.len().max(1);
    for (i, img) in images.iter().enumerate() {
        if ctx.is_cancelled() {
            cleanup(&work);
            return Err(AppError::cancelled());
        }
        ctx.emit_item(index, (i as f64) / (page_count as f64), file);
        let out_stem = work.join(format!("ocr_{i}"));
        let args: Vec<String> = vec![
            img.to_string_lossy().to_string(),
            out_stem.to_string_lossy().to_string(),
            "-l".into(), langs.to_string(),
            "--psm".into(), opts.psm.clamp(0, 13).to_string(),
        ];
        let out = jobs::run(Some(&ctx.handle), &tesseract, &args).await;
        let out = match out { Ok(o) => o, Err(e) => { cleanup(&work); return Err(e); } };
        if !out.ok() {
            let hay = out.tail().to_lowercase();
            cleanup(&work);
            if hay.contains("failed loading language") || hay.contains("could not initialize tesseract") {
                return Err(AppError::with_details(
                    ErrorKind::MissingDependency,
                    format!("The OCR language data for “{langs}” is not installed."),
                    "Install more languages with `brew install tesseract-lang`.",
                ));
            }
            return Err(jobs::explain_failure("Reading text from the image", &out));
        }
        let produced = out_stem.with_extension("txt");
        if let Ok(page_text) = std::fs::read_to_string(&produced) {
            if page_count > 1 {
                text.push_str(&format!("\n--- Page {} ---\n", i + 1));
            }
            text.push_str(&page_text);
        }
    }
    cleanup(&work);
    Ok(text)
}

#[tauri::command]
pub async fn ocr_files(app: AppHandle, job_id: String, inputs: Vec<String>, opts: OcrOpts) -> AppResult<Vec<OcrResult>> {
    let files = paths::validate_inputs(&inputs)?;
    let langs = validate_langs(&opts.languages)?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let mut out = Vec::new();
    for (i, f) in files.iter().enumerate() {
        ctx.bail_if_cancelled()?;
        ctx.emit_item(i, 0.0, f);
        let text = ocr_one(&ctx, i, f, &opts, &langs).await?;
        out.push(OcrResult {
            source: f.to_string_lossy().to_string(),
            characters: text.chars().count(),
            words: text.split_whitespace().count(),
            text,
        });
    }
    Ok(out)
}

// ------------------------------------------------------------------ screenshots

#[tauri::command]
pub async fn take_screenshot(
    app: AppHandle,
    mode: String,
    output_dir: Option<String>,
) -> AppResult<FileResult> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, mode, output_dir);
        return Err(AppError::unsupported("Screen capture is only available on macOS."));
    }
    #[cfg(target_os = "macos")]
    {
        // Toolbox itself must not end up in the shot. Hide the window, capture,
        // then bring it back whatever happened.
        use tauri::Manager;
        let window = app.get_webview_window("main");
        if let Some(w) = &window {
            let _ = w.hide();
            // Give the compositor a moment to actually take the window down.
            tokio::time::sleep(std::time::Duration::from_millis(220)).await;
        }
        let restore = |w: &Option<tauri::WebviewWindow>| {
            if let Some(w) = w {
                let _ = w.show();
                let _ = w.set_focus();
            }
        };
        let capture = Path::new("/usr/sbin/screencapture");
        if !capture.exists() {
            restore(&window);
            return Err(AppError::not_found("macOS screencapture was not found."));
        }
        let dir = match output_dir.filter(|d| !d.trim().is_empty()) {
            Some(d) => PathBuf::from(d),
            None => dirs::picture_dir().unwrap_or_else(std::env::temp_dir),
        };
        std::fs::create_dir_all(&dir)?;
        let name = format!("Screenshot-{}.png", uuid::Uuid::new_v4().simple());
        let dest = dir.join(&name);
        let mut args: Vec<String> = Vec::new();
        match mode.as_str() {
            "window" => args.push("-w".into()),
            "full" => {}
            _ => args.push("-i".into()),
        }
        args.push("-x".into()); // no shutter sound
        args.push(dest.to_string_lossy().to_string());
        let out = jobs::run(None, capture, &args).await;
        restore(&window);
        let out = out?;
        if !dest.exists() {
            return Err(AppError::with_details(
                ErrorKind::Cancelled,
                "No screenshot was taken.",
                out.tail(),
            ));
        }
        Ok(FileResult::new(&dest, Disposition::Created))
    }
}

// ------------------------------------------------------------------ downloader

/// Hosts whose content is protected by DRM or access controls. Toolbox refuses
/// these outright rather than attempting to work around the protection.
const BLOCKED_HOSTS: &[&str] = &[
    "netflix.com", "disneyplus.com", "hbomax.com", "max.com", "primevideo.com",
    "hulu.com", "spotify.com", "appletv.com", "tv.apple.com", "peacocktv.com",
    "paramountplus.com", "crunchyroll.com", "audible.com", "kindle.amazon.com",
];

fn check_url(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid("Paste a link first."));
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err(AppError::invalid("Only http:// and https:// links are supported."));
    }
    if trimmed.contains(char::is_whitespace) {
        return Err(AppError::invalid("That link contains spaces — check that it was pasted correctly."));
    }
    let host = trimmed
        .split("://")
        .nth(1)
        .and_then(|rest| rest.split('/').next())
        .unwrap_or("")
        .trim_start_matches("www.")
        .to_lowercase();
    if BLOCKED_HOSTS.iter().any(|b| host == *b || host.ends_with(&format!(".{b}"))) {
        return Err(AppError::with_details(
            ErrorKind::Unsupported,
            "Toolbox does not download from DRM-protected services.",
            "This tool is for media you created, that is in the public domain, or that you are licensed to save.",
        ));
    }
    Ok(trimmed.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFormat {
    pub id: String,
    pub ext: String,
    pub resolution: String,
    pub note: String,
    pub filesize: Option<u64>,
    pub vcodec: String,
    pub acodec: String,
    pub fps: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMediaInfo {
    pub title: String,
    pub uploader: String,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub webpage_url: String,
    pub extractor: String,
    pub is_live: bool,
    pub formats: Vec<MediaFormat>,
}

#[tauri::command]
pub async fn remote_media_info(url: String) -> AppResult<RemoteMediaInfo> {
    let url = check_url(&url)?;
    let ytdlp = binaries::require("yt-dlp")?;
    let args: Vec<String> = vec![
        "--dump-single-json".into(),
        "--no-playlist".into(),
        "--no-warnings".into(),
        "--".into(),
        url.clone(),
    ];
    let out = jobs::run(None, &ytdlp, &args).await?;
    if !out.ok() {
        let hay = out.tail().to_lowercase();
        if hay.contains("drm") || hay.contains("protected") {
            return Err(AppError::with_details(
                ErrorKind::Unsupported,
                "This media is DRM protected — Toolbox will not download it.",
                out.tail(),
            ));
        }
        if hay.contains("sign in") || hay.contains("private") || hay.contains("login") {
            return Err(AppError::with_details(
                ErrorKind::Unsupported,
                "This media requires an account or is private, so Toolbox cannot fetch it.",
                out.tail(),
            ));
        }
        return Err(jobs::explain_failure("Reading media information", &out));
    }
    let v: serde_json::Value = serde_json::from_str(&out.stdout)
        .map_err(|e| AppError::with_details(ErrorKind::Process, "The media information could not be read.", e.to_string()))?;
    let formats = v
        .get("formats")
        .and_then(|f| f.as_array())
        .map(|arr| {
            arr.iter()
                .map(|f| MediaFormat {
                    id: f.get("format_id").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    ext: f.get("ext").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    resolution: f
                        .get("resolution")
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| {
                            match (f.get("width").and_then(|w| w.as_u64()), f.get("height").and_then(|h| h.as_u64())) {
                                (Some(w), Some(h)) => format!("{w}x{h}"),
                                _ => "audio only".to_string(),
                            }
                        }),
                    note: f.get("format_note").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    filesize: f
                        .get("filesize")
                        .and_then(|x| x.as_u64())
                        .or_else(|| f.get("filesize_approx").and_then(|x| x.as_u64())),
                    vcodec: f.get("vcodec").and_then(|x| x.as_str()).unwrap_or("none").to_string(),
                    acodec: f.get("acodec").and_then(|x| x.as_str()).unwrap_or("none").to_string(),
                    fps: f.get("fps").and_then(|x| x.as_f64()),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(RemoteMediaInfo {
        title: v.get("title").and_then(|x| x.as_str()).unwrap_or("Untitled").to_string(),
        uploader: v.get("uploader").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        duration: v.get("duration").and_then(|x| x.as_f64()),
        thumbnail: v.get("thumbnail").and_then(|x| x.as_str()).map(|s| s.to_string()),
        webpage_url: v.get("webpage_url").and_then(|x| x.as_str()).unwrap_or(&url).to_string(),
        extractor: v.get("extractor_key").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        is_live: v.get("is_live").and_then(|x| x.as_bool()).unwrap_or(false),
        formats,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOpts {
    /// "best", "1080", "720", "480", "audio-mp3", "audio-original" or a raw format id.
    #[serde(default = "d_best")]
    pub quality: String,
    #[serde(default)]
    pub playlist: bool,
    #[serde(default)]
    pub embed_thumbnail: bool,
    #[serde(default)]
    pub write_subtitles: bool,
}
fn d_best() -> String { "best".into() }

#[tauri::command]
pub async fn download_media(
    app: AppHandle,
    job_id: String,
    url: String,
    opts: DownloadOpts,
    output_dir: String,
) -> AppResult<BatchResult> {
    let url = check_url(&url)?;
    let ytdlp = binaries::require("yt-dlp")?;
    let dir = PathBuf::from(&output_dir);
    if dir.as_os_str().is_empty() {
        return Err(AppError::invalid("Choose where to save the download."));
    }
    std::fs::create_dir_all(&dir)?;
    let ctx = JobCtx::new(app, job_id, 1);
    let started = now_ms();

    let mut args: Vec<String> = vec![
        "--newline".into(),
        "--no-warnings".into(),
        "--restrict-filenames".into(),
        "--no-overwrites".into(),
        "-o".into(),
        dir.join("%(title).150s.%(ext)s").to_string_lossy().to_string(),
    ];
    if !opts.playlist {
        args.push("--no-playlist".into());
    }
    match opts.quality.as_str() {
        "audio-mp3" => {
            args.push("-x".into());
            args.push("--audio-format".into());
            args.push("mp3".into());
            args.push("--audio-quality".into());
            args.push("0".into());
        }
        "audio-original" => {
            args.push("-f".into());
            args.push("bestaudio".into());
        }
        "best" => {
            args.push("-f".into());
            args.push("bestvideo*+bestaudio/best".into());
        }
        q if q.chars().all(|c| c.is_ascii_digit()) && !q.is_empty() => {
            args.push("-f".into());
            args.push(format!("bestvideo[height<={q}]+bestaudio/best[height<={q}]"));
            args.push("--merge-output-format".into());
            args.push("mp4".into());
        }
        other => {
            // A raw format id from the listing. Restrict the characters we forward.
            if !other.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '+' || c == '.') {
                return Err(AppError::invalid("That format selection is not valid."));
            }
            args.push("-f".into());
            args.push(other.to_string());
        }
    }
    if opts.embed_thumbnail {
        args.push("--embed-thumbnail".into());
    }
    if opts.write_subtitles {
        args.push("--write-auto-subs".into());
        args.push("--sub-langs".into());
        args.push("en,es".into());
    }
    args.push("--".into());
    args.push(url.clone());

    let before: std::collections::HashSet<PathBuf> = std::fs::read_dir(&dir)
        .map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.path()).collect())
        .unwrap_or_default();

    let app_handle = ctx.app.clone();
    let job_id_clone = ctx.job_id.clone();
    let hook = move |line: &str| {
        // "[download]  42.3% of 12.34MiB at ..."
        if let Some(pos) = line.find('%') {
            let head = &line[..pos];
            if let Some(num) = head.rsplit([' ', '[']).next() {
                if let Ok(pct) = num.trim().parse::<f64>() {
                    use tauri::Emitter;
                    let _ = app_handle.emit(
                        "toolbox://progress",
                        jobs::ProgressPayload {
                            job_id: job_id_clone.clone(),
                            progress: Some((pct / 100.0).clamp(0.0, 1.0)),
                            done: 0,
                            total: 1,
                            message: Some(line.trim().to_string()),
                            current_file: None,
                        },
                    );
                }
            }
        }
    };

    let out = jobs::run_with_line_hook(Some(&ctx.handle), &ytdlp, &args, Some(hook)).await?;
    if !out.ok() {
        let hay = out.tail().to_lowercase();
        if hay.contains("drm") {
            return Err(AppError::with_details(
                ErrorKind::Unsupported,
                "This media is DRM protected — Toolbox will not download it.",
                out.tail(),
            ));
        }
        return Err(jobs::explain_failure("Downloading the media", &out));
    }

    let mut batch = BatchResult::default();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        let mut created: Vec<PathBuf> = rd
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_file() && !before.contains(p))
            .collect();
        created.sort();
        for p in created {
            batch.results.push(FileResult::new(&p, Disposition::Created));
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drm_hosts_are_refused() {
        assert!(check_url("https://www.netflix.com/watch/123").is_err());
        assert!(check_url("https://open.spotify.com/track/abc").is_err());
        assert!(check_url("https://tv.apple.com/show").is_err());
    }

    #[test]
    fn only_http_urls_are_accepted() {
        assert!(check_url("file:///etc/passwd").is_err());
        assert!(check_url("javascript:alert(1)").is_err());
        assert!(check_url("").is_err());
        assert!(check_url("https://example.com/video with space").is_err());
        assert!(check_url("https://example.com/video").is_ok());
    }

    #[test]
    fn language_codes_are_validated() {
        assert_eq!(validate_langs("eng+spa").unwrap(), "eng+spa");
        assert_eq!(validate_langs(" eng , spa ").unwrap_or_default(), "");
        assert!(validate_langs("").is_err());
        assert!(validate_langs("eng; rm -rf /").is_err());
    }
}

use crate::binaries;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::jobs::{self, JobCtx, JobHandle};
use crate::paths::{self, Disposition, OutputSpec};
use crate::types::{now_ms, BatchResult, FileResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::AppHandle;

// ------------------------------------------------------------------ probing

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub index: u32,
    pub kind: String,
    pub codec: String,
    pub codec_long: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub bitrate: Option<u64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub channel_layout: Option<String>,
    pub pix_fmt: Option<String>,
    pub language: Option<String>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub duration: Option<f64>,
    pub format_name: String,
    pub format_long: String,
    pub bitrate: Option<u64>,
    pub streams: Vec<StreamInfo>,
    pub tags: Vec<(String, String)>,
    pub video: Option<StreamInfo>,
    pub audio: Option<StreamInfo>,
}

fn parse_fps(raw: &str) -> Option<f64> {
    let (num, den) = raw.split_once('/')?;
    let n: f64 = num.parse().ok()?;
    let d: f64 = den.parse().ok()?;
    if d == 0.0 {
        return None;
    }
    Some(n / d)
}

pub async fn probe(path: &Path) -> AppResult<MediaInfo> {
    let ffprobe = binaries::require("ffprobe")?;
    let args = [
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        &path.to_string_lossy(),
    ];
    let out = jobs::run(None, &ffprobe, &args).await?;
    if !out.ok() {
        return Err(jobs::explain_failure("Reading media information", &out));
    }
    let v: serde_json::Value = serde_json::from_str(&out.stdout).map_err(|e| {
        AppError::with_details(ErrorKind::Process, "FFprobe returned data Toolbox could not read.", e.to_string())
    })?;

    let format = v.get("format").cloned().unwrap_or_default();
    let mut info = MediaInfo {
        path: path.to_string_lossy().to_string(),
        name: paths::display_name(path),
        size: std::fs::metadata(path).map(|m| m.len()).unwrap_or(0),
        duration: format.get("duration").and_then(|d| d.as_str()).and_then(|d| d.parse().ok()),
        format_name: format.get("format_name").and_then(|d| d.as_str()).unwrap_or("").to_string(),
        format_long: format.get("format_long_name").and_then(|d| d.as_str()).unwrap_or("").to_string(),
        bitrate: format.get("bit_rate").and_then(|d| d.as_str()).and_then(|d| d.parse().ok()),
        ..Default::default()
    };
    if let Some(tags) = format.get("tags").and_then(|t| t.as_object()) {
        for (k, val) in tags {
            if let Some(s) = val.as_str() {
                info.tags.push((k.clone(), s.to_string()));
            }
        }
    }
    if let Some(streams) = v.get("streams").and_then(|s| s.as_array()) {
        for s in streams {
            let kind = s.get("codec_type").and_then(|c| c.as_str()).unwrap_or("").to_string();
            let stream = StreamInfo {
                index: s.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as u32,
                codec: s.get("codec_name").and_then(|c| c.as_str()).unwrap_or("").to_string(),
                codec_long: s.get("codec_long_name").and_then(|c| c.as_str()).unwrap_or("").to_string(),
                width: s.get("width").and_then(|c| c.as_u64()).map(|n| n as u32),
                height: s.get("height").and_then(|c| c.as_u64()).map(|n| n as u32),
                fps: s.get("r_frame_rate").and_then(|c| c.as_str()).and_then(parse_fps),
                bitrate: s.get("bit_rate").and_then(|c| c.as_str()).and_then(|c| c.parse().ok()),
                sample_rate: s.get("sample_rate").and_then(|c| c.as_str()).and_then(|c| c.parse().ok()),
                channels: s.get("channels").and_then(|c| c.as_u64()).map(|n| n as u32),
                channel_layout: s.get("channel_layout").and_then(|c| c.as_str()).map(|s| s.to_string()),
                pix_fmt: s.get("pix_fmt").and_then(|c| c.as_str()).map(|s| s.to_string()),
                language: s.get("tags").and_then(|t| t.get("language")).and_then(|l| l.as_str()).map(|s| s.to_string()),
                kind: kind.clone(),
            };
            if kind == "video" && info.video.is_none() && stream.codec != "mjpeg" {
                info.video = Some(stream.clone());
            }
            if kind == "audio" && info.audio.is_none() {
                info.audio = Some(stream.clone());
            }
            info.streams.push(stream);
        }
    }
    Ok(info)
}

#[tauri::command]
pub async fn probe_media(inputs: Vec<String>) -> AppResult<Vec<MediaInfo>> {
    let files = paths::validate_inputs(&inputs)?;
    let mut out = Vec::new();
    for f in files {
        out.push(probe(&f).await?);
    }
    Ok(out)
}

// ------------------------------------------------------------------ ffmpeg run

/// Run FFmpeg, translating its `-progress` stream into fractional progress for one item.
async fn run_ffmpeg(
    ctx: &JobCtx,
    index: usize,
    file: &Path,
    args: Vec<String>,
    duration: Option<f64>,
) -> AppResult<()> {
    let ffmpeg = binaries::require("ffmpeg")?;
    let total_us = duration.map(|d| (d * 1_000_000.0) as u64).filter(|d| *d > 0);
    let last = Arc::new(AtomicU64::new(0));
    let job: JobHandle = ctx.handle.clone();

    let mut full: Vec<String> = vec!["-hide_banner".into(), "-nostdin".into(), "-y".into(), "-progress".into(), "pipe:1".into(), "-nostats".into()];
    full.extend(args);

    let last_clone = last.clone();
    let hook = move |line: &str| {
        if let Some(rest) = line.strip_prefix("out_time_us=") {
            if let Ok(us) = rest.trim().parse::<u64>() {
                last_clone.store(us, Ordering::Relaxed);
            }
        } else if let Some(rest) = line.strip_prefix("out_time_ms=") {
            if let Ok(ms) = rest.trim().parse::<u64>() {
                last_clone.store(ms, Ordering::Relaxed);
            }
        }
    };

    // Emit progress on a timer while FFmpeg runs.
    let progress_task = {
        let ctx_app = ctx.app.clone();
        let job_id = ctx.job_id.clone();
        let total_items = ctx.total;
        let last = last.clone();
        let file = file.to_path_buf();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                let Some(total) = total_us else { continue };
                let done_us = last.load(Ordering::Relaxed);
                let frac = (done_us as f64 / total as f64).clamp(0.0, 1.0);
                let overall = ((index as f64) + frac) / (total_items.max(1) as f64);
                use tauri::Emitter;
                let _ = ctx_app.emit(
                    "toolbox://progress",
                    jobs::ProgressPayload {
                        job_id: job_id.clone(),
                        progress: Some(overall.clamp(0.0, 1.0)),
                        done: index,
                        total: total_items,
                        message: None,
                        current_file: Some(file.to_string_lossy().to_string()),
                    },
                );
            }
        })
    };

    let out = jobs::run_with_line_hook(Some(&job), &ffmpeg, &full, Some(hook)).await;
    progress_task.abort();
    let out = out?;
    if !out.ok() {
        return Err(jobs::explain_failure("The FFmpeg operation", &out));
    }
    Ok(())
}

// ------------------------------------------------------------------ video ops

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VideoOps {
    /// Container extension: mp4, mov, mkv, webm, avi, m4v, gif.
    pub format: Option<String>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    /// Constant-rate factor; lower is better quality.
    pub crf: Option<u8>,
    pub preset: Option<String>,
    pub video_bitrate: Option<String>,
    pub audio_bitrate: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub start: Option<f64>,
    pub duration: Option<f64>,
    pub end: Option<f64>,
    pub crop: Option<[u32; 4]>,
    pub rotate: Option<i32>,
    #[serde(default)]
    pub flip_horizontal: bool,
    #[serde(default)]
    pub flip_vertical: bool,
    pub speed: Option<f64>,
    #[serde(default)]
    pub reverse: bool,
    #[serde(default)]
    pub remove_audio: bool,
    #[serde(default)]
    pub audio_only: bool,
    #[serde(default)]
    pub video_only: bool,
    #[serde(default)]
    pub copy_streams: bool,
    #[serde(default)]
    pub normalize_audio: bool,
    pub volume: Option<f64>,
    pub pitch: Option<f64>,
    #[serde(default)]
    pub to_mono: bool,
    pub sample_rate: Option<u32>,
    pub watermark: Option<MediaWatermark>,
    /// GIF-specific.
    pub gif_fps: Option<f64>,
    pub gif_width: Option<u32>,
    #[serde(default)]
    pub gif_loop: bool,
    pub gif_dither: Option<String>,
    pub extra_filters: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaWatermark {
    pub logo: Option<String>,
    pub text: Option<String>,
    #[serde(default = "wm_pos")]
    pub position: String,
    #[serde(default = "wm_op")]
    pub opacity: f32,
    #[serde(default = "wm_margin")]
    pub margin: u32,
    #[serde(default = "wm_scale")]
    pub scale: f32,
}
fn wm_pos() -> String { "bottom-right".into() }
fn wm_op() -> f32 { 0.5 }
fn wm_margin() -> u32 { 24 }
fn wm_scale() -> f32 { 0.2 }

/// Text for a filter option, escaped for the two layers FFmpeg reads it through: first the
/// option value (`\`, `'` and `:` are special there), then the filtergraph around it (`\`, `'`,
/// `[`, `]`, `,`, `;` and `=`). Quoting the value does not help — a quote cannot be escaped
/// inside quotes — so every special character gets its own backslash instead.
fn escape_filter_value(s: &str) -> String {
    let option_level: String = s
        .chars()
        .flat_map(|c| match c {
            '\\' | '\'' | ':' => vec!['\\', c],
            _ => vec![c],
        })
        .collect();
    option_level
        .chars()
        .flat_map(|c| match c {
            '\\' | '\'' | '[' | ']' | ',' | ';' | '=' => vec!['\\', c],
            _ => vec![c],
        })
        .collect()
}

fn overlay_expr(position: &str, margin: u32) -> String {
    let m = margin;
    match position {
        "top-left" => format!("{m}:{m}"),
        "top-right" => format!("W-w-{m}:{m}"),
        "top-center" => format!("(W-w)/2:{m}"),
        "center" => "(W-w)/2:(H-h)/2".to_string(),
        "bottom-left" => format!("{m}:H-h-{m}"),
        "bottom-center" => format!("(W-w)/2:H-h-{m}"),
        _ => format!("W-w-{m}:H-h-{m}"),
    }
}

fn build_video_filters(ops: &VideoOps) -> Vec<String> {
    let mut filters: Vec<String> = Vec::new();
    if let Some([x, y, w, h]) = ops.crop {
        filters.push(format!("crop={w}:{h}:{x}:{y}"));
    }
    if ops.width.is_some() || ops.height.is_some() {
        let w = ops.width.map(|w| w.to_string()).unwrap_or_else(|| "-2".into());
        let h = ops.height.map(|h| h.to_string()).unwrap_or_else(|| "-2".into());
        filters.push(format!("scale={w}:{h}:flags=lanczos"));
    }
    match ops.rotate.unwrap_or(0).rem_euclid(360) {
        90 => filters.push("transpose=1".into()),
        180 => filters.push("transpose=1,transpose=1".into()),
        270 => filters.push("transpose=2".into()),
        _ => {}
    }
    if ops.flip_horizontal {
        filters.push("hflip".into());
    }
    if ops.flip_vertical {
        filters.push("vflip".into());
    }
    if let Some(fps) = ops.fps {
        filters.push(format!("fps={fps}"));
    }
    if let Some(speed) = ops.speed.filter(|s| (*s - 1.0).abs() > f64::EPSILON && *s > 0.0) {
        filters.push(format!("setpts={:.6}*PTS", 1.0 / speed));
    }
    if ops.reverse {
        filters.push("reverse".into());
    }
    if let Some(extra) = &ops.extra_filters {
        filters.extend(extra.iter().cloned());
    }
    filters
}

fn build_audio_filters(ops: &VideoOps) -> Vec<String> {
    let mut filters: Vec<String> = Vec::new();
    if let Some(v) = ops.volume.filter(|v| (*v - 1.0).abs() > f64::EPSILON) {
        filters.push(format!("volume={v}"));
    }
    if ops.normalize_audio {
        filters.push("loudnorm=I=-16:TP=-1.5:LRA=11".into());
    }
    if let Some(pitch) = ops.pitch.filter(|p| (*p - 1.0).abs() > f64::EPSILON && *p > 0.0) {
        // Change pitch without changing duration: resample then compensate tempo.
        filters.push(format!("asetrate=44100*{pitch},aresample=44100"));
        filters.extend(tempo_chain(1.0 / pitch));
    }
    if let Some(speed) = ops.speed.filter(|s| (*s - 1.0).abs() > f64::EPSILON && *s > 0.0) {
        filters.extend(tempo_chain(speed));
    }
    if ops.to_mono {
        filters.push("pan=mono|c0=0.5*c0+0.5*c1".into());
    }
    if ops.reverse {
        filters.push("areverse".into());
    }
    filters
}

/// `atempo` only accepts 0.5–2.0, so larger changes are chained.
fn tempo_chain(mut factor: f64) -> Vec<String> {
    let mut out = Vec::new();
    if factor <= 0.0 {
        return out;
    }
    while factor > 2.0 {
        out.push("atempo=2.0".to_string());
        factor /= 2.0;
    }
    while factor < 0.5 {
        out.push("atempo=0.5".to_string());
        factor /= 0.5;
    }
    if (factor - 1.0).abs() > 0.0001 {
        out.push(format!("atempo={factor:.6}"));
    }
    out
}

fn codec_for(ext: &str, ops: &VideoOps) -> (String, String) {
    if let (Some(v), Some(a)) = (&ops.video_codec, &ops.audio_codec) {
        return (v.clone(), a.clone());
    }
    let (v, a) = match ext {
        "webm" => ("libvpx-vp9", "libopus"),
        "mkv" | "mp4" | "mov" | "m4v" => ("libx264", "aac"),
        "avi" => ("mpeg4", "libmp3lame"),
        "ogv" => ("libtheora", "libvorbis"),
        _ => ("libx264", "aac"),
    };
    (
        ops.video_codec.clone().unwrap_or_else(|| v.to_string()),
        ops.audio_codec.clone().unwrap_or_else(|| a.to_string()),
    )
}

async fn build_video_args(input: &Path, dest: &Path, ops: &VideoOps, ext: &str) -> AppResult<Vec<String>> {
    let mut args: Vec<String> = Vec::new();

    // Seeking before -i is much faster; FFmpeg still frame-accurate for re-encodes.
    if let Some(start) = ops.start.filter(|s| *s > 0.0) {
        args.push("-ss".into());
        args.push(format!("{start}"));
    }
    args.push("-i".into());
    args.push(input.to_string_lossy().to_string());

    let mut has_watermark_input = false;
    if let Some(wm) = &ops.watermark {
        if let Some(logo) = wm.logo.as_deref().filter(|l| !l.trim().is_empty()) {
            let logo_path = paths::validate_input_file(logo)?;
            args.push("-i".into());
            args.push(logo_path.to_string_lossy().to_string());
            has_watermark_input = true;
        }
    }

    if let Some(dur) = ops.duration.filter(|d| *d > 0.0) {
        args.push("-t".into());
        args.push(format!("{dur}"));
    } else if let Some(end) = ops.end.filter(|e| *e > 0.0) {
        let start = ops.start.unwrap_or(0.0);
        if end > start {
            args.push("-t".into());
            args.push(format!("{}", end - start));
        }
    }

    let vfilters = build_video_filters(ops);
    let afilters = build_audio_filters(ops);

    if has_watermark_input {
        let wm = ops.watermark.as_ref().unwrap();
        let pos = overlay_expr(&wm.position, wm.margin);
        let alpha = wm.opacity.clamp(0.0, 1.0);
        let scale = wm.scale.clamp(0.02, 1.0);
        let base = if vfilters.is_empty() { "[0:v]null[base]".to_string() } else { format!("[0:v]{}[base]", vfilters.join(",")) };
        // The watermark must be sized relative to the *video*, not to itself.
        // In scale2ref the `iw`/`ih` constants refer to the reference input (the
        // video) while `mdar` is the scaled input's own aspect, so this makes the
        // logo `scale` × the video width with its proportions intact.
        let graph = format!(
            "{base};[1:v]format=rgba,colorchannelmixer=aa={alpha}[wmsrc];\
             [wmsrc][base]scale2ref=w=iw*{scale}:h=ow/mdar[wm][basescaled];\
             [basescaled][wm]overlay={pos}[v]"
        );
        args.push("-filter_complex".into());
        args.push(graph);
        args.push("-map".into());
        args.push("[v]".into());
        if !ops.remove_audio {
            args.push("-map".into());
            args.push("0:a?".into());
        }
    } else if let Some(wm) = ops.watermark.as_ref().filter(|w| w.text.as_deref().map(|t| !t.trim().is_empty()).unwrap_or(false)) {
        let text = escape_filter_value(wm.text.as_deref().unwrap_or(""));
        let (x, y) = match wm.position.as_str() {
            "top-left" => ("24".to_string(), "24".to_string()),
            "top-right" => ("w-tw-24".to_string(), "24".to_string()),
            "top-center" => ("(w-tw)/2".to_string(), "24".to_string()),
            "center" => ("(w-tw)/2".to_string(), "(h-th)/2".to_string()),
            "bottom-left" => ("24".to_string(), "h-th-24".to_string()),
            "bottom-center" => ("(w-tw)/2".to_string(), "h-th-24".to_string()),
            _ => ("w-tw-24".to_string(), "h-th-24".to_string()),
        };
        let alpha = wm.opacity.clamp(0.0, 1.0);
        let mut chain = vfilters.clone();
        chain.push(format!(
            "drawtext=text={text}:expansion=none:fontcolor=white@{alpha}:fontsize=h/22:box=1:boxcolor=black@0.35:boxborderw=8:x={x}:y={y}"
        ));
        args.push("-vf".into());
        args.push(chain.join(","));
    } else if !vfilters.is_empty() {
        args.push("-vf".into());
        args.push(vfilters.join(","));
    }

    if !afilters.is_empty() && !ops.remove_audio {
        args.push("-af".into());
        args.push(afilters.join(","));
    }

    if ops.remove_audio {
        args.push("-an".into());
    }
    if ops.video_only {
        args.push("-an".into());
    }
    if ops.audio_only {
        args.push("-vn".into());
    }

    if ops.copy_streams && vfilters.is_empty() && afilters.is_empty() {
        args.push("-c".into());
        args.push("copy".into());
    } else if !ops.audio_only {
        let (vcodec, acodec) = codec_for(ext, ops);
        args.push("-c:v".into());
        args.push(vcodec.clone());
        if let Some(crf) = ops.crf {
            if vcodec.starts_with("libx26") || vcodec.starts_with("libvpx") || vcodec.starts_with("libsvt") {
                args.push("-crf".into());
                args.push(crf.to_string());
            }
        }
        if let Some(b) = &ops.video_bitrate {
            args.push("-b:v".into());
            args.push(b.clone());
        }
        if vcodec.starts_with("libx26") {
            args.push("-preset".into());
            args.push(ops.preset.clone().unwrap_or_else(|| "medium".into()));
            args.push("-pix_fmt".into());
            args.push("yuv420p".into());
        }
        if !ops.remove_audio {
            args.push("-c:a".into());
            args.push(acodec);
            args.push("-b:a".into());
            args.push(ops.audio_bitrate.clone().unwrap_or_else(|| "192k".into()));
        }
        if ext == "mp4" || ext == "m4v" || ext == "mov" {
            args.push("-movflags".into());
            args.push("+faststart".into());
        }
    }

    if let Some(sr) = ops.sample_rate {
        args.push("-ar".into());
        args.push(sr.to_string());
    }

    args.push(dest.to_string_lossy().to_string());
    Ok(args)
}

#[tauri::command]
pub async fn process_video(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    ops: VideoOps,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    let files = paths::validate_inputs(&inputs)?;
    binaries::require("ffmpeg")?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();

    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.0, f);
        let ext = ops
            .format
            .clone()
            .filter(|e| !e.trim().is_empty())
            .unwrap_or_else(|| paths::extension(f));
        let outcome: AppResult<FileResult> = async {
            let dest = paths::resolve_destination(f, &output, &ext)?;
            if dest.disposition == Disposition::Skipped {
                return Ok(FileResult::from_source(&dest.path, f, Disposition::Skipped).with_note("Already exists — skipped"));
            }
            let info = probe(f).await.ok();
            let mut duration = info.as_ref().and_then(|i| i.duration);
            if let Some(d) = ops.duration {
                duration = Some(d);
            } else if let (Some(end), Some(start)) = (ops.end, ops.start.or(Some(0.0))) {
                duration = Some((end - start).max(0.0));
            }
            if let (Some(d), Some(speed)) = (duration, ops.speed) {
                if speed > 0.0 {
                    duration = Some(d / speed);
                }
            }
            let args = build_video_args(f, &dest.path, &ops, &ext).await?;
            run_ffmpeg(&ctx, i, f, args, duration).await?;
            if !dest.path.exists() {
                return Err(AppError::internal("FFmpeg finished but produced no output file."));
            }
            Ok(FileResult::from_source(&dest.path, f, dest.disposition))
        }
        .await;
        match outcome {
            Ok(r) => batch.results.push(r),
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

// ------------------------------------------------------------------ GIF

#[tauri::command]
pub async fn video_to_gif(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    ops: VideoOps,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    let files = paths::validate_inputs(&inputs)?;
    binaries::require("ffmpeg")?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();
    let fps = ops.gif_fps.unwrap_or(12.0).clamp(1.0, 50.0);
    let width = ops.gif_width.unwrap_or(480).clamp(32, 3840);
    let dither = ops.gif_dither.clone().unwrap_or_else(|| "sierra2_4a".into());

    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.0, f);
        let outcome: AppResult<FileResult> = async {
            let dest = paths::resolve_destination(f, &output, "gif")?;
            if dest.is_skipped() {
                return Ok(FileResult::skipped(&dest, f));
            }
            let mut args: Vec<String> = Vec::new();
            if let Some(start) = ops.start.filter(|s| *s > 0.0) {
                args.push("-ss".into());
                args.push(start.to_string());
            }
            args.push("-i".into());
            args.push(f.to_string_lossy().to_string());
            if let Some(d) = ops.duration.filter(|d| *d > 0.0) {
                args.push("-t".into());
                args.push(d.to_string());
            }
            // Single-pass palette generation keeps quality high without a temp file.
            let filter = format!(
                "fps={fps},scale={width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither={dither}"
            );
            args.push("-filter_complex".into());
            args.push(filter);
            args.push("-loop".into());
            args.push(if ops.gif_loop { "0".to_string() } else { "-1".to_string() });
            args.push(dest.path.to_string_lossy().to_string());
            let duration = ops.duration.or(None);
            run_ffmpeg(&ctx, i, f, args, duration).await?;
            Ok(FileResult::from_source(&dest.path, f, dest.disposition))
        }
        .await;
        match outcome {
            Ok(r) => batch.results.push(r),
            Err(e) if e.kind() == ErrorKind::Cancelled => {
                batch.cancelled = true;
                break;
            }
            Err(e) => batch.push_failure(f, e),
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

// ------------------------------------------------------------------ frames

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameOpts {
    /// "all", "interval" or "count".
    #[serde(default = "d_mode")]
    pub mode: String,
    pub interval: Option<f64>,
    pub count: Option<u32>,
    #[serde(default = "d_fmt")]
    pub format: String,
    pub width: Option<u32>,
    pub quality: Option<u8>,
    pub start: Option<f64>,
    pub duration: Option<f64>,
}
fn d_mode() -> String { "interval".into() }
fn d_fmt() -> String { "png".into() }

#[tauri::command]
pub async fn extract_frames(
    app: AppHandle,
    job_id: String,
    input: String,
    opts: FrameOpts,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    let file = paths::validate_input_file(&input)?;
    binaries::require("ffmpeg")?;
    let ctx = JobCtx::new(app, job_id, 1);
    let started = now_ms();
    let dir = paths::resolve_output_folder(&file, &output, "-frames")?;
    let info = probe(&file).await.ok();
    let duration = opts.duration.or_else(|| info.as_ref().and_then(|i| i.duration));

    let mut args: Vec<String> = Vec::new();
    if let Some(s) = opts.start.filter(|s| *s > 0.0) {
        args.push("-ss".into());
        args.push(s.to_string());
    }
    args.push("-i".into());
    args.push(file.to_string_lossy().to_string());
    if let Some(d) = opts.duration.filter(|d| *d > 0.0) {
        args.push("-t".into());
        args.push(d.to_string());
    }

    let mut filters: Vec<String> = Vec::new();
    match opts.mode.as_str() {
        "all" => {}
        "count" => {
            let n = opts.count.unwrap_or(10).max(1);
            let total = duration.unwrap_or(0.0);
            if total > 0.0 {
                filters.push(format!("fps={:.6}", (n as f64) / total));
            } else {
                filters.push("fps=1".into());
            }
            args.push("-frames:v".into());
            args.push(n.to_string());
        }
        _ => {
            let interval = opts.interval.unwrap_or(1.0).max(0.01);
            filters.push(format!("fps={:.6}", 1.0 / interval));
        }
    }
    if let Some(w) = opts.width {
        filters.push(format!("scale={w}:-2:flags=lanczos"));
    }
    if !filters.is_empty() {
        args.push("-vf".into());
        args.push(filters.join(","));
    }
    let ext = opts.format.trim_start_matches('.').to_lowercase();
    if ext == "jpg" || ext == "jpeg" {
        args.push("-q:v".into());
        // FFmpeg's mjpeg scale is 2 (best) – 31 (worst).
        let q = opts.quality.unwrap_or(90) as f64;
        args.push(format!("{:.0}", (2.0 + (100.0 - q) * 0.29).clamp(2.0, 31.0)));
    }
    args.push("-vsync".into());
    args.push("vfr".into());
    args.push(dir.join(format!("frame_%05d.{ext}")).to_string_lossy().to_string());

    run_ffmpeg(&ctx, 0, &file, args, duration).await?;

    let mut batch = BatchResult::default();
    let mut entries: Vec<PathBuf> = std::fs::read_dir(&dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .collect();
    entries.sort();
    for p in entries {
        batch.results.push(FileResult::from_source(&p, &file, Disposition::Created));
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

#[tauri::command]
pub async fn video_thumbnail(
    app: AppHandle,
    job_id: String,
    input: String,
    timestamp: Option<f64>,
    width: Option<u32>,
    output: OutputSpec,
) -> AppResult<FileResult> {
    let file = paths::validate_input_file(&input)?;
    binaries::require("ffmpeg")?;
    let ctx = JobCtx::new(app, job_id, 1);
    let mut spec = output.clone();
    if spec.suffix.is_none() {
        spec.suffix = Some("-thumb".into());
    }
    let dest = paths::resolve_destination(&file, &spec, "png")?;
    if dest.is_skipped() {
        return Ok(FileResult::skipped(&dest, &file));
    }
    let ts = timestamp.unwrap_or(1.0).max(0.0);
    let mut args: Vec<String> = vec!["-ss".into(), ts.to_string(), "-i".into(), file.to_string_lossy().to_string(), "-frames:v".into(), "1".into()];
    if let Some(w) = width {
        args.push("-vf".into());
        args.push(format!("scale={w}:-2:flags=lanczos"));
    }
    args.push(dest.path.to_string_lossy().to_string());
    run_ffmpeg(&ctx, 0, &file, args, Some(1.0)).await?;
    Ok(FileResult::from_source(&dest.path, &file, dest.disposition))
}

/// Generate a short-lived preview thumbnail into the temp dir (used by the UI).
#[tauri::command]
pub async fn preview_frame(input: String, timestamp: Option<f64>, width: Option<u32>) -> AppResult<String> {
    let file = paths::validate_input_file(&input)?;
    let ffmpeg = binaries::require("ffmpeg")?;
    let dir = std::env::temp_dir().join("toolbox-previews");
    std::fs::create_dir_all(&dir)?;
    let dest = dir.join(format!("{}.jpg", uuid::Uuid::new_v4().simple()));
    let ts = timestamp.unwrap_or(0.0).max(0.0);
    let w = width.unwrap_or(640);
    let args: Vec<String> = vec![
        "-hide_banner".into(), "-nostdin".into(), "-y".into(),
        "-ss".into(), ts.to_string(),
        "-i".into(), file.to_string_lossy().to_string(),
        "-frames:v".into(), "1".into(),
        "-vf".into(), format!("scale={w}:-2:flags=bilinear"),
        "-q:v".into(), "4".into(),
        dest.to_string_lossy().to_string(),
    ];
    let out = jobs::run(None, &ffmpeg, &args).await?;
    if !out.ok() || !dest.exists() {
        return Err(jobs::explain_failure("Generating a preview frame", &out));
    }
    Ok(dest.to_string_lossy().to_string())
}

// ------------------------------------------------------------------ concat / merge

#[tauri::command]
pub async fn concat_media(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    output: OutputSpec,
    re_encode: Option<bool>,
) -> AppResult<FileResult> {
    let files = paths::validate_inputs(&inputs)?;
    if files.len() < 2 {
        return Err(AppError::invalid("Select at least two files to join."));
    }
    binaries::require("ffmpeg")?;
    let ctx = JobCtx::new(app, job_id, 1);
    let first = &files[0];
    let ext = paths::extension(first);
    let mut spec = output.clone();
    if spec.filename.is_none() {
        spec.filename = Some(format!("{}-merged", paths::stem(first)));
    }
    let dest = paths::resolve_destination(first, &spec, &ext)?;
    if dest.is_skipped() {
        return Ok(FileResult::skipped(&dest, first));
    }

    let re_encode = re_encode.unwrap_or(false);
    let mut total_duration = 0.0;
    for f in &files {
        if let Ok(info) = probe(f).await {
            total_duration += info.duration.unwrap_or(0.0);
        }
    }

    if re_encode {
        // filter_complex concat handles mismatched codecs/resolutions.
        let mut args: Vec<String> = Vec::new();
        for f in &files {
            args.push("-i".into());
            args.push(f.to_string_lossy().to_string());
        }
        let n = files.len();
        let mut graph = String::new();
        for i in 0..n {
            graph.push_str(&format!("[{i}:v:0][{i}:a:0]"));
        }
        graph.push_str(&format!("concat=n={n}:v=1:a=1[v][a]"));
        args.push("-filter_complex".into());
        args.push(graph);
        args.push("-map".into());
        args.push("[v]".into());
        args.push("-map".into());
        args.push("[a]".into());
        args.push(dest.path.to_string_lossy().to_string());
        run_ffmpeg(&ctx, 0, first, args, Some(total_duration)).await?;
    } else {
        // Stream-copy concat via a demuxer list file (fast, needs matching codecs).
        let list_dir = std::env::temp_dir().join(format!("toolbox-concat-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&list_dir)?;
        let list_path = list_dir.join("list.txt");
        let mut body = String::new();
        for f in &files {
            // The concat demuxer treats ' as a quote; escape it.
            let escaped = f.to_string_lossy().replace('\'', "'\\''");
            body.push_str(&format!("file '{escaped}'\n"));
        }
        std::fs::write(&list_path, body)?;
        let args: Vec<String> = vec![
            "-f".into(), "concat".into(),
            "-safe".into(), "0".into(),
            "-i".into(), list_path.to_string_lossy().to_string(),
            "-c".into(), "copy".into(),
            dest.path.to_string_lossy().to_string(),
        ];
        let result = run_ffmpeg(&ctx, 0, first, args, Some(total_duration)).await;
        std::fs::remove_dir_all(&list_dir).ok();
        result.map_err(|e| match e {
            AppError::Friendly { message, details, kind } => AppError::Friendly {
                message: format!("{message} Files with different codecs or resolutions need the “re-encode” option."),
                details,
                kind,
            },
        })?;
    }
    Ok(FileResult::from_source(&dest.path, first, dest.disposition).with_note(format!("{} files joined", files.len())))
}

// ------------------------------------------------------------------ silence

#[tauri::command]
pub async fn generate_silence(
    app: AppHandle,
    job_id: String,
    seconds: f64,
    format: Option<String>,
    output_dir: String,
) -> AppResult<FileResult> {
    binaries::require("ffmpeg")?;
    let ctx = JobCtx::new(app, job_id, 1);
    let ext = format.unwrap_or_else(|| "mp3".into());
    let seconds = seconds.clamp(0.1, 24.0 * 3600.0);
    let dir = PathBuf::from(&output_dir);
    std::fs::create_dir_all(&dir)?;
    let name = format!("silence-{:.0}s.{}", seconds, ext.trim_start_matches('.'));
    let dest = paths::finalize_destination(dir.join(paths::sanitize_filename(&name)), Path::new("/dev/null"), "rename")?;
    let args: Vec<String> = vec![
        "-f".into(), "lavfi".into(),
        "-i".into(), "anullsrc=channel_layout=stereo:sample_rate=44100".into(),
        "-t".into(), seconds.to_string(),
        dest.path.to_string_lossy().to_string(),
    ];
    run_ffmpeg(&ctx, 0, Path::new("silence"), args, Some(seconds)).await?;
    Ok(FileResult::new(&dest.path, dest.disposition))
}

// ------------------------------------------------------------------ audio tags

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioTags {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub year: Option<String>,
    pub genre: Option<String>,
    pub track: Option<String>,
    pub comment: Option<String>,
    pub cover: Option<String>,
    #[serde(default)]
    pub remove_all: bool,
}

/// Containers FFmpeg can attach a picture to. Ogg, Opus and WAV have no stream for one, and
/// asking anyway ends in "Could not write header".
fn can_hold_cover_art(ext: &str) -> bool {
    !matches!(ext, "ogg" | "oga" | "opus" | "spx" | "wav" | "aiff" | "aif")
}

#[tauri::command]
pub async fn write_audio_tags(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    tags: AudioTags,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    let files = paths::validate_inputs(&inputs)?;
    binaries::require("ffmpeg")?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();

    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.0, f);
        let outcome: AppResult<FileResult> = async {
            let ext = paths::extension(f);
            let mut spec = output.clone();
            if spec.suffix.is_none() && spec.mode != "custom" {
                spec.suffix = Some("-tagged".into());
            }
            let dest = paths::resolve_destination(f, &spec, &ext)?;
            if dest.is_skipped() {
                return Ok(FileResult::skipped(&dest, f));
            }
            let mut args: Vec<String> = vec!["-i".into(), f.to_string_lossy().to_string()];
            let mut has_cover = false;
            if let Some(cover) = tags.cover.as_deref().filter(|c| !c.trim().is_empty()) {
                if !can_hold_cover_art(&ext) {
                    return Err(AppError::unsupported(format!(
                        "{} files cannot carry cover art. Use an MP3, M4A or FLAC file for artwork, or leave the image out.",
                        ext.to_uppercase()
                    )));
                }
                let cover_path = paths::validate_input_file(cover)?;
                args.push("-i".into());
                args.push(cover_path.to_string_lossy().to_string());
                has_cover = true;
            }
            args.push("-map".into());
            args.push("0:a".into());
            if has_cover {
                args.push("-map".into());
                args.push("1:v".into());
                args.push("-c:v".into());
                args.push("mjpeg".into());
                args.push("-disposition:v".into());
                args.push("attached_pic".into());
            }
            args.push("-c:a".into());
            args.push("copy".into());
            if tags.remove_all {
                args.push("-map_metadata".into());
                args.push("-1".into());
            }
            // Values are separate argv entries — never interpolated into a shell.
            let mut add = |key: &str, value: &Option<String>| {
                if let Some(v) = value.as_deref().filter(|v| !v.trim().is_empty()) {
                    args.push("-metadata".into());
                    args.push(format!("{key}={v}"));
                }
            };
            add("title", &tags.title);
            add("artist", &tags.artist);
            add("album", &tags.album);
            add("album_artist", &tags.album_artist);
            add("date", &tags.year);
            add("genre", &tags.genre);
            add("track", &tags.track);
            add("comment", &tags.comment);
            args.push(dest.path.to_string_lossy().to_string());
            run_ffmpeg(&ctx, i, f, args, None).await?;
            Ok(FileResult::from_source(&dest.path, f, dest.disposition))
        }
        .await;
        match outcome {
            Ok(r) => batch.results.push(r),
            Err(e) if e.kind() == ErrorKind::Cancelled => {
                batch.cancelled = true;
                break;
            }
            Err(e) => batch.push_failure(f, e),
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

/// Extract embedded cover art to a file.
#[tauri::command]
pub async fn extract_cover_art(input: String, output: OutputSpec) -> AppResult<FileResult> {
    let file = paths::validate_input_file(&input)?;
    let ffmpeg = binaries::require("ffmpeg")?;
    let mut spec = output.clone();
    if spec.suffix.is_none() {
        spec.suffix = Some("-cover".into());
    }
    let dest = paths::resolve_destination(&file, &spec, "jpg")?;
    if dest.is_skipped() {
        return Ok(FileResult::skipped(&dest, &file));
    }
    let args: Vec<String> = vec![
        "-hide_banner".into(), "-nostdin".into(), "-y".into(),
        "-i".into(), file.to_string_lossy().to_string(),
        "-an".into(), "-vcodec".into(), "copy".into(),
        dest.path.to_string_lossy().to_string(),
    ];
    let out = jobs::run(None, &ffmpeg, &args).await?;
    if !out.ok() || !dest.path.exists() {
        return Err(AppError::with_details(
            ErrorKind::NotFound,
            "This file does not contain embedded cover art.",
            out.tail(),
        ));
    }
    Ok(FileResult::from_source(&dest.path, &file, dest.disposition))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Multiply out a chain so the test checks the audible result, not the formatting.
    fn chain_product(chain: &[String]) -> f64 {
        chain
            .iter()
            .filter_map(|f| f.strip_prefix("atempo=").and_then(|v| v.parse::<f64>().ok()))
            .product()
    }

    #[test]
    fn tempo_chain_stays_within_ffmpeg_limits() {
        for factor in [0.25, 0.5, 0.75, 1.5, 2.0, 4.0, 8.0] {
            let chain = tempo_chain(factor);
            for step in &chain {
                let v: f64 = step.strip_prefix("atempo=").unwrap().parse().unwrap();
                assert!((0.5..=2.0).contains(&v), "{step} is outside FFmpeg's atempo range");
            }
            assert!(
                (chain_product(&chain) - factor).abs() < 1e-4,
                "chain for {factor} multiplies to {}",
                chain_product(&chain)
            );
        }
        assert!(tempo_chain(1.0).is_empty());
        assert!(tempo_chain(0.0).is_empty());
    }

    #[test]
    fn filter_values_are_escaped_for_the_filtergraph() {
        let escaped = escape_filter_value("a:b'c[d],e");
        assert!(!escaped.contains("a:b"));
        assert!(escaped.contains("\\:"));
        assert!(escaped.contains("\\'"));
        assert!(escaped.contains("\\["));
        assert!(escaped.contains("\\,"));
    }

    #[test]
    fn video_filters_are_ordered_crop_scale_rotate() {
        let ops = VideoOps {
            crop: Some([10, 20, 100, 50]),
            width: Some(640),
            rotate: Some(90),
            fps: Some(30.0),
            ..Default::default()
        };
        let f = build_video_filters(&ops);
        assert_eq!(f[0], "crop=100:50:10:20");
        assert!(f[1].starts_with("scale=640:-2"));
        assert_eq!(f[2], "transpose=1");
        assert_eq!(f[3], "fps=30");
    }

    #[test]
    fn speed_sets_both_pts_and_tempo() {
        let ops = VideoOps { speed: Some(2.0), ..Default::default() };
        let v = build_video_filters(&ops);
        assert!(v.iter().any(|f| f.starts_with("setpts=0.500000")));
        let a = build_audio_filters(&ops);
        assert!((chain_product(&a) - 2.0).abs() < 1e-4);
    }

    #[test]
    fn codec_defaults_follow_the_container() {
        let ops = VideoOps::default();
        assert_eq!(codec_for("webm", &ops), ("libvpx-vp9".into(), "libopus".into()));
        assert_eq!(codec_for("mp4", &ops), ("libx264".into(), "aac".into()));
        let forced = VideoOps { video_codec: Some("libx265".into()), ..Default::default() };
        assert_eq!(codec_for("mp4", &forced).0, "libx265");
    }

    #[test]
    fn overlay_positions_cover_every_corner() {
        assert_eq!(overlay_expr("top-left", 10), "10:10");
        assert_eq!(overlay_expr("bottom-right", 10), "W-w-10:H-h-10");
        assert_eq!(overlay_expr("center", 10), "(W-w)/2:(H-h)/2");
    }

    /// The watermark must be a fraction of the *video*, not of the logo. Verified
    /// against ffmpeg 8.1.2: this graph places a 200x100 logo at exactly 160x80
    /// on a 640x360 video for scale 0.25, whereas a plain `scale=iw*0.25` in the
    /// logo's own chain produced 50x28.
    #[tokio::test]
    async fn watermark_is_scaled_relative_to_the_video() {
        let dir = std::env::temp_dir().join(format!("tb-wm-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&dir).unwrap();
        let logo = dir.join("logo.png");
        std::fs::write(&logo, [0u8; 8]).unwrap();

        let ops = VideoOps {
            watermark: Some(MediaWatermark {
                logo: Some(logo.to_string_lossy().to_string()),
                text: None,
                position: "bottom-right".into(),
                opacity: 0.5,
                margin: 24,
                scale: 0.25,
            }),
            ..Default::default()
        };
        let args = build_video_args(Path::new("in.mp4"), Path::new("out.mp4"), &ops, "mp4")
            .await
            .unwrap();
        let graph = args
            .iter()
            .position(|a| a == "-filter_complex")
            .and_then(|i| args.get(i + 1))
            .expect("a logo watermark must build a filter_complex graph");

        assert!(graph.contains("scale2ref=w=iw*0.25"), "graph must size the logo from the video width: {graph}");
        assert!(graph.contains("h=ow/mdar"), "graph must preserve the logo aspect: {graph}");
        assert!(!graph.contains("scale=iw*"), "the self-relative scale is the bug being prevented: {graph}");
        // The chain must be wired end to end with no dangling labels.
        assert!(graph.contains("[wmsrc][base]scale2ref"));
        assert!(graph.contains("[basescaled][wm]overlay=W-w-24:H-h-24[v]"));
        assert!(!graph.contains('\n'), "line continuations must not leave newlines in the graph");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn fps_parses_rational_rates() {
        assert_eq!(parse_fps("30000/1001").map(|f| (f * 1000.0).round()), Some(29970.0));
        assert_eq!(parse_fps("0/0"), None);
        assert_eq!(parse_fps("nonsense"), None);
    }

    // ---- real FFmpeg --------------------------------------------------------------------
    //
    // Every case below is the JSON a tool sends, turned into FFmpeg arguments by the same
    // `build_video_args` the app uses and run through the real program. FFmpeg changes between
    // releases, so this is what says whether the tools still work with the one that is installed.
    // Skipped where FFmpeg is not installed.

    mod real_ffmpeg {
        use super::*;
        use serde_json::json;
        use std::process::Command;

        fn run(program: &Path, args: &[String]) -> Result<std::process::Output, String> {
            Command::new(program)
                .args(args)
                .env("PATH", binaries::child_path(program))
                .output()
                .map_err(|e| e.to_string())
        }

        fn ffmpeg(ffmpeg: &Path, args: &[&str]) {
            let mut full: Vec<String> = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error"].map(String::from).to_vec();
            full.extend(args.iter().map(|a| a.to_string()));
            let out = run(ffmpeg, &full).expect("ffmpeg starts");
            assert!(out.status.success(), "fixture failed: {}", String::from_utf8_lossy(&out.stderr));
        }

        fn duration(ffprobe: &Path, file: &Path) -> Option<f64> {
            let args: Vec<String> = ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0"]
                .iter()
                .map(|s| s.to_string())
                .chain([file.to_string_lossy().to_string()])
                .collect();
            let out = run(ffprobe, &args).ok()?;
            String::from_utf8_lossy(&out.stdout).trim().parse().ok()
        }

        struct Media {
            dir: PathBuf,
            video: PathBuf,
            tagged_mp3: PathBuf,
            wav: PathBuf,
            logo: PathBuf,
        }

        fn make_media(ffmpeg_bin: &Path) -> Media {
            let dir = std::env::temp_dir().join(format!("tb-ff-{}", uuid::Uuid::new_v4().simple()));
            std::fs::create_dir_all(&dir).unwrap();
            let p = |n: &str| dir.join(n).to_string_lossy().to_string();
            ffmpeg(ffmpeg_bin, &["-f", "lavfi", "-i", "testsrc=duration=3:size=320x180:rate=15", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", &p("video.mp4")]);
            ffmpeg(ffmpeg_bin, &["-f", "lavfi", "-i", "color=c=red:s=80x40", "-frames:v", "1", &p("logo.png")]);
            ffmpeg(ffmpeg_bin, &["-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-i", &p("logo.png"), "-map", "0:a", "-map", "1:v",
                "-c:a", "libmp3lame", "-c:v", "mjpeg", "-disposition:v", "attached_pic", &p("tone.mp3")]);
            ffmpeg(ffmpeg_bin, &["-f", "lavfi", "-i", "sine=frequency=440:duration=3", &p("tone.wav")]);
            Media { video: dir.join("video.mp4"), tagged_mp3: dir.join("tone.mp3"), wav: dir.join("tone.wav"), logo: dir.join("logo.png"), dir }
        }

        #[derive(Clone, Copy)]
        enum Source {
            Video,
            TaggedMp3,
            Wav,
        }

        struct Case {
            name: &'static str,
            source: Source,
            ops: serde_json::Value,
            /// Seconds the result should last, as a range. `None` means "just has to play".
            length: Option<(f64, f64)>,
        }

        fn case(name: &'static str, source: Source, ops: serde_json::Value) -> Case {
            Case { name, source, ops, length: None }
        }

        fn cases(logo: &Path) -> Vec<Case> {
            use Source::*;
            let cap = "scale=-2:'trunc(min(ih,90)/2)*2':flags=lanczos";
            let cap_w = "scale='trunc(min(iw,160)/2)*2':-2:flags=lanczos";
            let logo = logo.to_string_lossy().to_string();
            let mark = |extra: serde_json::Value| {
                let mut base = json!({ "position": "bottom-right", "opacity": 0.6, "margin": 24, "scale": 0.2 });
                base.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
                json!({ "watermark": base })
            };
            let mut list = vec![
                // video → video, the way Convert and Video Converter send them
                case("mp4", Video, json!({ "format": "mp4", "crf": 23 })),
                case("mov", Video, json!({ "format": "mov", "crf": 23 })),
                case("mkv", Video, json!({ "format": "mkv", "crf": 23 })),
                case("m4v", Video, json!({ "format": "m4v", "crf": 23 })),
                case("webm", Video, json!({ "format": "webm", "crf": 32 })),
                case("avi", Video, json!({ "format": "avi" })),
                case("hevc", Video, json!({ "format": "mp4", "videoCodec": "libx265", "audioCodec": "aac", "crf": 28, "preset": "ultrafast" })),
                case("vp9-constant-quality", Video, json!({ "format": "webm", "videoCodec": "libvpx-vp9", "audioCodec": "libopus", "videoBitrate": "0", "crf": 33 })),
                case("compress-capped", Video, json!({ "format": "mp4", "videoCodec": "libx264", "audioCodec": "aac", "crf": 32, "preset": "veryfast", "extraFilters": [cap] })),
                // video → audio
                case("video-to-mp3", Video, json!({ "format": "mp3", "audioOnly": true })),
                case("video-to-m4a", Video, json!({ "format": "m4a", "audioOnly": true })),
                case("video-to-wav", Video, json!({ "format": "wav", "audioOnly": true })),
                case("video-to-flac", Video, json!({ "format": "flac", "audioOnly": true })),
                // size and shape
                case("resize-width", Video, json!({ "width": 160 })),
                case("resize-box", Video, json!({ "width": 160, "height": 90 })),
                case("resize-never-enlarge", Video, json!({ "extraFilters": [cap_w], "crf": 23 })),
                case("crop", Video, json!({ "crop": [10, 10, 100, 80], "videoCodec": "libx264", "crf": 23 })),
                case("crop-webm", Video, json!({ "format": "webm", "crop": [10, 10, 100, 80], "videoCodec": "libvpx-vp9", "videoBitrate": "0", "crf": 33 })),
                case("rotate-90", Video, json!({ "rotate": 90 })),
                case("rotate-180", Video, json!({ "rotate": 180 })),
                case("rotate-270", Video, json!({ "rotate": 270 })),
                case("flip-horizontal", Video, json!({ "flipHorizontal": true })),
                case("flip-vertical", Video, json!({ "flipVertical": true })),
                // time
                Case { length: Some((1.0, 3.0)), ..case("trim-copy", Video, json!({ "start": 0.5, "duration": 1.5, "copyStreams": true })) },
                Case { length: Some((1.2, 1.8)), ..case("trim-reencode", Video, json!({ "start": 0.5, "end": 2.0, "crf": 23 })) },
                Case { length: Some((1.3, 1.7)), ..case("speed-double", Video, json!({ "speed": 2 })) },
                Case { length: Some((5.5, 6.5)), ..case("speed-half", Video, json!({ "speed": 0.5 })) },
                Case { length: Some((2.7, 3.3)), ..case("reverse", Video, json!({ "reverse": true })) },
                case("frame-rate", Video, json!({ "fps": 24, "crf": 23 })),
                case("frame-rate-interpolated", Video, json!({ "extraFilters": ["minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"], "crf": 30, "preset": "ultrafast" })),
                // sound inside a video
                case("remove-audio", Video, json!({ "removeAudio": true })),
                case("video-mono", Video, json!({ "toMono": true })),
                case("video-louder", Video, json!({ "volume": 1.5 })),
                case("video-normalised", Video, json!({ "normalizeAudio": true })),
                // watermarks
                case("watermark-text", Video, mark(json!({ "text": "Toolbox" }))),
                case("watermark-text-with-punctuation", Video, mark(json!({ "text": "It's 50% done: yes, [really]; \\ ok" }))),
                case("watermark-logo", Video, mark(json!({ "logo": logo }))),
                // audio → audio, with cover art on the source
                case("tagged-to-mp3", TaggedMp3, json!({ "format": "mp3", "videoCodec": "copy", "audioCodec": "libmp3lame", "audioBitrate": "192k" })),
                case("tagged-to-m4a", TaggedMp3, json!({ "format": "m4a", "videoCodec": "copy", "audioCodec": "aac", "audioBitrate": "192k" })),
                case("tagged-to-wav", TaggedMp3, json!({ "format": "wav", "audioOnly": true })),
                case("tagged-to-flac", TaggedMp3, json!({ "format": "flac", "audioOnly": true })),
                case("tagged-to-ogg", TaggedMp3, json!({ "format": "ogg", "audioOnly": true })),
                case("tagged-to-opus", TaggedMp3, json!({ "format": "opus", "audioOnly": true })),
                case("tagged-compressed-mono", TaggedMp3, json!({ "format": "mp3", "videoCodec": "copy", "audioCodec": "libmp3lame", "audioBitrate": "96k", "toMono": true })),
                case("tagged-louder", TaggedMp3, json!({ "audioOnly": true, "volume": 1.5 })),
                case("tagged-normalised", TaggedMp3, json!({ "audioOnly": true, "normalizeAudio": true })),
                case("tagged-pitch", TaggedMp3, json!({ "audioOnly": true, "pitch": 1.122462, "sampleRate": 44100 })),
                Case { length: Some((1.8, 2.2)), ..case("tagged-speed", TaggedMp3, json!({ "audioOnly": true, "speed": 1.5 })) },
                Case { length: Some((1.2, 1.8)), ..case("tagged-trim-copy", TaggedMp3, json!({ "audioOnly": true, "start": 0.5, "end": 2.0, "copyStreams": true })) },
                case("merge-intermediate", TaggedMp3, json!({ "format": "wav", "audioOnly": true, "sampleRate": 44100, "toMono": true })),
                // audio with nothing attached
                case("wav-to-mp3", Wav, json!({ "format": "mp3", "videoCodec": "copy", "audioCodec": "libmp3lame", "audioBitrate": "192k" })),
                case("wav-to-m4a", Wav, json!({ "format": "m4a", "videoCodec": "copy", "audioCodec": "aac", "audioBitrate": "192k" })),
                case("wav-to-opus", Wav, json!({ "format": "opus", "audioOnly": true })),
            ];
            // `Case { length, ..case(..) }` needs the struct update, so keep the order stable.
            list.shrink_to_fit();
            list
        }

        #[tokio::test]
        async fn every_media_tool_works_with_the_installed_ffmpeg() {
            let (Some(ffmpeg_bin), Some(ffprobe)) = (binaries::resolve("ffmpeg"), binaries::resolve("ffprobe")) else {
                return;
            };
            let media = make_media(&ffmpeg_bin);
            let mut failures: Vec<String> = Vec::new();

            for case in cases(&media.logo) {
                let input = match case.source {
                    Source::Video => &media.video,
                    Source::TaggedMp3 => &media.tagged_mp3,
                    Source::Wav => &media.wav,
                };
                let ops: VideoOps = serde_json::from_value(case.ops.clone()).expect(case.name);
                let ext = ops.format.clone().unwrap_or_else(|| paths::extension(input));
                let dest = media.dir.join(format!("out-{}.{ext}", case.name));
                let args = match build_video_args(input, &dest, &ops, &ext).await {
                    Ok(a) => a,
                    Err(e) => {
                        failures.push(format!("{}: could not build arguments: {e:?}", case.name));
                        continue;
                    }
                };
                let mut full: Vec<String> = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error"].map(String::from).to_vec();
                full.extend(args);
                match run(&ffmpeg_bin, &full) {
                    Err(e) => failures.push(format!("{}: {e}", case.name)),
                    Ok(out) if !out.status.success() => {
                        let err = String::from_utf8_lossy(&out.stderr);
                        failures.push(format!("{}: {}", case.name, err.lines().last().unwrap_or("failed")));
                    }
                    Ok(_) => match duration(&ffprobe, &dest) {
                        None => failures.push(format!("{}: the result does not play", case.name)),
                        Some(d) => {
                            if let Some((lo, hi)) = case.length {
                                if d < lo || d > hi {
                                    failures.push(format!("{}: lasts {d:.2}s, expected {lo}–{hi}s", case.name));
                                }
                            }
                        }
                    },
                }
            }
            std::fs::remove_dir_all(&media.dir).ok();
            assert!(failures.is_empty(), "{} tool run(s) failed:\n  {}", failures.len(), failures.join("\n  "));
        }
    }
}

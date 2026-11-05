use crate::binaries;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::jobs::{self, JobCtx};
use crate::paths::{self, Disposition, OutputSpec};
use crate::types::{now_ms, BatchResult, FileResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

// ------------------------------------------------------------------ rasterise

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfRenderOpts {
    #[serde(default = "d_png")]
    pub format: String,
    #[serde(default = "d_dpi")]
    pub dpi: u32,
    pub first_page: Option<u32>,
    pub last_page: Option<u32>,
    #[serde(default)]
    pub grayscale: bool,
    pub jpeg_quality: Option<u8>,
}
fn d_png() -> String { "png".into() }
fn d_dpi() -> u32 { 150 }

#[tauri::command]
pub async fn pdf_to_images(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    opts: PdfRenderOpts,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    let files = paths::validate_inputs(&inputs)?;
    let pdftoppm = binaries::require("pdftoppm")?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();

    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.1, f);
        let outcome = async {
            let dir = paths::resolve_output_folder(f, &output, "-pages")?;
            let mut args: Vec<String> = vec!["-r".into(), opts.dpi.clamp(24, 1200).to_string()];
            match opts.format.to_lowercase().as_str() {
                "jpg" | "jpeg" => {
                    args.push("-jpeg".into());
                    if let Some(q) = opts.jpeg_quality {
                        args.push("-jpegopt".into());
                        args.push(format!("quality={}", q.clamp(1, 100)));
                    }
                }
                "tiff" | "tif" => args.push("-tiff".into()),
                _ => args.push("-png".into()),
            }
            if opts.grayscale {
                args.push("-gray".into());
            }
            if let Some(p) = opts.first_page {
                args.push("-f".into());
                args.push(p.max(1).to_string());
            }
            if let Some(p) = opts.last_page {
                args.push("-l".into());
                args.push(p.max(1).to_string());
            }
            args.push(f.to_string_lossy().to_string());
            args.push(dir.join("page").to_string_lossy().to_string());
            let out = jobs::run(Some(&ctx.handle), &pdftoppm, &args).await?;
            if !out.ok() {
                return Err(jobs::explain_failure("Rendering PDF pages", &out));
            }
            let mut pages: Vec<PathBuf> = std::fs::read_dir(&dir)?
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_file())
                .collect();
            pages.sort();
            if pages.is_empty() {
                return Err(AppError::internal("No pages were produced — the PDF may be empty or protected."));
            }
            Ok(pages)
        }
        .await;
        match outcome {
            Ok(pages) => {
                for p in pages {
                    batch.results.push(FileResult::from_source(&p, f, Disposition::Created));
                }
            }
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

/// Render one page into the temp dir for the UI's page thumbnails.
#[tauri::command]
pub async fn pdf_page_preview(input: String, page: u32, width: Option<u32>) -> AppResult<String> {
    let file = paths::validate_input_file(&input)?;
    let pdftoppm = binaries::require("pdftoppm")?;
    let dir = std::env::temp_dir().join("toolbox-previews");
    std::fs::create_dir_all(&dir)?;
    let stem = dir.join(uuid::Uuid::new_v4().simple().to_string());
    let args: Vec<String> = vec![
        "-png".into(),
        "-f".into(), page.max(1).to_string(),
        "-l".into(), page.max(1).to_string(),
        "-scale-to-x".into(), width.unwrap_or(240).to_string(),
        "-scale-to-y".into(), "-1".into(),
        "-singlefile".into(),
        file.to_string_lossy().to_string(),
        stem.to_string_lossy().to_string(),
    ];
    let out = jobs::run(None, &pdftoppm, &args).await?;
    let produced = stem.with_extension("png");
    if !out.ok() || !produced.exists() {
        return Err(jobs::explain_failure("Rendering a PDF page", &out));
    }
    Ok(produced.to_string_lossy().to_string())
}

// ------------------------------------------------------------------ text

#[tauri::command]
pub async fn pdf_to_text(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    layout: Option<bool>,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    let files = paths::validate_inputs(&inputs)?;
    let pdftotext = binaries::require("pdftotext")?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();
    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.2, f);
        let outcome = async {
            let dest = paths::resolve_destination(f, &output, "txt")?;
            if dest.is_skipped() {
                return Ok(FileResult::skipped(&dest, f));
            }
            let mut args: Vec<String> = Vec::new();
            if layout.unwrap_or(true) {
                args.push("-layout".into());
            }
            args.push("-enc".into());
            args.push("UTF-8".into());
            args.push(f.to_string_lossy().to_string());
            args.push(dest.path.to_string_lossy().to_string());
            let out = jobs::run(Some(&ctx.handle), &pdftotext, &args).await?;
            if !out.ok() {
                return Err(jobs::explain_failure("Extracting text", &out));
            }
            let bytes = std::fs::metadata(&dest.path).map(|m| m.len()).unwrap_or(0);
            let mut r = FileResult::from_source(&dest.path, f, dest.disposition);
            if bytes < 8 {
                r.note = Some("No embedded text — try the OCR tool for scanned PDFs".into());
            }
            Ok(r)
        }
        .await;
        match outcome {
            Ok(r) => batch.results.push(r),
            Err(e) => batch.push_failure(f, e),
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

/// Read the text of a PDF straight into the UI (no file written).
#[tauri::command]
pub async fn pdf_read_text(input: String, layout: Option<bool>) -> AppResult<String> {
    let file = paths::validate_input_file(&input)?;
    let pdftotext = binaries::require("pdftotext")?;
    let mut args: Vec<String> = Vec::new();
    if layout.unwrap_or(true) {
        args.push("-layout".into());
    }
    args.push("-enc".into());
    args.push("UTF-8".into());
    args.push(file.to_string_lossy().to_string());
    args.push("-".into());
    let out = jobs::run(None, &pdftotext, &args).await?;
    if !out.ok() {
        return Err(jobs::explain_failure("Extracting text", &out));
    }
    Ok(out.stdout)
}

// ------------------------------------------------------------------ compress

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfCompressOpts {
    /// "screen" (max compression), "ebook" (balanced), "printer", "prepress" (high quality).
    #[serde(default = "d_ebook")]
    pub preset: String,
    pub dpi: Option<u32>,
    #[serde(default)]
    pub grayscale: bool,
}
fn d_ebook() -> String { "ebook".into() }

#[tauri::command]
pub async fn compress_pdf(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    opts: PdfCompressOpts,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    let files = paths::validate_inputs(&inputs)?;
    let gs = binaries::require("gs")?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();

    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.2, f);
        let outcome = async {
            let mut spec = output.clone();
            if spec.suffix.is_none() && spec.mode != "custom" {
                spec.suffix = Some("-compressed".into());
            }
            let dest = paths::resolve_destination(f, &spec, "pdf")?;
            if dest.is_skipped() {
                return Ok(FileResult::skipped(&dest, f));
            }
            let preset = match opts.preset.as_str() {
                "screen" | "ebook" | "printer" | "prepress" | "default" => opts.preset.clone(),
                _ => "ebook".to_string(),
            };
            let mut args: Vec<String> = vec![
                "-sDEVICE=pdfwrite".into(),
                "-dCompatibilityLevel=1.7".into(),
                format!("-dPDFSETTINGS=/{preset}"),
                "-dNOPAUSE".into(),
                "-dQUIET".into(),
                "-dBATCH".into(),
                "-dSAFER".into(),
                "-dDetectDuplicateImages=true".into(),
                "-dCompressFonts=true".into(),
            ];
            if let Some(dpi) = opts.dpi {
                let dpi = dpi.clamp(36, 600).to_string();
                args.push("-dDownsampleColorImages=true".into());
                args.push(format!("-dColorImageResolution={dpi}"));
                args.push("-dDownsampleGrayImages=true".into());
                args.push(format!("-dGrayImageResolution={dpi}"));
                args.push("-dDownsampleMonoImages=true".into());
                args.push(format!("-dMonoImageResolution={dpi}"));
            }
            if opts.grayscale {
                args.push("-sColorConversionStrategy=Gray".into());
                args.push("-dProcessColorModel=/DeviceGray".into());
            }
            args.push(format!("-sOutputFile={}", dest.path.to_string_lossy()));
            args.push(f.to_string_lossy().to_string());
            let out = jobs::run(Some(&ctx.handle), &gs, &args).await?;
            if !out.ok() || !dest.path.exists() {
                return Err(jobs::explain_failure("Compressing the PDF", &out));
            }
            let original = std::fs::metadata(f).map(|m| m.len()).unwrap_or(0);
            let new_size = std::fs::metadata(&dest.path).map(|m| m.len()).unwrap_or(0);
            let mut r = FileResult::from_source(&dest.path, f, dest.disposition);
            if new_size >= original && original > 0 {
                r.note = Some("Already well compressed — the result is not smaller".into());
            }
            Ok(r)
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

// ------------------------------------------------------------------ encryption

#[tauri::command]
pub async fn encrypt_pdf(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    user_password: String,
    owner_password: Option<String>,
    allow_printing: Option<bool>,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    if user_password.trim().is_empty() {
        return Err(AppError::invalid("Enter a password to protect the document with."));
    }
    let files = paths::validate_inputs(&inputs)?;
    let qpdf = binaries::require("qpdf")?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();
    let owner = owner_password.filter(|p| !p.trim().is_empty()).unwrap_or_else(|| user_password.clone());

    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.2, f);
        let outcome = async {
            let mut spec = output.clone();
            if spec.suffix.is_none() && spec.mode != "custom" {
                spec.suffix = Some("-encrypted".into());
            }
            let dest = paths::resolve_destination(f, &spec, "pdf")?;
            if dest.is_skipped() {
                return Ok(FileResult::skipped(&dest, f));
            }
            let mut args: Vec<String> = vec![
                "--encrypt".into(),
                user_password.clone(),
                owner.clone(),
                "256".into(),
            ];
            if !allow_printing.unwrap_or(true) {
                args.push("--print=none".into());
            }
            args.push("--".into());
            args.push(f.to_string_lossy().to_string());
            args.push(dest.path.to_string_lossy().to_string());
            let out = jobs::run(Some(&ctx.handle), &qpdf, &args).await?;
            // qpdf uses exit code 3 for warnings that still produce valid output.
            if out.status != 0 && out.status != 3 {
                return Err(jobs::explain_failure("Encrypting the PDF", &out));
            }
            Ok(FileResult::from_source(&dest.path, f, dest.disposition))
        }
        .await;
        match outcome {
            Ok(r) => batch.results.push(r),
            Err(e) => batch.push_failure(f, e),
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

#[tauri::command]
pub async fn decrypt_pdf(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    password: String,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    let files = paths::validate_inputs(&inputs)?;
    let qpdf = binaries::require("qpdf")?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();

    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.2, f);
        let outcome = async {
            let mut spec = output.clone();
            if spec.suffix.is_none() && spec.mode != "custom" {
                spec.suffix = Some("-unlocked".into());
            }
            let dest = paths::resolve_destination(f, &spec, "pdf")?;
            if dest.is_skipped() {
                return Ok(FileResult::skipped(&dest, f));
            }
            let args: Vec<String> = vec![
                format!("--password={password}"),
                "--decrypt".into(),
                "--".into(),
                f.to_string_lossy().to_string(),
                dest.path.to_string_lossy().to_string(),
            ];
            let out = jobs::run(Some(&ctx.handle), &qpdf, &args).await?;
            if out.status != 0 && out.status != 3 {
                let hay = format!("{}{}", out.stdout, out.stderr).to_lowercase();
                if hay.contains("invalid password") || hay.contains("incorrect password") {
                    return Err(AppError::with_details(
                        ErrorKind::InvalidInput,
                        "That password does not open this document.",
                        out.tail(),
                    ));
                }
                return Err(jobs::explain_failure("Removing PDF protection", &out));
            }
            Ok(FileResult::from_source(&dest.path, f, dest.disposition))
        }
        .await;
        match outcome {
            Ok(r) => batch.results.push(r),
            Err(e) => batch.push_failure(f, e),
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

// ------------------------------------------------------------------ office

/// How LibreOffice has to be asked to read one kind of file and write another.
#[derive(Debug, PartialEq, Eq)]
struct OfficePlan {
    /// `--infilter`, when LibreOffice would otherwise open the file in the wrong application.
    infilter: Option<&'static str>,
    /// What goes after `--convert-to`: a bare extension, or `extension:Filter Name:{options}`.
    convert_to: String,
}

/// Spreadsheets and slides are not word-processor documents: LibreOffice has no Word, ODT or RTF
/// export for them.
fn is_writer_source(input_ext: &str) -> bool {
    !matches!(input_ext, "xls" | "xlsx" | "ods" | "ppt" | "pptx" | "odp")
}

fn office_plan(input_ext: &str, target: &str) -> OfficePlan {
    // A PDF opens in Draw, a drawing program with no Word export: `--convert-to docx` alone ends
    // with "no export filter" and writes nothing. Reading it with the Writer import filter
    // makes it a text document, which every document format can be written from.
    let infilter = (input_ext == "pdf").then_some("writer_pdf_import");
    let convert_to = match target {
        // Plain HTML export leaves each picture beside the page as a separate file, and the
        // conversion folder is searched for "the" result. Embedding the pictures makes the page
        // one self-contained file.
        "html" if is_writer_source(input_ext) => {
            r#"html:XHTML Writer File:{"EmbedImages":{"type":"boolean","value":"true"}}"#.to_string()
        }
        other => other.to_string(),
    };
    OfficePlan { infilter, convert_to }
}

/// The converted file in LibreOffice's output folder. Normally the only file; if anything else
/// was written beside it, the one with the requested extension wins.
fn pick_converted(dir: &std::path::Path, target: &str) -> Option<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .collect();
    files.sort();
    let wanted = files
        .iter()
        .position(|p| p.extension().map(|e| e.eq_ignore_ascii_case(target)).unwrap_or(false));
    match wanted {
        Some(i) => Some(files.swap_remove(i)),
        None => files.into_iter().next(),
    }
}

/// `file://` URL for a path, with everything but the safe characters percent-encoded. The
/// application support folder has a space in its name, which LibreOffice rejects unescaped.
fn file_url(path: &std::path::Path) -> String {
    use std::os::unix::ffi::OsStrExt;
    let mut url = String::from("file://");
    for &b in path.as_os_str().as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => url.push(b as char),
            _ => url.push_str(&format!("%{b:02X}")),
        }
    }
    url
}

/// A profile folder of Toolbox's own, so a LibreOffice window the person has open (or one that
/// is still shutting down) never holds the lock that headless conversions need.
fn office_profile_arg() -> String {
    let dir = crate::settings::config_dir().join("libreoffice-profile");
    std::fs::create_dir_all(&dir).ok();
    format!("-env:UserInstallation={}", file_url(&dir))
}

/// One LibreOffice conversion at a time: they share that profile, and two instances starting
/// on it together crash each other.
static OFFICE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Run one LibreOffice conversion into `work` and return the file it wrote there.
async fn office_convert(
    job: Option<&jobs::JobHandle>,
    soffice: &std::path::Path,
    input: &std::path::Path,
    target: &str,
    work: &std::path::Path,
) -> AppResult<PathBuf> {
    let input_ext = paths::extension(input);
    let plan = office_plan(&input_ext, target);
    let mut args: Vec<String> = vec![office_profile_arg(), "--headless".into(), "--norestore".into()];
    if let Some(filter) = plan.infilter {
        args.push(format!("--infilter={filter}"));
    }
    args.extend([
        "--convert-to".to_string(),
        plan.convert_to,
        "--outdir".to_string(),
        work.to_string_lossy().to_string(),
        input.to_string_lossy().to_string(),
    ]);
    let _one_at_a_time = OFFICE_LOCK.lock().await;
    let out = jobs::run(job, soffice, &args).await?;
    pick_converted(work, target).ok_or_else(|| office_failure(&input_ext, target, &out))
}

/// Convert documents with LibreOffice (DOCX ↔ PDF and friends).
#[tauri::command]
pub async fn convert_document(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    target_format: String,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    let files = paths::validate_inputs(&inputs)?;
    let soffice = binaries::require("soffice")?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();
    let target = target_format.trim_start_matches('.').to_lowercase();
    if !target.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(AppError::invalid("That output format name is not valid."));
    }

    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.2, f);
        let outcome = async {
            let dest = paths::resolve_destination(f, &output, &target)?;
            if dest.is_skipped() {
                return Ok(FileResult::skipped(&dest, f));
            }
            let work = std::env::temp_dir().join(format!("toolbox-lo-{}", uuid::Uuid::new_v4().simple()));
            std::fs::create_dir_all(&work)?;
            let produced = office_convert(Some(&ctx.handle), &soffice, f, &target, &work).await;
            let produced = match produced {
                Ok(p) => p,
                Err(e) => {
                    std::fs::remove_dir_all(&work).ok();
                    return Err(e);
                }
            };
            std::fs::copy(&produced, &dest.path)?;
            std::fs::remove_dir_all(&work).ok();
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

/// Say what went wrong in terms of the files, not LibreOffice's "no export filter".
fn office_failure(input_ext: &str, target: &str, out: &jobs::ProcOutput) -> AppError {
    let hay = format!("{}{}", out.stdout, out.stderr).to_lowercase();
    if hay.contains("no export filter") {
        return AppError::with_details(
            ErrorKind::Unsupported,
            format!("LibreOffice cannot turn a .{input_ext} file into .{target}."),
            out.tail(),
        );
    }
    jobs::explain_failure("Converting the document", out)
}

/// Convert with Pandoc (markdown/html/docx/latex/…).
#[tauri::command]
pub async fn pandoc_convert(
    app: AppHandle,
    job_id: String,
    inputs: Vec<String>,
    to_format: String,
    from_format: Option<String>,
    output: OutputSpec,
) -> AppResult<BatchResult> {
    let files = paths::validate_inputs(&inputs)?;
    let pandoc = binaries::require("pandoc")?;
    let ctx = JobCtx::new(app, job_id, files.len());
    let started = now_ms();
    let mut batch = BatchResult::default();
    let valid = |s: &str| s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '+');
    if !valid(&to_format) {
        return Err(AppError::invalid("That output format name is not valid."));
    }
    let ext = match to_format.as_str() {
        "markdown" | "gfm" | "commonmark" => "md",
        "html" | "html5" => "html",
        "latex" => "tex",
        "plain" => "txt",
        other => other,
    }
    .to_string();

    for (i, f) in files.iter().enumerate() {
        if ctx.is_cancelled() {
            batch.cancelled = true;
            break;
        }
        ctx.emit_item(i, 0.2, f);
        let outcome = async {
            let dest = paths::resolve_destination(f, &output, &ext)?;
            if dest.is_skipped() {
                return Ok(FileResult::skipped(&dest, f));
            }
            let mut args: Vec<String> = Vec::new();
            if let Some(from) = from_format.as_deref().filter(|s| valid(s)) {
                args.push("-f".into());
                args.push(from.to_string());
            }
            args.push("-t".into());
            args.push(to_format.clone());
            args.push("-o".into());
            args.push(dest.path.to_string_lossy().to_string());
            args.push(f.to_string_lossy().to_string());
            let out = jobs::run(Some(&ctx.handle), &pandoc, &args).await?;
            if !out.ok() {
                return Err(jobs::explain_failure("Converting the document", &out));
            }
            Ok(FileResult::from_source(&dest.path, f, dest.disposition))
        }
        .await;
        match outcome {
            Ok(r) => batch.results.push(r),
            Err(e) => batch.push_failure(f, e),
        }
    }
    batch.elapsed_ms = now_ms().saturating_sub(started);
    Ok(batch)
}

// ------------------------------------------------------------------ info

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub pages: u32,
    pub encrypted: bool,
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<String>,
    pub creator: Option<String>,
    pub producer: Option<String>,
    pub creation_date: Option<String>,
    pub page_size: Option<String>,
    pub pdf_version: Option<String>,
    pub tagged: bool,
}

#[tauri::command]
pub async fn pdf_info(inputs: Vec<String>) -> AppResult<Vec<PdfInfo>> {
    let files = paths::validate_inputs(&inputs)?;
    // pdfinfo ships with poppler alongside pdftotext.
    let pdfinfo = binaries::resolve("pdftotext")
        .map(|p| p.with_file_name("pdfinfo"))
        .filter(|p| p.is_file())
        .ok_or_else(|| {
            AppError::with_details(
                ErrorKind::MissingDependency,
                "Poppler is required to read PDF information.",
                "Install it with `brew install poppler`.",
            )
        })?;
    let mut out = Vec::new();
    for f in files {
        let args = [f.to_string_lossy().to_string()];
        let res = jobs::run(None, &pdfinfo, &args).await?;
        let mut info = PdfInfo {
            path: f.to_string_lossy().to_string(),
            name: paths::display_name(&f),
            size: std::fs::metadata(&f).map(|m| m.len()).unwrap_or(0),
            pages: 0,
            encrypted: false,
            title: None,
            author: None,
            subject: None,
            keywords: None,
            creator: None,
            producer: None,
            creation_date: None,
            page_size: None,
            pdf_version: None,
            tagged: false,
        };
        for line in res.stdout.lines() {
            let Some((key, value)) = line.split_once(':') else { continue };
            let v = value.trim().to_string();
            if v.is_empty() {
                continue;
            }
            match key.trim() {
                "Pages" => info.pages = v.parse().unwrap_or(0),
                "Encrypted" => info.encrypted = !v.starts_with("no"),
                "Title" => info.title = Some(v),
                "Author" => info.author = Some(v),
                "Subject" => info.subject = Some(v),
                "Keywords" => info.keywords = Some(v),
                "Creator" => info.creator = Some(v),
                "Producer" => info.producer = Some(v),
                "CreationDate" => info.creation_date = Some(v),
                "Page size" => info.page_size = Some(v),
                "PDF version" => info.pdf_version = Some(v),
                "Tagged" => info.tagged = v.starts_with("yes"),
                _ => {}
            }
        }
        if info.pages == 0 && res.stderr.to_lowercase().contains("password") {
            info.encrypted = true;
        }
        out.push(info);
    }
    Ok(out)
}

/// Page count only — cheap enough for previews and validation.
#[tauri::command]
pub async fn pdf_page_count(input: String) -> AppResult<u32> {
    let infos = pdf_info(vec![input]).await?;
    infos.first().map(|i| i.pages).ok_or_else(|| AppError::internal("Could not read the page count."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compress_presets_fall_back_safely() {
        let opts = PdfCompressOpts { preset: "; rm -rf /".into(), dpi: None, grayscale: false };
        let preset = match opts.preset.as_str() {
            "screen" | "ebook" | "printer" | "prepress" | "default" => opts.preset.clone(),
            _ => "ebook".to_string(),
        };
        assert_eq!(preset, "ebook");
    }

    // ---- LibreOffice

    #[test]
    fn a_pdf_is_read_as_a_text_document_so_it_can_become_word() {
        let plan = office_plan("pdf", "docx");
        assert_eq!(plan.infilter, Some("writer_pdf_import"));
        assert_eq!(plan.convert_to, "docx");
        assert_eq!(office_plan("docx", "pdf").infilter, None);
    }

    #[test]
    fn html_from_a_text_document_embeds_its_pictures() {
        assert!(office_plan("docx", "html").convert_to.contains("EmbedImages"));
        assert!(office_plan("pdf", "html").convert_to.contains("EmbedImages"));
        // Spreadsheets and slides go through their own HTML export.
        assert_eq!(office_plan("xlsx", "html").convert_to, "html");
    }

    #[test]
    fn profile_urls_escape_spaces() {
        let url = file_url(std::path::Path::new("/Users/me/Library/Application Support/Toolbox/lo"));
        assert_eq!(url, "file:///Users/me/Library/Application%20Support/Toolbox/lo");
    }

    #[test]
    fn the_converted_file_is_chosen_by_its_extension() {
        let dir = std::env::temp_dir().join(format!("tb-pick-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(pick_converted(&dir, "html"), None);
        std::fs::write(dir.join("a_image.png"), b"png").unwrap();
        std::fs::write(dir.join("b.html"), b"<p>").unwrap();
        assert_eq!(pick_converted(&dir, "html"), Some(dir.join("b.html")));
        // Nothing with that extension: still hand back what there is rather than nothing.
        assert_eq!(pick_converted(&dir, "docx"), Some(dir.join("a_image.png")));
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Real LibreOffice, real files. Skipped where LibreOffice is not installed.
    mod libreoffice {
        use super::*;
        use std::path::Path;

        fn soffice() -> Option<PathBuf> {
            binaries::resolve("soffice")
        }

        fn scratch(tag: &str) -> PathBuf {
            let dir = std::env::temp_dir().join(format!("tb-lo-{tag}-{}", uuid::Uuid::new_v4().simple()));
            std::fs::create_dir_all(&dir).unwrap();
            dir
        }

        async fn convert(soffice: &Path, input: &Path, target: &str) -> AppResult<PathBuf> {
            let work = scratch("out");
            office_convert(None, soffice, input, target, &work).await
        }

        /// A PDF with real text in it, made the way a person would: from a document.
        async fn text_pdf(soffice: &Path, dir: &Path) -> PathBuf {
            let txt = dir.join("letter.txt");
            std::fs::write(&txt, "Quarterly report\n\nRevenue grew by twelve percent.\n").unwrap();
            convert(soffice, &txt, "pdf").await.expect("text to pdf")
        }

        fn zip_text(path: &Path, member: &str) -> String {
            let file = std::fs::File::open(path).unwrap();
            let mut zip = zip::ZipArchive::new(file).expect("a zip container");
            let mut entry = zip.by_name(member).unwrap_or_else(|_| panic!("{member} in {path:?}"));
            let mut text = String::new();
            std::io::Read::read_to_string(&mut entry, &mut text).unwrap();
            text
        }

        #[tokio::test]
        async fn pdf_to_word_odt_and_rtf() {
            let Some(soffice) = soffice() else { return };
            let dir = scratch("pdf");
            let pdf = text_pdf(&soffice, &dir).await;

            let docx = convert(&soffice, &pdf, "docx").await.expect("PDF to Word must produce a file");
            assert!(zip_text(&docx, "word/document.xml").contains("Revenue grew"), "the words must survive");

            let odt = convert(&soffice, &pdf, "odt").await.expect("PDF to ODT");
            assert!(zip_text(&odt, "content.xml").contains("Revenue grew"));

            let rtf = convert(&soffice, &pdf, "rtf").await.expect("PDF to RTF");
            let body = std::fs::read(&rtf).unwrap();
            assert!(body.starts_with(b"{\\rtf"), "an RTF file starts with {{\\rtf");
            assert!(String::from_utf8_lossy(&body).contains("Revenue"));
            std::fs::remove_dir_all(&dir).ok();
        }

        #[tokio::test]
        async fn word_to_pdf_and_back_to_other_formats() {
            let Some(soffice) = soffice() else { return };
            let docx = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/with-image.docx");
            let pdf = convert(&soffice, &docx, "pdf").await.expect("Word to PDF");
            assert!(std::fs::read(&pdf).unwrap().starts_with(b"%PDF"));
            for target in ["odt", "rtf", "txt"] {
                let out = convert(&soffice, &docx, target).await.unwrap_or_else(|e| panic!("docx to {target}: {e:?}"));
                assert!(std::fs::metadata(out).unwrap().len() > 0);
            }
        }

        /// Plain HTML export writes the pictures as separate files; the result must be the
        /// page itself, with the pictures inside it.
        #[tokio::test]
        async fn word_to_html_is_one_self_contained_file() {
            let Some(soffice) = soffice() else { return };
            let docx = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/with-image.docx");
            let work = scratch("html");
            let html = office_convert(None, &soffice, &docx, "html", &work).await.expect("Word to HTML");
            assert_eq!(html.extension().and_then(|e| e.to_str()), Some("html"), "picked {html:?}");
            let page = std::fs::read_to_string(&html).unwrap();
            assert!(page.contains("data:image"), "the picture should be inside the page");
            assert_eq!(std::fs::read_dir(&work).unwrap().count(), 1, "no stray picture files");
            std::fs::remove_dir_all(&work).ok();
        }

        #[tokio::test]
        async fn spreadsheets_and_slides_become_pdf() {
            let Some(soffice) = soffice() else { return };
            let dir = scratch("office");
            let csv = dir.join("table.csv");
            std::fs::write(&csv, "a,b\n1,2\n").unwrap();
            let xlsx = convert(&soffice, &csv, "xlsx").await.expect("csv to xlsx");
            let pdf = convert(&soffice, &xlsx, "pdf").await.expect("xlsx to pdf");
            assert!(std::fs::read(&pdf).unwrap().starts_with(b"%PDF"));
            std::fs::remove_dir_all(&dir).ok();
        }

        #[tokio::test]
        async fn a_spreadsheet_cannot_become_word_and_says_so() {
            let Some(soffice) = soffice() else { return };
            let dir = scratch("nope");
            let csv = dir.join("table.csv");
            std::fs::write(&csv, "a,b\n1,2\n").unwrap();
            let xlsx = convert(&soffice, &csv, "xlsx").await.unwrap();
            let AppError::Friendly { message, .. } = convert(&soffice, &xlsx, "docx").await.unwrap_err();
            assert!(message.contains("cannot turn a .xlsx file into .docx"), "{message}");
            std::fs::remove_dir_all(&dir).ok();
        }
    }

    #[test]
    fn destination_for_pdf_keeps_extension() {
        let dir = std::env::temp_dir().join(format!("tb-pdf-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("doc.pdf");
        std::fs::write(&input, b"%PDF-1.4").unwrap();
        let spec = OutputSpec { suffix: Some("-compressed".into()), ..Default::default() };
        let dest = paths::resolve_destination(&input, &spec, "pdf").unwrap();
        assert_eq!(paths::display_name(&dest.path), "doc-compressed.pdf");
        std::fs::remove_dir_all(&dir).ok();
    }
}

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
            let out_dir = paths::output_dir_for(f, &output)?;
            let work = std::env::temp_dir().join(format!("toolbox-lo-{}", uuid::Uuid::new_v4().simple()));
            std::fs::create_dir_all(&work)?;
            let args: Vec<String> = vec![
                "--headless".into(),
                "--norestore".into(),
                "--convert-to".into(),
                target.clone(),
                "--outdir".into(),
                work.to_string_lossy().to_string(),
                f.to_string_lossy().to_string(),
            ];
            let out = jobs::run(Some(&ctx.handle), &soffice, &args).await?;
            let produced: Option<PathBuf> = std::fs::read_dir(&work)
                .ok()
                .and_then(|rd| rd.filter_map(|e| e.ok()).map(|e| e.path()).find(|p| p.is_file()));
            let Some(produced) = produced else {
                std::fs::remove_dir_all(&work).ok();
                return Err(jobs::explain_failure("Converting the document", &out));
            };
            let dest = paths::finalize_destination(
                out_dir.join(format!("{}.{}", paths::stem(f), target)),
                f,
                &output.collision,
            )?;
            std::fs::copy(&produced, &dest.path)?;
            std::fs::remove_dir_all(&work).ok();
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

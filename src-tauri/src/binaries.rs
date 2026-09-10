use crate::error::{AppError, AppResult, ErrorKind};
use crate::settings;
use serde::Serialize;
use std::path::PathBuf;

/// A tool-provided external program. `id` is the stable key used by the frontend
/// registry (`requires: ['ffmpeg']`) and by the settings override map.
pub struct BinarySpec {
    pub id: &'static str,
    pub label: &'static str,
    /// Executable names to look for, in order of preference.
    pub candidates: &'static [&'static str],
    /// Arguments that make the program print its version.
    pub version_args: &'static [&'static str],
    /// How the user can install it on macOS.
    pub install_hint: &'static str,
    /// Short explanation of what breaks without it.
    pub used_for: &'static str,
}

pub const BINARIES: &[BinarySpec] = &[
    BinarySpec {
        id: "ffmpeg",
        label: "FFmpeg",
        candidates: &["ffmpeg"],
        version_args: &["-version"],
        install_hint: "brew install ffmpeg",
        used_for: "Video and audio conversion, trimming, GIFs and frame extraction.",
    },
    BinarySpec {
        id: "ffprobe",
        label: "FFprobe",
        candidates: &["ffprobe"],
        version_args: &["-version"],
        install_hint: "brew install ffmpeg",
        used_for: "Reading video and audio metadata (codec, duration, bitrate).",
    },
    BinarySpec {
        id: "magick",
        label: "ImageMagick",
        candidates: &["magick", "convert"],
        version_args: &["-version"],
        install_hint: "brew install imagemagick",
        used_for: "HEIC/AVIF decoding, lossy WebP, SVG rasterising and contact sheets.",
    },
    BinarySpec {
        id: "gs",
        label: "Ghostscript",
        candidates: &["gs"],
        version_args: &["--version"],
        install_hint: "brew install ghostscript",
        used_for: "PDF compression.",
    },
    BinarySpec {
        id: "pdftoppm",
        label: "Poppler (pdftoppm)",
        candidates: &["pdftoppm"],
        version_args: &["-v"],
        install_hint: "brew install poppler",
        used_for: "Rendering PDF pages to images and PDF thumbnails.",
    },
    BinarySpec {
        id: "pdftotext",
        label: "Poppler (pdftotext)",
        candidates: &["pdftotext"],
        version_args: &["-v"],
        install_hint: "brew install poppler",
        used_for: "Extracting text from PDFs.",
    },
    BinarySpec {
        id: "qpdf",
        label: "QPDF",
        candidates: &["qpdf"],
        version_args: &["--version"],
        install_hint: "brew install qpdf",
        used_for: "PDF encryption, decryption and linearisation.",
    },
    BinarySpec {
        id: "exiftool",
        label: "ExifTool",
        candidates: &["exiftool"],
        version_args: &["-ver"],
        install_hint: "brew install exiftool",
        used_for: "Deep metadata reading and editing across many formats.",
    },
    BinarySpec {
        id: "tesseract",
        label: "Tesseract OCR",
        candidates: &["tesseract"],
        version_args: &["--version"],
        install_hint: "brew install tesseract tesseract-lang",
        used_for: "Offline OCR for images and scanned PDFs.",
    },
    BinarySpec {
        id: "yt-dlp",
        label: "yt-dlp",
        candidates: &["yt-dlp"],
        version_args: &["--version"],
        install_hint: "brew install yt-dlp",
        used_for: "Downloading media you own or are licensed to save.",
    },
    BinarySpec {
        id: "pandoc",
        label: "Pandoc",
        candidates: &["pandoc"],
        version_args: &["--version"],
        install_hint: "brew install pandoc",
        used_for: "Document conversion between Markdown, HTML, DOCX and more.",
    },
    BinarySpec {
        id: "soffice",
        label: "LibreOffice",
        candidates: &["soffice", "libreoffice"],
        version_args: &["--version"],
        install_hint: "brew install --cask libreoffice",
        used_for: "Office document conversion (DOCX ↔ PDF).",
    },
];

pub fn spec(id: &str) -> Option<&'static BinarySpec> {
    BINARIES.iter().find(|b| b.id == id)
}

/// Directories searched in addition to `PATH`. Homebrew installs are the common case
/// on macOS and are frequently missing from a GUI app's inherited environment.
const EXTRA_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/opt/local/bin",
    "/usr/bin",
    "/bin",
    "/opt/homebrew/sbin",
    "/Applications/LibreOffice.app/Contents/MacOS",
    "/opt/anaconda3/bin",
];

/// Resolve an executable path for `id`, honouring a user override first.
pub fn resolve(id: &str) -> Option<PathBuf> {
    let cfg = settings::load();
    if let Some(custom) = cfg.binary_override(id) {
        let p = PathBuf::from(&custom);
        if p.is_file() {
            return Some(p);
        }
        // An override that names a bare command still gets looked up.
        if let Ok(found) = which::which(&custom) {
            return Some(found);
        }
    }
    let spec = spec(id)?;
    for name in spec.candidates {
        if let Ok(found) = which::which(name) {
            return Some(found);
        }
        for dir in EXTRA_DIRS {
            let candidate = PathBuf::from(dir).join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Resolve or produce a friendly "you need to install X" error.
pub fn require(id: &str) -> AppResult<PathBuf> {
    resolve(id).ok_or_else(|| {
        let s = spec(id);
        let label = s.map(|s| s.label).unwrap_or(id);
        let hint = s.map(|s| s.install_hint).unwrap_or("");
        AppError::with_details(
            ErrorKind::MissingDependency,
            format!("{label} is required for this tool but was not found."),
            format!("Install it with `{hint}`, or set the path manually in Settings › Advanced.\nMissing binary id: {id}"),
        )
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryStatus {
    pub id: String,
    pub label: String,
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub install_hint: String,
    pub used_for: String,
    pub overridden: bool,
}

fn first_version_line(raw: &str) -> Option<String> {
    let line = raw.lines().find(|l| !l.trim().is_empty())?.trim();
    Some(line.chars().take(120).collect())
}

pub fn probe(id: &str) -> BinaryStatus {
    let s = spec(id);
    let label = s.map(|s| s.label.to_string()).unwrap_or_else(|| id.to_string());
    let cfg = settings::load();
    let overridden = cfg.binary_override(id).is_some();
    match resolve(id) {
        Some(path) => {
            let version = s.and_then(|s| {
                std::process::Command::new(&path)
                    .args(s.version_args)
                    .output()
                    .ok()
                    .and_then(|out| {
                        let text = if out.stdout.is_empty() {
                            String::from_utf8_lossy(&out.stderr).to_string()
                        } else {
                            String::from_utf8_lossy(&out.stdout).to_string()
                        };
                        first_version_line(&text)
                    })
            });
            BinaryStatus {
                id: id.to_string(),
                label,
                installed: true,
                path: Some(path.to_string_lossy().to_string()),
                version,
                install_hint: s.map(|s| s.install_hint.to_string()).unwrap_or_default(),
                used_for: s.map(|s| s.used_for.to_string()).unwrap_or_default(),
                overridden,
            }
        }
        None => BinaryStatus {
            id: id.to_string(),
            label,
            installed: false,
            path: None,
            version: None,
            install_hint: s.map(|s| s.install_hint.to_string()).unwrap_or_default(),
            used_for: s.map(|s| s.used_for.to_string()).unwrap_or_default(),
            overridden,
        },
    }
}

pub fn probe_all() -> Vec<BinaryStatus> {
    BINARIES.iter().map(|b| probe(b.id)).collect()
}

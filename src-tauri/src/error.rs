use serde::Serialize;

/// Every failure surfaced to the UI carries a human-readable message plus optional
/// technical detail that the UI shows behind a "Technical details" disclosure.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{message}")]
    Friendly {
        message: String,
        details: Option<String>,
        kind: ErrorKind,
    },
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    NotFound,
    InvalidInput,
    MissingDependency,
    Cancelled,
    Io,
    Process,
    Unsupported,
    Internal,
}

impl AppError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        AppError::Friendly { message: message.into(), details: None, kind }
    }
    pub fn with_details(kind: ErrorKind, message: impl Into<String>, details: impl Into<String>) -> Self {
        let d = details.into();
        let d = if d.trim().is_empty() { None } else { Some(d) };
        AppError::Friendly { message: message.into(), details: d, kind }
    }
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::InvalidInput, message)
    }
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::NotFound, message)
    }
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Internal, message)
    }
    pub fn unsupported(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Unsupported, message)
    }
    pub fn cancelled() -> Self {
        Self::new(ErrorKind::Cancelled, "Operation cancelled.")
    }
    pub fn kind(&self) -> ErrorKind {
        match self {
            AppError::Friendly { kind, .. } => *kind,
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        let message = match e.kind() {
            std::io::ErrorKind::NotFound => "The file or folder could not be found.".to_string(),
            std::io::ErrorKind::PermissionDenied => {
                "Permission denied. Toolbox is not allowed to access this location.".to_string()
            }
            std::io::ErrorKind::AlreadyExists => "A file with that name already exists.".to_string(),
            _ => format!("File system error: {e}"),
        };
        AppError::with_details(ErrorKind::Io, message, e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::with_details(ErrorKind::Internal, "Could not read or write structured data.", e.to_string())
    }
}

impl From<image::ImageError> for AppError {
    fn from(e: image::ImageError) -> Self {
        let message = match &e {
            image::ImageError::Unsupported(_) => "This image format or feature is not supported by the built-in image engine.".to_string(),
            image::ImageError::Decoding(_) => "The image could not be decoded — the file may be corrupt or in an unexpected format.".to_string(),
            image::ImageError::Limits(_) => "The image is too large to process with the current limits.".to_string(),
            _ => "The image could not be processed.".to_string(),
        };
        AppError::with_details(ErrorKind::Process, message, e.to_string())
    }
}

/// Serialized shape sent to the frontend.
#[derive(Serialize)]
pub struct SerializedError {
    pub message: String,
    pub details: Option<String>,
    pub kind: ErrorKind,
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let AppError::Friendly { message, details, kind } = self;
        SerializedError { message: message.clone(), details: details.clone(), kind: *kind }
            .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;

use crate::error::{AppError, AppResult, ErrorKind};
use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashMap;
use std::ffi::OsStr;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Clone)]
pub struct JobHandle {
    pub cancelled: Arc<AtomicBool>,
    children: Arc<Mutex<Vec<u32>>>,
}

impl JobHandle {
    fn new() -> Self {
        Self { cancelled: Arc::new(AtomicBool::new(false)), children: Arc::new(Mutex::new(Vec::new())) }
    }
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }
    pub fn bail_if_cancelled(&self) -> AppResult<()> {
        if self.is_cancelled() {
            Err(AppError::cancelled())
        } else {
            Ok(())
        }
    }
    fn track(&self, pid: u32) {
        if let Ok(mut g) = self.children.lock() {
            g.push(pid);
        }
    }
    fn untrack(&self, pid: u32) {
        if let Ok(mut g) = self.children.lock() {
            g.retain(|p| *p != pid);
        }
    }
    fn kill_children(&self) {
        let pids: Vec<u32> = self.children.lock().map(|g| g.clone()).unwrap_or_default();
        for pid in pids {
            #[cfg(unix)]
            unsafe {
                libc_kill(pid as i32);
            }
            #[cfg(not(unix))]
            {
                let _ = pid;
            }
        }
    }
}

#[cfg(unix)]
unsafe fn libc_kill(pid: i32) {
    // SIGTERM (15) — external encoders clean up their partial output on this.
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    kill(pid, 15);
}

static REGISTRY: Lazy<Mutex<HashMap<String, JobHandle>>> = Lazy::new(|| Mutex::new(HashMap::new()));

pub fn register(job_id: &str) -> JobHandle {
    let handle = JobHandle::new();
    if let Ok(mut g) = REGISTRY.lock() {
        g.insert(job_id.to_string(), handle.clone());
    }
    handle
}

pub fn finish(job_id: &str) {
    if let Ok(mut g) = REGISTRY.lock() {
        g.remove(job_id);
    }
}

pub fn cancel(job_id: &str) -> bool {
    let handle = REGISTRY.lock().ok().and_then(|g| g.get(job_id).cloned());
    match handle {
        Some(h) => {
            h.cancelled.store(true, Ordering::Relaxed);
            h.kill_children();
            true
        }
        None => false,
    }
}

pub fn cancel_all() {
    let handles: Vec<JobHandle> = REGISTRY.lock().map(|g| g.values().cloned().collect()).unwrap_or_default();
    for h in handles {
        h.cancelled.store(true, Ordering::Relaxed);
        h.kill_children();
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub job_id: String,
    /// 0.0–1.0, or `None` when the work is indeterminate.
    pub progress: Option<f64>,
    pub done: usize,
    pub total: usize,
    pub message: Option<String>,
    pub current_file: Option<String>,
}

/// Everything a long-running command needs: cancellation, progress reporting and the app handle.
pub struct JobCtx {
    pub app: AppHandle,
    pub job_id: String,
    pub handle: JobHandle,
    pub total: usize,
}

impl JobCtx {
    pub fn new(app: AppHandle, job_id: String, total: usize) -> Self {
        let handle = register(&job_id);
        Self { app, job_id, handle, total }
    }

    pub fn is_cancelled(&self) -> bool {
        self.handle.is_cancelled()
    }

    pub fn bail_if_cancelled(&self) -> AppResult<()> {
        self.handle.bail_if_cancelled()
    }

    pub fn emit(&self, done: usize, progress: Option<f64>, current_file: Option<String>, message: Option<String>) {
        let payload = ProgressPayload {
            job_id: self.job_id.clone(),
            progress,
            done,
            total: self.total,
            message,
            current_file,
        };
        let _ = self.app.emit("toolbox://progress", payload);
    }

    /// Report progress for item `index` (0-based) of a batch, with a fractional
    /// completion inside the current item.
    pub fn emit_item(&self, index: usize, fraction: f64, file: &Path) {
        let total = self.total.max(1) as f64;
        let overall = ((index as f64) + fraction.clamp(0.0, 1.0)) / total;
        self.emit(index, Some(overall.clamp(0.0, 1.0)), Some(file.to_string_lossy().to_string()), None);
    }
}

impl Drop for JobCtx {
    fn drop(&mut self) {
        finish(&self.job_id);
    }
}

pub struct ProcOutput {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

impl ProcOutput {
    pub fn ok(&self) -> bool {
        self.status == 0
    }
    pub fn tail(&self) -> String {
        let combined = format!("{}\n{}", self.stdout.trim(), self.stderr.trim());
        let lines: Vec<&str> = combined.lines().filter(|l| !l.trim().is_empty()).collect();
        let start = lines.len().saturating_sub(25);
        lines[start..].join("\n")
    }
}

/// Run an external program with an argument vector. Arguments are passed directly to
/// `execve` — no shell is involved anywhere, so file names cannot be interpreted as
/// commands regardless of what characters they contain.
pub async fn run(
    handle: Option<&JobHandle>,
    bin: &Path,
    args: &[impl AsRef<OsStr>],
) -> AppResult<ProcOutput> {
    run_with_line_hook(handle, bin, args, None::<fn(&str)>).await
}

/// Same as [`run`], but `on_line` receives every stdout/stderr line as it appears,
/// which is how per-file progress is derived from FFmpeg.
pub async fn run_with_line_hook<F>(
    job: Option<&JobHandle>,
    bin: &Path,
    args: &[impl AsRef<OsStr>],
    on_line: Option<F>,
) -> AppResult<ProcOutput>
where
    F: FnMut(&str) + Send,
{
    if let Some(h) = job {
        h.bail_if_cancelled()?;
    }
    let mut cmd = Command::new(bin);
    cmd.args(args.iter().map(|a| a.as_ref()));
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.kill_on_drop(true);
    // Keep child processes out of the app's interactive environment.
    cmd.env_remove("LD_PRELOAD");
    cmd.env_remove("DYLD_INSERT_LIBRARIES");

    let mut child = cmd.spawn().map_err(|e| {
        AppError::with_details(
            ErrorKind::MissingDependency,
            format!("Could not start “{}”.", bin.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()),
            e.to_string(),
        )
    })?;

    let pid = child.id().unwrap_or(0);
    if let Some(h) = job {
        if pid != 0 {
            h.track(pid);
        }
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let mut on_line = on_line;
    let mut out_buf = String::new();
    let mut err_buf = String::new();

    let mut out_reader = stdout.map(|s| BufReader::new(s).lines());
    let mut err_reader = stderr.map(|s| BufReader::new(s).lines());

    loop {
        tokio::select! {
            line = async {
                match out_reader.as_mut() {
                    Some(r) => r.next_line().await,
                    None => Ok(None),
                }
            }, if out_reader.is_some() => {
                match line {
                    Ok(Some(l)) => {
                        if let Some(f) = on_line.as_mut() { f(&l); }
                        out_buf.push_str(&l);
                        out_buf.push('\n');
                    }
                    _ => { out_reader = None; }
                }
            }
            line = async {
                match err_reader.as_mut() {
                    Some(r) => r.next_line().await,
                    None => Ok(None),
                }
            }, if err_reader.is_some() => {
                match line {
                    Ok(Some(l)) => {
                        if let Some(f) = on_line.as_mut() { f(&l); }
                        // FFmpeg is extremely chatty; keep the tail bounded.
                        if err_buf.len() < 200_000 {
                            err_buf.push_str(&l);
                            err_buf.push('\n');
                        }
                    }
                    _ => { err_reader = None; }
                }
            }
            else => break,
        }
    }

    let status = child.wait().await?;
    if let Some(h) = job {
        if pid != 0 {
            h.untrack(pid);
        }
        if h.is_cancelled() {
            return Err(AppError::cancelled());
        }
    }

    Ok(ProcOutput {
        status: status.code().unwrap_or(-1),
        stdout: out_buf,
        stderr: err_buf,
    })
}

/// Run a program and turn a non-zero exit into a friendly, tool-aware error.
pub async fn run_checked(
    job: Option<&JobHandle>,
    bin: &Path,
    args: &[impl AsRef<OsStr>],
    context: &str,
) -> AppResult<ProcOutput> {
    let out = run(job, bin, args).await?;
    if !out.ok() {
        return Err(explain_failure(context, &out));
    }
    Ok(out)
}

/// Map common encoder/tool failures onto explanations a human can act on.
pub fn explain_failure(context: &str, out: &ProcOutput) -> AppError {
    let hay = format!("{} {}", out.stdout, out.stderr).to_lowercase();
    let message = if hay.contains("no space left") {
        "There is not enough free disk space to finish this operation.".to_string()
    } else if hay.contains("permission denied") {
        "Permission denied while writing the result. Try a different output folder.".to_string()
    } else if hay.contains("invalid data found") || hay.contains("moov atom not found") {
        format!("{context} failed because the file appears to be corrupt or truncated.")
    } else if hay.contains("unknown encoder") || hay.contains("encoder not found") {
        let enc = hay
            .split("unknown encoder")
            .nth(1)
            .map(|s| s.trim().trim_matches('\'').split_whitespace().next().unwrap_or("").to_string())
            .unwrap_or_default();
        if enc.is_empty() {
            format!("{context} failed because the requested encoder is not available in this FFmpeg build.")
        } else {
            format!("{context} failed because the “{enc}” encoder is not available in this FFmpeg build.")
        }
    } else if hay.contains("decoder") && hay.contains("not found") {
        format!("{context} failed because the required decoder is not available in this build.")
    } else if hay.contains("password") || hay.contains("encrypted") {
        format!("{context} failed because the document is password protected.")
    } else if hay.contains("no such file") {
        format!("{context} failed because an input file could not be found.")
    } else if hay.contains("unsupported") {
        format!("{context} failed: the format or option combination is not supported.")
    } else {
        format!("{context} failed.")
    };
    AppError::with_details(ErrorKind::Process, message, out.tail())
}

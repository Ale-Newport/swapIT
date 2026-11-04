//! What the user is looking at when they summon the ring: the frontmost app and, when
//! that app is Finder, its selection and the folder of its front window.

use serde::Serialize;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub const FINDER_BUNDLE_ID: &str = "com.apple.finder";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FrontApp {
    pub name: String,
    pub bundle_id: String,
}

/// The frontmost application, with its pid (not sent to the frontend).
#[derive(Debug, Clone)]
pub struct FrontProcess {
    pub app: FrontApp,
    pub pid: i32,
}

#[cfg(target_os = "macos")]
pub fn frontmost() -> Option<FrontProcess> {
    use objc2_app_kit::NSWorkspace;
    let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
    Some(FrontProcess {
        app: FrontApp {
            name: app.localizedName().map(|s| s.to_string()).unwrap_or_default(),
            bundle_id: app.bundleIdentifier().map(|s| s.to_string()).unwrap_or_default(),
        },
        pid: app.processIdentifier(),
    })
}

#[cfg(not(target_os = "macos"))]
pub fn frontmost() -> Option<FrontProcess> {
    None
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FinderContext {
    pub paths: Vec<String>,
    pub folder: Option<String>,
    /// `Some("automation_denied")` when macOS refused the Apple Event.
    pub permission: Option<String>,
}

/// One Apple Event round trip: the selection, then the folder of the front window.
/// Output is line based — `S<TAB>path` per selected item, `D<TAB>path` for the folder.
const FINDER_SCRIPT: &str = r#"
set outText to ""
tell application "Finder"
	set sel to {}
	try
		set sel to selection as alias list
	end try
	repeat with a in sel
		set outText to outText & "S" & tab & (POSIX path of a) & linefeed
	end repeat
	set dirPath to ""
	try
		set dirPath to POSIX path of (target of front Finder window as alias)
	end try
	if dirPath is "" then set dirPath to POSIX path of (path to desktop folder)
	set outText to outText & "D" & tab & dirPath & linefeed
end tell
return outText
"#;

/// Strip the trailing slash AppleScript puts on folder paths (but keep "/").
fn tidy(path: &str) -> String {
    let p = path.trim();
    if p.len() > 1 {
        p.trim_end_matches('/').to_string()
    } else {
        p.to_string()
    }
}

fn parent_of(path: &str) -> Option<String> {
    Path::new(path).parent().map(|p| p.to_string_lossy().to_string()).filter(|p| !p.is_empty())
}

/// Parse the script's output. The folder rule: when something is selected, creations
/// land next to it (all selected items share a parent in Finder), otherwise in the
/// folder of the front window.
pub fn parse_finder_output(out: &str) -> FinderContext {
    let mut paths = Vec::new();
    let mut window_dir: Option<String> = None;
    for line in out.lines() {
        let Some((tag, rest)) = line.split_once('\t') else { continue };
        let rest = tidy(rest);
        if rest.is_empty() {
            continue;
        }
        match tag {
            "S" => paths.push(rest),
            "D" => window_dir = Some(rest),
            _ => {}
        }
    }
    let folder = paths.first().and_then(|p| parent_of(p)).or(window_dir);
    FinderContext { paths, folder, permission: None }
}

/// True when osascript's stderr is macOS saying the app may not control Finder.
pub fn is_automation_denied(stderr: &str) -> bool {
    stderr.contains("-1743") || stderr.to_ascii_lowercase().contains("not authorized")
}

fn run_with_timeout(mut cmd: Command, timeout: Duration) -> Option<(bool, String, String)> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().ok()?;
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let out = child.wait_with_output().ok()?;
                return Some((
                    status.success(),
                    String::from_utf8_lossy(&out.stdout).to_string(),
                    String::from_utf8_lossy(&out.stderr).to_string(),
                ));
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(8)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

/// Ask Finder. Blocks for ~100 ms normally; never longer than `timeout`, which also
/// covers the first run where macOS is showing its permission prompt.
pub fn finder_context(timeout: Duration) -> FinderContext {
    let mut cmd = Command::new("/usr/bin/osascript");
    cmd.arg("-e").arg(FINDER_SCRIPT);
    match run_with_timeout(cmd, timeout) {
        Some((true, stdout, _)) => {
            super::permissions::remember_automation("granted");
            parse_finder_output(&stdout)
        }
        Some((false, _, stderr)) if is_automation_denied(&stderr) => {
            super::permissions::remember_automation("denied");
            FinderContext { permission: Some("automation_denied".into()), ..Default::default() }
        }
        _ => FinderContext::default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_selection_and_prefers_its_parent_as_the_folder() {
        let out = "S\t/Users/a/Docs/report.pdf\nS\t/Users/a/Docs/photo.heic\nD\t/Users/a/Other/\n";
        let c = parse_finder_output(out);
        assert_eq!(c.paths, vec!["/Users/a/Docs/report.pdf", "/Users/a/Docs/photo.heic"]);
        assert_eq!(c.folder.as_deref(), Some("/Users/a/Docs"));
    }

    #[test]
    fn empty_selection_uses_the_window_folder() {
        let c = parse_finder_output("D\t/Users/a/Projects/\n");
        assert!(c.paths.is_empty());
        assert_eq!(c.folder.as_deref(), Some("/Users/a/Projects"));
    }

    #[test]
    fn selected_folders_lose_their_trailing_slash() {
        let c = parse_finder_output("S\t/Users/a/Docs/Folder/\nD\t/Users/a/Docs/\n");
        assert_eq!(c.paths, vec!["/Users/a/Docs/Folder"]);
        assert_eq!(c.folder.as_deref(), Some("/Users/a/Docs"));
    }

    #[test]
    fn tabs_and_spaces_inside_names_survive() {
        let c = parse_finder_output("S\t/Users/a/My Folder/two  spaces.txt\nD\t/Users/a/My Folder/\n");
        assert_eq!(c.paths, vec!["/Users/a/My Folder/two  spaces.txt"]);
    }

    #[test]
    fn junk_lines_are_ignored() {
        let c = parse_finder_output("garbage\n\nX\t/nope\nS\t\nD\t/ok/\n");
        assert!(c.paths.is_empty());
        assert_eq!(c.folder.as_deref(), Some("/ok"));
    }

    #[test]
    fn root_keeps_its_slash() {
        assert_eq!(tidy("/"), "/");
        assert_eq!(tidy("/Users/"), "/Users");
    }

    #[test]
    fn recognises_the_automation_refusal() {
        assert!(is_automation_denied("execution error: Not authorized to send Apple events to Finder. (-1743)"));
        assert!(is_automation_denied("... (-1743)"));
        assert!(!is_automation_denied("execution error: Can’t get window 1. (-1728)"));
    }
}

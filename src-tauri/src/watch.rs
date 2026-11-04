//! Watch folders: when a file lands in a folder the user chose, hand it to the
//! radial webview (`radial://watch`) so the action they picked runs on it.
//!
//! A poller rather than FSEvents on purpose: it is a few dozen lines, needs no
//! extra dependency, behaves the same on every volume, and — the part that
//! matters — it can wait until a file has *stopped growing* before reporting it,
//! so a download is never converted half-written.
//!
//! Only the top level of each folder is scanned and results are written to a
//! sub-folder, so a rule can never feed on its own output.

use crate::settings;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const POLL: Duration = Duration::from_millis(1500);
/// A file must keep the same size for this long before it is reported.
const SETTLE: Duration = Duration::from_millis(2600);
/// Never report more than this many files from one folder in one pass.
const BURST: usize = 200;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchRule {
    pub id: String,
    pub folder: String,
    pub action: String,
    #[serde(default = "enabled")]
    pub enabled: bool,
}

fn enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WatchEvent {
    pub rule_id: String,
    pub action: String,
    pub path: String,
    pub folder: String,
}

#[derive(Debug)]
struct Seen {
    size: u64,
    stable_since: Instant,
    reported: bool,
}

/// What the poller remembers about one rule's folder between passes.
#[derive(Debug, Default)]
pub struct FolderState {
    primed: bool,
    seen: HashMap<PathBuf, Seen>,
}

/// Files the OS or a browser is still writing, and names nobody means to process.
pub fn is_ignorable(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.starts_with('.')
        || lower.starts_with("~$")
        || [".crdownload", ".download", ".part", ".partial", ".tmp", ".opdownload", ".icloud"]
            .iter()
            .any(|ext| lower.ends_with(ext))
}

/// Decide which of `listing` (path, size) should be reported now.
///
/// The first pass over a folder only records what is already there: turning a
/// rule on must not convert years of old files.
pub fn settle(state: &mut FolderState, listing: &[(PathBuf, u64)], now: Instant) -> Vec<PathBuf> {
    let mut ready = Vec::new();
    if !state.primed {
        state.primed = true;
        for (path, size) in listing {
            state.seen.insert(path.clone(), Seen { size: *size, stable_since: now, reported: true });
        }
        return ready;
    }
    for (path, size) in listing {
        match state.seen.get_mut(path) {
            None => {
                state.seen.insert(path.clone(), Seen { size: *size, stable_since: now, reported: false });
            }
            Some(entry) => {
                if entry.size != *size {
                    entry.size = *size;
                    entry.stable_since = now;
                    // A file that changed again after being reported is new work.
                    entry.reported = false;
                } else if !entry.reported && now.duration_since(entry.stable_since) >= SETTLE && *size > 0 {
                    entry.reported = true;
                    ready.push(path.clone());
                }
            }
        }
    }
    state.seen.retain(|path, _| listing.iter().any(|(p, _)| p == path));
    ready.truncate(BURST);
    ready
}

fn list_folder(folder: &Path) -> Vec<(PathBuf, u64)> {
    let Ok(read) = std::fs::read_dir(folder) else { return Vec::new() };
    read.filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if is_ignorable(&name) {
                return None;
            }
            let meta = entry.metadata().ok()?;
            meta.is_file().then(|| (entry.path(), meta.len()))
        })
        .collect()
}

fn load_rules() -> Vec<WatchRule> {
    settings::load()
        .extra
        .get("watchRules")
        .and_then(|v| serde_json::from_value::<Vec<WatchRule>>(v.clone()).ok())
        .unwrap_or_default()
}

/// Start the background poller. Cheap when there are no rules: it just sleeps.
pub fn start(app: AppHandle) {
    std::thread::Builder::new()
        .name("toolbox-watch".into())
        .spawn(move || {
            let mut states: HashMap<String, (String, FolderState)> = HashMap::new();
            loop {
                std::thread::sleep(POLL);
                let rules = load_rules();
                let live: Vec<&WatchRule> = rules.iter().filter(|r| r.enabled).collect();

                // Forget rules that were removed, disabled, or pointed at a new folder.
                states.retain(|id, (folder, _)| live.iter().any(|r| &r.id == id && &r.folder == folder));

                for rule in live {
                    let folder = PathBuf::from(&rule.folder);
                    if !folder.is_dir() {
                        continue;
                    }
                    let entry = states
                        .entry(rule.id.clone())
                        .or_insert_with(|| (rule.folder.clone(), FolderState::default()));
                    let listing = list_folder(&folder);
                    for path in settle(&mut entry.1, &listing, Instant::now()) {
                        let event = WatchEvent {
                            rule_id: rule.id.clone(),
                            action: rule.action.clone(),
                            path: path.to_string_lossy().to_string(),
                            folder: rule.folder.clone(),
                        };
                        let _ = app.emit_to("radial", "radial://watch", event);
                    }
                }
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(name: &str) -> PathBuf {
        PathBuf::from("/watched").join(name)
    }

    #[test]
    fn ignores_partial_and_hidden_files() {
        for name in [".DS_Store", "movie.mp4.crdownload", "x.part", "~$report.docx", "a.tmp", "b.download", "c.icloud"] {
            assert!(is_ignorable(name), "{name}");
        }
        for name in ["photo.heic", "notes.md", "report.pdf"] {
            assert!(!is_ignorable(name), "{name}");
        }
    }

    #[test]
    fn the_first_pass_only_remembers() {
        let t0 = Instant::now();
        let mut s = FolderState::default();
        assert!(settle(&mut s, &[(p("old.jpg"), 10)], t0).is_empty());
        // Even long afterwards, the old file is never reported.
        assert!(settle(&mut s, &[(p("old.jpg"), 10)], t0 + Duration::from_secs(60)).is_empty());
    }

    #[test]
    fn a_new_file_is_reported_once_it_stops_growing() {
        let t0 = Instant::now();
        let mut s = FolderState::default();
        settle(&mut s, &[], t0);

        // It appears, then keeps growing: not ready.
        assert!(settle(&mut s, &[(p("dl.mov"), 100)], t0 + Duration::from_secs(1)).is_empty());
        assert!(settle(&mut s, &[(p("dl.mov"), 900)], t0 + Duration::from_secs(2)).is_empty());
        assert!(settle(&mut s, &[(p("dl.mov"), 1500)], t0 + Duration::from_secs(4)).is_empty());

        // Same size for long enough: reported, exactly once.
        let ready = settle(&mut s, &[(p("dl.mov"), 1500)], t0 + Duration::from_secs(8));
        assert_eq!(ready, vec![p("dl.mov")]);
        assert!(settle(&mut s, &[(p("dl.mov"), 1500)], t0 + Duration::from_secs(12)).is_empty());
    }

    #[test]
    fn an_empty_file_waits_for_content() {
        let t0 = Instant::now();
        let mut s = FolderState::default();
        settle(&mut s, &[], t0);
        settle(&mut s, &[(p("new.txt"), 0)], t0 + Duration::from_secs(1));
        assert!(settle(&mut s, &[(p("new.txt"), 0)], t0 + Duration::from_secs(9)).is_empty());
    }

    #[test]
    fn a_file_rewritten_after_being_reported_is_reported_again() {
        let t0 = Instant::now();
        let mut s = FolderState::default();
        settle(&mut s, &[], t0);
        settle(&mut s, &[(p("a.png"), 10)], t0 + Duration::from_secs(1));
        assert_eq!(settle(&mut s, &[(p("a.png"), 10)], t0 + Duration::from_secs(5)).len(), 1);
        settle(&mut s, &[(p("a.png"), 99)], t0 + Duration::from_secs(6));
        assert_eq!(settle(&mut s, &[(p("a.png"), 99)], t0 + Duration::from_secs(10)).len(), 1);
    }

    #[test]
    fn removed_files_are_forgotten() {
        let t0 = Instant::now();
        let mut s = FolderState::default();
        settle(&mut s, &[(p("gone.jpg"), 5)], t0);
        settle(&mut s, &[], t0 + Duration::from_secs(1));
        assert!(s.seen.is_empty());
    }

    #[test]
    fn rules_parse_with_defaults() {
        let rule: WatchRule =
            serde_json::from_str(r#"{"id":"r1","folder":"/Users/me/Downloads","action":"convert:jpg"}"#).unwrap();
        assert!(rule.enabled);
    }
}

//! Decoding of `RunEvent::Opened` URLs: Finder's Open With and Dock drops arrive as
//! `file://` URLs; automation, Shortcuts, the Quick Action and the tests use `toolbox://`.
//!
//! ```text
//! toolbox://radial?path=/a/b.png&path=/c/d.pdf[&intent=ring][&folder=/x][&trigger=service][&list=/file]
//! toolbox://note                 → create:markdown
//! toolbox://record               → record
//! toolbox://new                  → create:text
//! toolbox://open?route=/settings → show the main window on that route
//! ```

use super::Trigger;
use url::Url;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct OpenRequest {
    pub paths: Vec<String>,
    pub intent: Option<String>,
    pub folder: Option<String>,
    pub trigger: Option<Trigger>,
    /// A file with one path per line (the Quick Action's hand-off), resolved by the caller.
    pub list: Option<String>,
    /// `toolbox://open?route=…`: not a ring at all, navigate the main window.
    pub route: Option<String>,
    pub at: Option<(f64, f64)>,
}

fn intent_for_host(host: &str) -> Option<&'static str> {
    Some(match host {
        "radial" => "ring",
        "note" => "create:markdown",
        "record" => "record",
        "new" => "create:text",
        _ => return None,
    })
}

/// Merge every URL of one event into a single request, or `None` if nothing was ours.
pub fn parse_opened(urls: &[Url]) -> Option<OpenRequest> {
    let mut req = OpenRequest::default();
    let mut any = false;
    for url in urls {
        match url.scheme() {
            "file" => {
                if let Ok(path) = url.to_file_path() {
                    req.paths.push(path.to_string_lossy().to_string());
                    any = true;
                }
            }
            "toolbox" => {
                let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
                if host == "open" {
                    req.route = url.query_pairs().find(|(k, _)| k == "route").map(|(_, v)| v.to_string());
                    any = true;
                    continue;
                }
                let Some(default_intent) = intent_for_host(&host) else { continue };
                any = true;
                req.intent.get_or_insert_with(|| default_intent.to_string());
                let (mut x, mut y) = (None, None);
                for (key, value) in url.query_pairs() {
                    match key.as_ref() {
                        "path" if !value.is_empty() => req.paths.push(value.to_string()),
                        "intent" if !value.is_empty() => req.intent = Some(value.to_string()),
                        "folder" if !value.is_empty() => req.folder = Some(value.to_string()),
                        "list" if !value.is_empty() => req.list = Some(value.to_string()),
                        "trigger" => {
                            req.trigger = match value.as_ref() {
                                "service" => Some(Trigger::Service),
                                _ => Some(Trigger::Url),
                            }
                        }
                        "x" => x = value.parse::<f64>().ok(),
                        "y" => y = value.parse::<f64>().ok(),
                        _ => {}
                    }
                }
                if let (Some(x), Some(y)) = (x, y) {
                    req.at = Some((x, y));
                }
            }
            _ => {}
        }
    }
    any.then_some(req)
}

/// Read the Quick Action's hand-off file. Only files inside `allowed_dir` are
/// honoured (a URL must never be able to make us read an arbitrary file), and the
/// file is deleted once read.
pub fn read_list_file(list: &str, allowed_dir: &std::path::Path) -> Vec<String> {
    let Ok(canonical) = std::fs::canonicalize(list) else { return Vec::new() };
    let Ok(allowed) = std::fs::canonicalize(allowed_dir) else { return Vec::new() };
    if !canonical.starts_with(&allowed) {
        return Vec::new();
    }
    let text = std::fs::read_to_string(&canonical).unwrap_or_default();
    let _ = std::fs::remove_file(&canonical);
    text.lines().map(str::trim).filter(|l| l.starts_with('/')).map(str::to_string).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn urls(raw: &[&str]) -> Vec<Url> {
        raw.iter().map(|s| Url::parse(s).unwrap()).collect()
    }

    #[test]
    fn file_urls_become_paths_with_percent_decoding() {
        let r = parse_opened(&urls(&["file:///Users/a/My%20Photo.heic", "file:///tmp/b.pdf"])).unwrap();
        assert_eq!(r.paths, vec!["/Users/a/My Photo.heic", "/tmp/b.pdf"]);
        assert!(r.intent.is_none());
    }

    #[test]
    fn radial_url_collects_repeated_path_params() {
        let r = parse_opened(&urls(&["toolbox://radial?path=/a/b.png&path=/c/d%20e.pdf&folder=/x"])).unwrap();
        assert_eq!(r.paths, vec!["/a/b.png", "/c/d e.pdf"]);
        assert_eq!(r.folder.as_deref(), Some("/x"));
        assert_eq!(r.intent.as_deref(), Some("ring"));
    }

    #[test]
    fn short_hosts_imply_an_intent_and_explicit_intent_wins() {
        assert_eq!(parse_opened(&urls(&["toolbox://note"])).unwrap().intent.as_deref(), Some("create:markdown"));
        assert_eq!(parse_opened(&urls(&["toolbox://record"])).unwrap().intent.as_deref(), Some("record"));
        assert_eq!(parse_opened(&urls(&["toolbox://new"])).unwrap().intent.as_deref(), Some("create:text"));
        let r = parse_opened(&urls(&["toolbox://radial?intent=paste"])).unwrap();
        assert_eq!(r.intent.as_deref(), Some("paste"));
    }

    #[test]
    fn service_trigger_and_list_are_recognised() {
        let r = parse_opened(&urls(&["toolbox://radial?trigger=service&list=/tmp/x/sel.txt"])).unwrap();
        assert_eq!(r.trigger, Some(Trigger::Service));
        assert_eq!(r.list.as_deref(), Some("/tmp/x/sel.txt"));
    }

    #[test]
    fn position_needs_both_coordinates() {
        assert_eq!(parse_opened(&urls(&["toolbox://radial?x=10.5&y=20"])).unwrap().at, Some((10.5, 20.0)));
        assert_eq!(parse_opened(&urls(&["toolbox://radial?x=10"])).unwrap().at, None);
    }

    #[test]
    fn open_route_is_not_a_ring() {
        let r = parse_opened(&urls(&["toolbox://open?route=/settings"])).unwrap();
        assert_eq!(r.route.as_deref(), Some("/settings"));
        assert!(r.paths.is_empty());
    }

    #[test]
    fn unrelated_schemes_and_unknown_hosts_are_ignored() {
        assert!(parse_opened(&urls(&["https://example.com/a", "toolbox://bogus"])).is_none());
        assert!(parse_opened(&[]).is_none());
    }

    #[test]
    fn list_file_must_live_in_the_allowed_directory() {
        let base = std::env::temp_dir().join(format!("toolbox-urls-{}", uuid::Uuid::new_v4().simple()));
        let allowed = base.join("allowed");
        let elsewhere = base.join("elsewhere");
        std::fs::create_dir_all(&allowed).unwrap();
        std::fs::create_dir_all(&elsewhere).unwrap();
        let good = allowed.join("sel.txt");
        std::fs::write(&good, "/a/b.txt\n  /c d/e.png \nnot-absolute\n\n").unwrap();
        let bad = elsewhere.join("sel.txt");
        std::fs::write(&bad, "/secret\n").unwrap();

        assert!(read_list_file(bad.to_str().unwrap(), &allowed).is_empty());
        assert!(bad.exists(), "a refused file must be left alone");
        assert_eq!(read_list_file(good.to_str().unwrap(), &allowed), vec!["/a/b.txt", "/c d/e.png"]);
        assert!(!good.exists(), "the hand-off file is consumed");
        std::fs::remove_dir_all(&base).ok();
    }
}

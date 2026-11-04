//! The Finder Quick Action: an Automator "Quick Action" bundle in `~/Library/Services`
//! that hands the selected files to Toolbox. It shows up under Finder ▸ right-click ▸
//! Quick Actions (and in the Services menu), and can be given a keyboard shortcut in
//! System Settings ▸ Keyboard ▸ Keyboard Shortcuts ▸ Services.
//!
//! The workflow's shell script writes the selection into a small hand-off file under
//! the app's cache folder and opens `toolbox://radial?trigger=service&list=<file>`.
//! Going through a file (instead of encoding every path in the URL) keeps unusual file
//! names intact; the URL handler only reads files inside the cache folder.

use crate::error::{AppError, AppResult, ErrorKind};
use std::path::PathBuf;

pub const WORKFLOW_NAME: &str = "Open in Toolbox.workflow";
const MENU_TITLE: &str = "Open in Toolbox";

/// What Automator runs: arguments are the selected files' paths.
pub const SCRIPT: &str = r#"dir="$HOME/Library/Caches/app.toolbox.desktop"
list="$dir/service-selection.txt"
mkdir -p "$dir"
: > "$list"
for item in "$@"; do
  printf '%s\n' "$item" >> "$list"
done
/usr/bin/open "toolbox://radial?trigger=service&list=${list// /%20}"
"#;

pub fn services_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join("Library/Services")
}

pub fn workflow_path() -> PathBuf {
    services_dir().join(WORKFLOW_NAME)
}

pub fn installed() -> bool {
    workflow_path().join("Contents/document.wflow").is_file()
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

const PLIST_HEAD: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
"#;

/// `Contents/Info.plist`: declares the Service so Finder lists it.
pub fn info_plist() -> String {
    format!(
        r#"{PLIST_HEAD}<dict>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSBackgroundColorName</key>
			<string>background</string>
			<key>NSIconName</key>
			<string>NSActionTemplate</string>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>{title}</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSRequiredContext</key>
			<dict>
				<key>NSApplicationIdentifier</key>
				<string>com.apple.finder</string>
			</dict>
			<key>NSSendFileTypes</key>
			<array>
				<string>public.item</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
"#,
        title = xml_escape(MENU_TITLE)
    )
}

fn argument(index: u8, name: &str, default_value: &str) -> String {
    format!(
        "\t\t\t\t\t<key>{index}</key>\n\t\t\t\t\t<dict>\n\t\t\t\t\t\t<key>default value</key>\n\t\t\t\t\t\t{default_value}\n\t\t\t\t\t\t<key>name</key>\n\t\t\t\t\t\t<string>{name}</string>\n\t\t\t\t\t\t<key>required</key>\n\t\t\t\t\t\t<string>0</string>\n\t\t\t\t\t\t<key>type</key>\n\t\t\t\t\t\t<string>0</string>\n\t\t\t\t\t\t<key>uuid</key>\n\t\t\t\t\t\t<string>{index}</string>\n\t\t\t\t\t</dict>\n"
    )
}

/// `Contents/document.wflow`: one "Run Shell Script" action fed with the Finder
/// selection as arguments.
pub fn workflow_plist(script: &str) -> String {
    let arguments = [
        argument(0, "inputMethod", "<integer>0</integer>"),
        argument(1, "CheckedForUserDefaultShell", "<false/>"),
        argument(2, "source", "<string></string>"),
        argument(3, "COMMAND_STRING", "<string></string>"),
        argument(4, "shell", "<string>/bin/bash</string>"),
    ]
    .concat();
    format!(
        r#"{PLIST_HEAD}<dict>
	<key>AMApplicationBuild</key>
	<string>523</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Optional</key>
					<true/>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>AMActionVersion</key>
				<string>2.0.3</string>
				<key>AMApplication</key>
				<array>
					<string>Automator</string>
				</array>
				<key>AMParameterProperties</key>
				<dict>
					<key>COMMAND_STRING</key>
					<dict/>
					<key>CheckedForUserDefaultShell</key>
					<dict/>
					<key>inputMethod</key>
					<dict/>
					<key>shell</key>
					<dict/>
					<key>source</key>
					<dict/>
				</dict>
				<key>AMProvides</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
					<string>{script}</string>
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>1</integer>
					<key>shell</key>
					<string>/bin/bash</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>6F1B7E2A-3C54-4B7C-9D21-0A5E8C1D4F01</string>
				<key>Keywords</key>
				<array>
					<string>Shell</string>
					<string>Script</string>
					<string>Command</string>
					<string>Run</string>
					<string>Unix</string>
				</array>
				<key>OutputUUID</key>
				<string>B2D94C60-8E1F-4A37-A6C5-7D3F9E0B2A02</string>
				<key>UUID</key>
				<string>D84A1F35-5B2E-4C98-8F70-1E6C3A9D7B03</string>
				<key>UnlocalizedApplications</key>
				<array>
					<string>Automator</string>
				</array>
				<key>arguments</key>
				<dict>
{arguments}				</dict>
				<key>isViewVisible</key>
				<integer>1</integer>
				<key>location</key>
				<string>309.000000:305.000000</string>
				<key>nibPath</key>
				<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
			</dict>
			<key>isViewVisible</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>applicationBundleIDsByPath</key>
		<dict/>
		<key>applicationPaths</key>
		<array/>
		<key>inputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>outputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>presentationMode</key>
		<integer>15</integer>
		<key>processesInput</key>
		<integer>0</integer>
		<key>serviceApplicationBundleID</key>
		<string>com.apple.finder</string>
		<key>serviceApplicationPath</key>
		<string>/System/Library/CoreServices/Finder.app</string>
		<key>serviceInputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>serviceOutputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>serviceProcessesInput</key>
		<integer>0</integer>
		<key>systemImageName</key>
		<string>NSActionTemplate</string>
		<key>useAutomaticInputType</key>
		<integer>0</integer>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>
"#,
        script = xml_escape(script),
    )
}

/// Ask the pasteboard server to rescan Services so the new action appears without a
/// logout. Best effort: the action works after the next login regardless.
fn refresh_services() {
    let pbs = "/System/Library/CoreServices/pbs";
    if std::path::Path::new(pbs).exists() {
        let _ = std::process::Command::new(pbs).arg("-update").output();
    }
}

fn io_error(what: &str, e: std::io::Error) -> AppError {
    AppError::with_details(ErrorKind::Io, what.to_string(), e.to_string())
}

/// Write the workflow bundle and return its path.
pub fn install() -> AppResult<PathBuf> {
    let root = workflow_path();
    let contents = root.join("Contents");
    std::fs::create_dir_all(&contents).map_err(|e| io_error("Could not create the Quick Action folder.", e))?;
    std::fs::write(contents.join("Info.plist"), info_plist())
        .map_err(|e| io_error("Could not write the Quick Action.", e))?;
    std::fs::write(contents.join("document.wflow"), workflow_plist(SCRIPT))
        .map_err(|e| io_error("Could not write the Quick Action.", e))?;
    refresh_services();
    Ok(root)
}

pub fn uninstall() -> AppResult<()> {
    let root = workflow_path();
    if root.exists() {
        std::fs::remove_dir_all(&root).map_err(|e| io_error("Could not remove the Quick Action.", e))?;
        refresh_services();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_escaping_survives_xml() {
        let plist = workflow_plist("echo \"a & b\" > /tmp/x < /dev/null");
        assert!(plist.contains("&quot;a &amp; b&quot; &gt; /tmp/x &lt; /dev/null"));
        assert!(!plist.contains("a & b"));
    }

    #[test]
    fn the_real_script_hands_off_through_the_cache_folder() {
        assert!(SCRIPT.contains("toolbox://radial?trigger=service&list="));
        assert!(SCRIPT.contains("app.toolbox.desktop"));
    }

    #[test]
    fn info_plist_targets_finder_and_every_item() {
        let p = info_plist();
        assert!(p.contains("<string>com.apple.finder</string>"));
        assert!(p.contains("<string>public.item</string>"));
        assert!(p.contains("runWorkflowAsService"));
        assert!(p.contains(MENU_TITLE));
    }

    #[test]
    fn workflow_is_a_services_menu_workflow_fed_with_arguments() {
        let p = workflow_plist(SCRIPT);
        assert!(p.contains("com.apple.Automator.servicesMenu"));
        assert!(p.contains("<key>inputMethod</key>\n\t\t\t\t\t<integer>1</integer>"));
        assert!(p.contains("com.apple.RunShellScript"));
    }

    /// `plutil -lint` is the real arbiter of "valid plist" on a Mac.
    #[cfg(target_os = "macos")]
    #[test]
    fn both_plists_pass_plutil() {
        let dir = std::env::temp_dir().join(format!("toolbox-wf-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&dir).unwrap();
        for (name, body) in [("Info.plist", info_plist()), ("document.wflow", workflow_plist(SCRIPT))] {
            let path = dir.join(name);
            std::fs::write(&path, body).unwrap();
            let out = std::process::Command::new("/usr/bin/plutil").arg("-lint").arg(&path).output().unwrap();
            assert!(out.status.success(), "{name}: {}", String::from_utf8_lossy(&out.stdout));
        }
        std::fs::remove_dir_all(&dir).ok();
    }
}

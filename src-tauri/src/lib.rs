//! Toolbox — local-first desktop utilities.
//!
//! Everything here runs on the user's machine. External programs are invoked with
//! explicit argument vectors (never a shell string), inputs are canonicalised
//! before use, and output paths never silently overwrite an existing file.

pub mod binaries;
pub mod cmd;
pub mod error;
pub mod jobs;
pub mod paths;
pub mod radial;
pub mod settings;
pub mod types;
pub mod watch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // The radial overlay is positioned by code, never restored from disk. Whether the main
        // window is shown at launch is decided in `radial::launch_main_window`, not by the
        // visibility it had when the app last quit.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["radial"])
                .with_state_flags(tauri_plugin_window_state::StateFlags::all() - tauri_plugin_window_state::StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![radial::BACKGROUND_FLAG]),
        ))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title("Toolbox");
                }
            }
            // Hidden radial window, global shortcuts, drag trigger, tray, dock policy.
            radial::setup(app.handle())?;
            // The window starts hidden; show it unless this is a quiet login launch.
            radial::launch_main_window(app.handle(), std::env::args().any(|a| a == radial::BACKGROUND_FLAG));
            radial::refresh_launch_agent(app.handle());
            // Watch folders: hand new files to the radial webview.
            watch::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| match window.label() {
            "main" => {
                if let tauri::WindowEvent::Destroyed = event {
                    // Stop any encoder still running when the window goes away.
                    jobs::cancel_all();
                }
                radial::on_main_window_event(window, event);
            }
            radial::window::LABEL => {
                use tauri::Manager as _;
                radial::on_radial_window_event(window.app_handle(), event)
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            // system
            cmd::system::get_settings,
            cmd::system::update_settings,
            cmd::system::check_binaries,
            cmd::system::check_binary,
            cmd::system::cancel_job,
            cmd::system::plan_output,
            cmd::system::ensure_dir,
            cmd::system::reveal_in_finder,
            cmd::system::open_path,
            cmd::system::install_instructions,
            cmd::system::app_paths,
            // files
            cmd::files::inspect_paths,
            cmd::files::expand_paths,
            cmd::files::preview_rename,
            cmd::files::batch_rename,
            cmd::files::analyze_folder,
            cmd::files::flatten_folder,
            cmd::files::organize_folder,
            cmd::files::split_file,
            cmd::files::join_files,
            cmd::files::secure_delete,
            // hashing
            cmd::hashing::hash_files,
            cmd::hashing::hash_text,
            cmd::hashing::find_duplicates,
            // images
            cmd::images::process_images,
            cmd::images::image_info,
            cmd::images::extract_palette,
            cmd::images::pick_color_at,
            cmd::images::contact_sheet,
            cmd::images::generate_favicons,
            cmd::images::split_gif_frames,
            cmd::images::image_to_base64,
            cmd::images::base64_to_image,
            // media
            cmd::media::probe_media,
            cmd::media::process_video,
            cmd::media::video_to_gif,
            cmd::media::extract_frames,
            cmd::media::video_thumbnail,
            cmd::media::preview_frame,
            cmd::media::concat_media,
            cmd::media::generate_silence,
            cmd::media::write_audio_tags,
            cmd::media::extract_cover_art,
            // pdf
            cmd::pdf::pdf_to_images,
            cmd::pdf::pdf_page_preview,
            cmd::pdf::pdf_to_text,
            cmd::pdf::pdf_read_text,
            cmd::pdf::compress_pdf,
            cmd::pdf::encrypt_pdf,
            cmd::pdf::decrypt_pdf,
            cmd::pdf::convert_document,
            cmd::pdf::pandoc_convert,
            cmd::pdf::pdf_info,
            cmd::pdf::pdf_page_count,
            // archives
            cmd::archives::create_archive,
            cmd::archives::extract_archive,
            cmd::archives::list_archive,
            // misc
            cmd::misc::read_metadata,
            cmd::misc::strip_image_metadata,
            cmd::misc::ocr_files,
            cmd::misc::available_ocr_languages,
            cmd::misc::take_screenshot,
            cmd::misc::remote_media_info,
            cmd::misc::download_media,
            // quick (radial menu helpers)
            cmd::quick::create_text_file,
            cmd::quick::create_folder,
            cmd::quick::trash_paths,
            cmd::quick::duplicate_paths,
            cmd::quick::move_paths,
            cmd::quick::copy_paths_to_clipboard,
            cmd::quick::reveal_many,
            cmd::quick::open_with,
            cmd::quick::quick_look,
            cmd::quick::quick_look_close,
            cmd::quick::set_desktop_picture,
            cmd::quick::paste_clipboard_as_file,
            cmd::quick::clipboard_summary,
            cmd::quick::file_icon,
            cmd::quick::file_thumbnail,
            cmd::quick::read_text_file,
            cmd::quick::default_folders,
            // radial (native layer)
            radial::commands::radial_show,
            radial::commands::radial_hide,
            radial::commands::radial_ready,
            radial::commands::radial_suspend_shortcuts,
            radial::commands::radial_release_focus,
            radial::commands::radial_set_layout,
            radial::commands::radial_last_open,
            radial::commands::radial_status,
            radial::commands::install_finder_action,
            radial::commands::uninstall_finder_action,
            radial::commands::open_in_main,
            radial::commands::open_privacy_pane,
            radial::commands::request_automation_permission,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Toolbox");

    app.run(|handle, event| radial::on_run_event(handle, &event));
}

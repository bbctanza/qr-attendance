//! Kiosk shell.
//!
//! Deliberately thin: everything the kiosk *does* — scanning, auth, the offline queue — lives
//! in TypeScript (PLAN.md section 2). Rust is here only for the things a webview cannot do:
//! start with the machine, and hold fullscreen at the OS level rather than at the mercy of a
//! browser keybinding.

mod secrets;

use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Start-on-boot. Registered unconditionally so the frontend can turn it on and off at
        // runtime; `--minimized` keeps a cold boot from stealing focus before the shell is up.
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete
        ])
        .setup(|app| {
            // The window is created hidden (see tauri.conf.json) and shown here, once the
            // webview has something to paint. Without this a cold start flashes an empty white
            // frame for a few hundred milliseconds — the "boot splash" problem in PLAN.md 5.6,
            // solved by not showing a half-built window rather than by drawing a splash over it.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

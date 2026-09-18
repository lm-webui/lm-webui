use std::{thread, time::Duration};

use tauri::{Url, WebviewUrl, WebviewWindowBuilder};

// The backend is installed natively, not bundled: install.sh lays it down in ~/.lmwebui and
// registers a launchd/systemd service that binds this port with KeepAlive, so it is normally
// already answering by the time this app launches. The app is a shell around that server —
// it neither ships nor spawns a copy, which is what lets the user run the real thing with
// working MLX/llama.cpp instead of a frozen binary.
//
// 127.0.0.1, not "localhost": on macOS /etc/hosts maps localhost to ::1 first, and the
// service binds IPv4 only (uvicorn --host 0.0.0.0), so "localhost" is refused.
const BACKEND_URL: &str = "http://127.0.0.1:7070";
const DEV_URL: &str = "http://localhost:5177";

// Tauri's default window title is "Tauri". It only lasts until a page loads, but that is long
// enough to show in the title bar and the window switcher.
const WINDOW_TITLE: &str = "LM WebUI";

// Same predicate the old in-process wait used: a backend that is up but not yet reporting
// ready still counts, so a slow start does not read as absent.
fn backend_ready() -> bool {
    ureq::get(&format!("{BACKEND_URL}/api/health"))
        .call()
        .map(|r| r.status().as_u16() < 500)
        .unwrap_or(false)
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Dev talks to the Vite server directly; there is no server to wait on.
            if cfg!(debug_assertions) {
                let url: Url = DEV_URL.parse().map_err(|e| format!("Invalid development URL: {e}"))?;
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                    .title(WINDOW_TITLE)
                    .build()?;
                return Ok(());
            }

            let backend: Url = BACKEND_URL.parse().map_err(|e| format!("Invalid backend URL: {e}"))?;

            if backend_ready() {
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(backend))
                    .title(WINDOW_TITLE)
                    .build()?;
                return Ok(());
            }

            // Not answering yet — either mid-start or not installed. Show the bundled status
            // page and swap it for the real UI as soon as the server comes up. The polling
            // lives here rather than in the page because the page is served from the webview's
            // own origin, so its fetch to :7070 would be blocked by CORS.
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title(WINDOW_TITLE)
                .build()?;

            // Detached: the process owns this thread, so it ends when the app does.
            thread::spawn(move || loop {
                if backend_ready() {
                    let _ = window.navigate(backend.clone());
                    return;
                }
                thread::sleep(Duration::from_millis(1000));
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running LM-WebUI desktop application");
}

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Url, WebviewUrl, WebviewWindowBuilder};

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

// How long to wait on the backend before giving up and re-probing. ureq sets NO timeout by
// default, and the poll loop is the only thing keeping the window responsive here: a server
// that accepts the connection and then never answers would pin this thread forever, and the
// app would sit on "Starting the local server…" with no way out.
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);

// The three repairs, as fixed shell commands. JavaScript sends an action NAME and never a
// command string, so nothing from the webview ever reaches a shell — these constants are the
// only strings that do. Keep it that way.
const INSTALL_CMD: &str = "LMWEBUI_INSTALL_APP=0 curl -fsSL https://lmwebui.com/install.sh | bash";
const START_CMD: &str = "\"$LMWEBUI_HOME/lmwebui\" start";
const REPAIR_CMD: &str = "\"$LMWEBUI_HOME/lmwebui\" update";

/// What a probe of the backend found.
#[derive(Debug, PartialEq, Clone, Copy)]
enum Probe {
    /// Answered with an HTML page, so the UI is servable.
    Html,
    /// Answered, but not with the UI: a 4xx/5xx, or a 2xx that is not HTML.
    Answered,
    /// Nothing is listening.
    Refused,
}

/// The situations the window can open into.
#[derive(Debug, PartialEq, Clone, Copy)]
enum State {
    /// Load the app.
    Up,
    /// Something is on the port, but it cannot serve the interface.
    NoUi,
    /// Installed once, not running now.
    NotRunning,
    /// Never installed on this machine.
    NotInstalled,
}

impl State {
    fn as_str(self) -> &'static str {
        match self {
            State::Up => "up",
            State::NoUi => "no_ui",
            State::NotRunning => "not_running",
            State::NotInstalled => "not_installed",
        }
    }
}

/// The whole decision, as a pure function, so it can be tested without a server.
fn state_from(probe: Probe, installed: bool) -> State {
    match probe {
        Probe::Html => State::Up,
        Probe::Answered => State::NoUi,
        Probe::Refused if installed => State::NotRunning,
        Probe::Refused => State::NotInstalled,
    }
}

/// Probe `/` — the page the window is about to load.
///
/// This used to ask `/api/health` and accept any status under 500, which a 404 passes. That is
/// not hypothetical: a server whose install tree had been deleted underneath it went on
/// answering /api/health with 200 from memory while `/` returned JSON, and the window navigated
/// straight into `{"detail":"Not found"}`. Asking for the page we are actually about to load
/// cannot go stale that way, and it needs nothing from the server beyond serving its own UI —
/// so it also works against backends too old to report on themselves.
fn probe() -> Probe {
    let request = ureq::get(&format!("{BACKEND_URL}/"))
        .config()
        .timeout_global(Some(PROBE_TIMEOUT))
        .build();

    match request.call() {
        Ok(resp) => {
            let content_type = resp
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            if content_type.starts_with("text/html") {
                Probe::Html
            } else {
                Probe::Answered
            }
        }
        // It answered, just not with a UI. Covers the JSON 404 above and anything else that
        // happens to be holding the port.
        Err(ureq::Error::StatusCode(_)) => Probe::Answered,
        Err(_) => Probe::Refused,
    }
}

/// Where install.sh and the service unit both put the app. Read LMWEBUI_HOME the same way they
/// do, so the shell still agrees with the installer if the home has been moved.
fn home() -> PathBuf {
    match std::env::var_os("LMWEBUI_HOME") {
        Some(dir) => PathBuf::from(dir),
        None => PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".lmwebui"),
    }
}

fn installed() -> bool {
    home().is_dir()
}

/// An app launched from Finder inherits a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin).
/// install.sh reaches for `uv`, `python3` and `brew`, none of which live there, so hand the
/// child the two directories those install into.
fn child_path() -> String {
    let inherited = std::env::var("PATH").unwrap_or_default();
    format!("/usr/local/bin:/opt/homebrew/bin:{inherited}")
}

// One repair at a time. A second installer racing the first would fight over the same venv.
static FIXING: AtomicBool = AtomicBool::new(false);

/// The current state, for the onboarding page to render. Polled, not pushed, because the page
/// cannot probe the backend itself: it is served from the webview's own origin, which the
/// backend's CORS list does not include.
#[tauri::command]
fn backend_state() -> String {
    state_from(probe(), installed()).as_str().to_string()
}

/// Run one repair, streaming its output to the window as it goes.
///
/// `install.sh` does not merely unpack a tarball: it builds a virtualenv and pip-installs the
/// backend's dependencies, which takes minutes and can fail on the network. Running it blind
/// would leave the user watching a spinner with no way to tell progress from a hang, so the
/// output is the progress.
#[tauri::command]
fn fix_backend(app: AppHandle, action: String) -> Result<(), String> {
    // `install` is also the fallback for the other two, because each of them runs a CLI that
    // lives inside the very tree that might be missing. That is not a hypothetical: it is how
    // the incident these states exist for presented. The install directory had been deleted
    // while its server was still running, so "repair" had no CLI left to run and "start" had
    // nothing to start. Both of those want a full install, which is what they now get.
    let cli = home().join("lmwebui");
    let script = match action.as_str() {
        "install" => INSTALL_CMD,
        "start" if cli.is_file() => START_CMD,
        "repair" if cli.is_file() => REPAIR_CMD,
        "start" | "repair" => INSTALL_CMD,
        other => return Err(format!("unknown action: {other}")),
    };

    if FIXING.swap(true, Ordering::SeqCst) {
        return Err("a repair is already running".into());
    }

    let dir = home();
    // `exec 2>&1` first, so the installer's own diagnostics — where its failures actually are —
    // arrive on the one stream the reader thread watches.
    let mut child = match Command::new("/bin/bash")
        .arg("-c")
        .arg(format!("exec 2>&1; {script}"))
        .env("LMWEBUI_HOME", &dir)
        .env("PATH", child_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            FIXING.store(false, Ordering::SeqCst);
            return Err(format!("could not start the installer: {e}"));
        }
    };

    thread::spawn(move || {
        if let Some(stdout) = child.stdout.take() {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let _ = app.emit("fix-log", line);
            }
        }
        let code = child.wait().ok().and_then(|status| status.code()).unwrap_or(-1);
        FIXING.store(false, Ordering::SeqCst);
        let _ = app.emit("fix-done", code);
    });

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![backend_state, fix_backend])
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

            if probe() == Probe::Html {
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(backend))
                    .title(WINDOW_TITLE)
                    .build()?;
                return Ok(());
            }

            // No UI to load. Open on the onboarding page, which asks backend_state itself to
            // decide what to say, and swap it for the real UI the moment the server can serve
            // it — including while an install is still streaming, so there is no "now reopen
            // the app" step.
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title(WINDOW_TITLE)
                .build()?;

            // Detached: the process owns this thread, so it ends when the app does.
            thread::spawn(move || loop {
                if probe() == Probe::Html {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_served_ui_is_the_only_thing_worth_opening() {
        assert_eq!(state_from(Probe::Html, true), State::Up);
        assert_eq!(state_from(Probe::Html, false), State::Up);
    }

    #[test]
    fn a_server_answering_without_the_ui_is_its_own_state() {
        // The incident this state exists for: /api/health answered 200 from memory while /
        // returned a JSON 404, because the install tree had been deleted under the process.
        assert_eq!(state_from(Probe::Answered, true), State::NoUi);
        assert_eq!(state_from(Probe::Answered, false), State::NoUi);
    }

    #[test]
    fn an_unanswered_port_splits_on_whether_it_was_ever_installed() {
        assert_eq!(state_from(Probe::Refused, true), State::NotRunning);
        assert_eq!(state_from(Probe::Refused, false), State::NotInstalled);
    }
}

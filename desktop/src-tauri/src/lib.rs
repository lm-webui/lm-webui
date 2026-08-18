use std::{fs, path::PathBuf, process::{Child, Command, Stdio}, sync::Mutex, thread, time::Duration};
use tauri::{Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};

struct Backend(Mutex<Option<Child>>);

fn data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn start_backend(app: &tauri::AppHandle) -> Result<(Child, u16), String> {
    let port = portpicker::pick_unused_port().ok_or("No free localhost port available")?;
    let root = data_root(app)?;
    for name in ["data", "media", "models", "secrets", "logs"] {
        fs::create_dir_all(root.join(name)).map_err(|e| e.to_string())?;
    }

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let binary = resource_dir.join("binaries").join(if cfg!(windows) {
        "lm-webui-backend.exe"
    } else {
        "lm-webui-backend"
    });
    let binary = std::env::var_os("LMWEBUI_BACKEND")
        .map(PathBuf::from)
        .unwrap_or(binary);
    if !binary.exists() {
        return Err(format!("Backend sidecar not found: {}", binary.display()));
    }

    let child = Command::new(binary)
        .current_dir(&resource_dir)
        .env("APP_ENVIRONMENT", "production")
        .env("APP_SERVER_HOST", "127.0.0.1")
        .env("APP_SERVER_PORT", port.to_string())
        .env("LMWEBUI_BASE_DIR", &root)
        .env("LMWEBUI_DATA_DIR", root.join("data"))
        .env("LMWEBUI_MEDIA_DIR", root.join("media"))
        .env("LMWEBUI_MODELS_DIR", root.join("models"))
        .env("LMWEBUI_CONFIG_PATH", root.join("config.yaml"))
        .env("LMWEBUI_WEB_DIST", resource_dir.join("web-dist"))
        .env("CORS_ORIGINS", format!("http://127.0.0.1:{port}"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start backend: {e}"))?;

    Ok((child, port))
}

fn wait_for_backend(port: u16) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{port}/api/health");
    for _ in 0..120 {
        if let Ok(response) = ureq::get(&url).call() {
            if response.status().as_u16() < 500 {
                return Ok(());
            }
        }
        thread::sleep(Duration::from_millis(250));
    }
    Err(format!("Backend did not become ready at {url}"))
}

pub fn run() {
    tauri::Builder::default()
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) && std::env::var_os("LMWEBUI_BACKEND").is_none() {
                let url: Url = "http://localhost:5177"
                    .parse()
                    .map_err(|e| format!("Invalid development URL: {e}"))?;
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url)).build()?;
                return Ok(());
            }
            let (child, port) = start_backend(app.handle())?;
            wait_for_backend(port)?;
            *app.state::<Backend>().0.lock().map_err(|_| "Backend lock poisoned")? = Some(child);
            let url: Url = format!("http://127.0.0.1:{port}").parse().map_err(|e| format!("Invalid backend URL: {e}"))?;
            let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url)).build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building LM-WebUI desktop application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Ok(mut backend) = app.state::<Backend>().0.lock() {
                    if let Some(mut child) = backend.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        });
}

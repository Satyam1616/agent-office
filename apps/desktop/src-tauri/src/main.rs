// No console window next to the app on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const DEFAULT_PORT: u16 = 4747;

/// The collector sidecar we started, killed when the app exits.
struct Collector(Mutex<Option<CommandChild>>);

/// True if an Agent Office collector answers on this port.
fn healthy(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut s) = TcpStream::connect_timeout(&addr, Duration::from_millis(300)) else {
        return false;
    };
    let _ = s.set_read_timeout(Some(Duration::from_millis(1000)));
    if s
        .write_all(b"GET /api/health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut body = String::new();
    let _ = s.read_to_string(&mut body);
    body.contains("\"ok\":true")
}

/// 4747 when free (keeps the page origin, and so saved settings, stable), else any free port.
fn pick_port() -> u16 {
    let bind = |p| TcpListener::bind(("127.0.0.1", p)).ok();
    if bind(DEFAULT_PORT).is_some() {
        return DEFAULT_PORT;
    }
    bind(0)
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(DEFAULT_PORT)
}

fn spawn_collector(app: &tauri::App, port: u16) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let web = app.path().resource_dir()?.join("web");
    let data = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data)?;
    let (mut rx, child) = app
        .shell()
        .sidecar("agent-office-collector")?
        .env("PORT", port.to_string())
        .env("WEB_DIR", web)
        .env("DB_PATH", data.join("agent-office.db"))
        .spawn()?;
    // The output channel is bounded: keep draining it or the collector blocks on stdout.
    tauri::async_runtime::spawn(async move {
        while let Some(ev) = rx.recv().await {
            match ev {
                CommandEvent::Stdout(l) | CommandEvent::Stderr(l) => {
                    println!("{}", String::from_utf8_lossy(&l).trim_end())
                }
                CommandEvent::Terminated(t) => println!("[collector] exited: {:?}", t.code),
                _ => {}
            }
        }
    });
    Ok(child)
}

fn main() {
    // WebKitGTK's DMA-BUF renderer shows a blank window on some GPUs/drivers (and WSLg).
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Collector(Mutex::new(None)))
        .setup(|app| {
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Agent Office")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .build()?;

            // Reuse a collector that is already running (e.g. `bun run dev` inside WSL).
            let port = if healthy(DEFAULT_PORT) {
                DEFAULT_PORT
            } else {
                let port = pick_port();
                let child = spawn_collector(app, port)?;
                *app.state::<Collector>().0.lock().unwrap() = Some(child);
                port
            };

            std::thread::spawn(move || {
                let deadline = Instant::now() + Duration::from_secs(30);
                while !healthy(port) && Instant::now() < deadline {
                    sleep(Duration::from_millis(200));
                }
                if !healthy(port) {
                    let _ = window.eval(
                        "document.body.innerText = 'The collector did not start. Is port 4747 blocked?'",
                    );
                    return;
                }
                let url = format!("http://127.0.0.1:{port}/");
                if let Ok(url) = url.parse() {
                    let _ = window.navigate(url);
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while starting Agent Office")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(child) = app.state::<Collector>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}

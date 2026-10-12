// No console window next to the app on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const DEFAULT_PORT: u16 = 4747;
/// Passed by the autostart entry: start in the tray without showing the window.
const HIDDEN_ARG: &str = "--hidden";

/// The collector sidecar we started, killed when the app exits.
struct Collector(Mutex<Option<CommandChild>>);

/// Close button hides to the tray instead of quitting (user setting, only if the tray exists).
struct Tray {
    available: AtomicBool,
    close_to_tray: AtomicBool,
    hinted: AtomicBool,
}

#[tauri::command]
fn set_close_to_tray(enabled: bool, tray: tauri::State<Tray>) {
    println!("[desktop] close to tray: {enabled}");
    tray.close_to_tray.store(enabled, Ordering::Relaxed);
}

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

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Agent Office", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Agent Office")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = e
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn main() {
    // WebKitGTK's DMA-BUF renderer shows a blank window on some GPUs/drivers (and WSLg).
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        // Must come first: a second launch just brings the running window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .manage(Collector(Mutex::new(None)))
        .manage(Tray {
            available: AtomicBool::new(false),
            close_to_tray: AtomicBool::new(true),
            hinted: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![set_close_to_tray])
        .setup(|app| {
            let hidden = std::env::args().any(|a| a == HIDDEN_ARG);
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Agent Office")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .visible(!hidden)
                .build()?;

            // Without a tray (e.g. no appindicator on Linux) closing must really quit.
            match build_tray(app) {
                Ok(()) => app.state::<Tray>().available.store(true, Ordering::Relaxed),
                Err(e) => eprintln!("[desktop] no tray icon: {e}"),
            }

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
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let tray = window.state::<Tray>();
                if !tray.available.load(Ordering::Relaxed) || !tray.close_to_tray.load(Ordering::Relaxed) {
                    return;
                }
                api.prevent_close();
                let _ = window.hide();
                // Say once per run where the window went.
                if !tray.hinted.swap(true, Ordering::Relaxed) {
                    let _ = window
                        .notification()
                        .builder()
                        .title("Agent Office is still running")
                        .body("It keeps watching your agents from the tray. Right-click the tray icon to quit.")
                        .show();
                }
            }
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

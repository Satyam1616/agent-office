/// Android viewer: a connect screen (bundled) that hands the webview over to a hub,
/// i.e. a computer running Agent Office with phone access turned on.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_notification::init());
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    builder
        .run(tauri::generate_context!())
        .expect("error while starting Agent Office");
}

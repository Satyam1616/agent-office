fn main() {
    // The office page is a remote origin to Tauri, so even our own commands go through the ACL.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["set_close_to_tray"])),
    )
    .expect("failed to run tauri-build");
}

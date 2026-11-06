; Agent Office closes to the system tray by default, so the app is often still running when
; someone installs an update. The collector is a separate sidecar process, and Tauri's own
; NSIS template only stops the main binary, so the installer then fails with:
;
;   Error opening file for writing: ...\AppData\Local\Agent Office\agent-office-collector.exe
;
; Stop the sidecar ourselves before any file is touched. This also covers a collector left
; orphaned by an app that was force-killed rather than quit from the tray.

!macro STOP_COLLECTOR
  ; /T also takes down anything the collector spawned. A missing process is not an error here.
  nsExec::Exec 'taskkill /F /T /IM agent-office-collector.exe'
  Pop $0
  ; Windows releases the file handle a moment after the process dies.
  Sleep 500
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro STOP_COLLECTOR
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro STOP_COLLECTOR
!macroend

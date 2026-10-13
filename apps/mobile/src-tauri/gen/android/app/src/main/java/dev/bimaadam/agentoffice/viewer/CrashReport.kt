package dev.bimaadam.agentoffice.viewer

import android.app.Activity
import android.app.ActivityManager
import android.app.AlertDialog
import android.app.ApplicationExitInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.util.Log
import android.widget.Toast
import java.io.File

/**
 * Remembers why the app died last time and shows it on the next launch with a Copy
 * button, so a crash on someone's phone can be reported without adb/logcat.
 * Kotlin/Java crashes are written down as they happen; native ones (e.g. inside the
 * camera or ML Kit libraries) come from Android's own record of the last exit.
 */
object CrashReport {
  private const val FILE = "last-crash.txt"
  private const val MAX_CHARS = 6000

  fun install(context: Context) {
    val file = File(context.filesDir, FILE)
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      runCatching { file.writeText("${header()}\nthread: ${thread.name}\n\n${Log.getStackTraceString(error)}") }
      previous?.uncaughtException(thread, error)
    }
  }

  fun showIfAny(activity: Activity) {
    val file = File(activity.filesDir, FILE)
    val report = (if (file.exists()) file.readText() else null) ?: lastNativeCrash(activity) ?: return
    file.delete()
    val text = report.take(MAX_CHARS)
    AlertDialog.Builder(activity)
      .setTitle("Agent Office crashed last time")
      .setMessage(text)
      .setPositiveButton("Copy") { _, _ ->
        val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Agent Office crash", text))
        Toast.makeText(activity, "Copied", Toast.LENGTH_SHORT).show()
      }
      .setNegativeButton("Close", null)
      .show()
  }

  private fun header() =
    "Agent Office ${BuildConfig.VERSION_NAME} · ${Build.MANUFACTURER} ${Build.MODEL} · " +
      "Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT}, ${Build.DISPLAY})"

  /** The previous process exit, if it was a native crash we haven't shown yet (Android 11+). */
  private fun lastNativeCrash(activity: Activity): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
    val am = activity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val exit = am.getHistoricalProcessExitReasons(activity.packageName, 0, 1).firstOrNull() ?: return null
    if (exit.reason != ApplicationExitInfo.REASON_CRASH_NATIVE) return null
    // Each exit is reported once: remember the last one we showed.
    val prefs = activity.getSharedPreferences("crash-report", Context.MODE_PRIVATE)
    if (prefs.getLong("shown", 0) == exit.timestamp) return null
    prefs.edit().putLong("shown", exit.timestamp).apply()
    val trace = runCatching { exit.traceInputStream?.bufferedReader()?.use { it.readText() } }.getOrNull()
    return "${header()}\nnative crash: ${exit.description ?: "-"}\n\n${trace?.take(MAX_CHARS) ?: "(no tombstone)"}"
  }
}

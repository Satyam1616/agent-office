package dev.bimaadam.agentoffice.viewer

import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/** Same dark as the office background, behind the status and navigation bars. */
private val BACKGROUND = Color.parseColor("#0E1117")

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    CrashReport.install(this)
    // The app is always dark: light status/navigation bar icons.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)

    // Android 15+ draws apps edge-to-edge and WebView doesn't report safe areas reliably,
    // so keep the whole webview clear of the system bars, the camera cutout and the keyboard.
    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(BACKGROUND)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
      WindowInsetsCompat.CONSUMED
    }

    CrashReport.showIfAny(this)
  }
}

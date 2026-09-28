package expo.modules.aegisfilter

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JS bridge.
 *
 * Deliberately thin: consent, start, stop, and a status read. Policy lives on the
 * server and the datapath lives in the service, so there is nothing for this to
 * decide.
 */
class AegisFilterModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("AegisFilter")

    Events("onRevoked")

    /**
     * Has the user granted VPN consent?
     *
     * Android shows a system dialog the first time, which only an Activity can
     * launch — so this reports the state and `requestPermission` does the asking.
     */
    Function("hasPermission") {
      VpnService.prepare(context) == null
    }

    /**
     * Asks for consent, resolving true if it is already granted.
     *
     * The dialog is deliberately not wrapped in a promise that waits for the
     * user's answer: the result arrives as an Activity result, and JS should
     * re-read `hasPermission` after the app returns to the foreground rather than
     * hold a promise across a context switch.
     */
    AsyncFunction("requestPermission") {
      val intent = VpnService.prepare(context)
        ?: return@AsyncFunction true

      val activity: Activity = appContext.currentActivity
        ?: throw CodedException(
          "ERR_NO_ACTIVITY",
          "Cannot ask for VPN consent while the app is in the background.",
          null,
        )
      activity.startActivityForResult(intent, VPN_CONSENT_REQUEST)
      false
    }

    /**
     * Starts filtering.
     *
     * `blocklistPath` is a compiled artifact already on disk — the module does
     * not fetch it, because downloading, ETag handling and caching belong with
     * the rest of the app's networking, not in a native module.
     */
    AsyncFunction("start") { blocklistPath: String, upstream: String? ->
      if (VpnService.prepare(context) != null) {
        throw CodedException("ERR_NO_CONSENT", "VPN consent has not been granted.", null)
      }
      val intent = Intent(context, AegisVpnService::class.java).apply {
        putExtra(AegisVpnService.EXTRA_BLOCKLIST_PATH, blocklistPath)
        upstream?.let { putExtra(AegisVpnService.EXTRA_UPSTREAM, it) }
      }
      context.startForegroundService(intent)
      true
    }

    AsyncFunction("stop") {
      context.startService(
        Intent(context, AegisVpnService::class.java).setAction(AegisVpnService.ACTION_STOP),
      )
      true
    }

    /**
     * Current state.
     *
     * `blockedCount` is a number and nothing else: it is what gets reported to
     * the backend, which has no column for a domain and rejects any body field
     * beyond a date and a count.
     */
    Function("status") {
      mapOf(
        "running" to AegisVpnService.running.get(),
        "revoked" to AegisVpnService.revoked.get(),
        "blockedCount" to AegisVpnService.blockedCount.get(),
      )
    }
  }

  private val context
    get() = requireNotNull(appContext.reactContext) { "no React context" }

  private companion object {
    const val VPN_CONSENT_REQUEST = 0x41_45_47
  }
}

import ExpoModulesCore

/**
 * iOS: not implemented, and saying so.
 *
 * Filtering on iOS needs an NEPacketTunnelProvider — a loopback VPN, the same
 * shape as the Android VpnService, and the only mechanism that keeps filtering
 * on the device as the app's privacy copy promises. (NEDNSSettingsManager would
 * be far less work but points the OS at a *remote* resolver, which would make
 * "Aegis never sees the pages you open" false.)
 *
 * It is not built because the Network Extension entitlement requires a paid
 * Apple Developer Program membership — a free Personal Team cannot load the
 * extension at all — and App Store distribution of a VPN-class app additionally
 * requires Organization enrolment.
 *
 * These throw rather than returning falsely reassuring values. A stub that
 * reported `running: true` would put "Protection is on" in front of someone
 * whose phone was filtering nothing, which is the one failure this product
 * cannot afford.
 */
public class AegisFilterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AegisFilter")

    Events("onRevoked")

    Function("hasPermission") { () -> Bool in
      false
    }

    AsyncFunction("requestPermission") { () -> Bool in
      throw Exception(
        name: "ERR_NOT_IMPLEMENTED",
        description: "iOS filtering needs an NEPacketTunnelProvider, which is not built yet."
      )
    }

    AsyncFunction("start") { (_: String, _: String?) -> Bool in
      throw Exception(
        name: "ERR_NOT_IMPLEMENTED",
        description: "iOS filtering needs an NEPacketTunnelProvider, which is not built yet."
      )
    }

    AsyncFunction("stop") { () -> Bool in
      false
    }

    Function("status") { () -> [String: Any] in
      ["running": false, "revoked": false, "blockedCount": 0]
    }
  }
}

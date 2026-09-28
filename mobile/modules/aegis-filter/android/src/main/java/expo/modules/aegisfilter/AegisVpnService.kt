package expo.modules.aegisfilter

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * On-device DNS filtering, as a VpnService.
 *
 * WHY A VPN AT ALL. Android gives an ordinary app no way to see DNS queries
 * except by holding the VPN slot. Nothing leaves the device: this is a loopback
 * tunnel whose only purpose is to put our code in front of the resolver. The
 * app's privacy screen promises "filtering happens on the device" and "Aegis
 * never sees the pages you open", and this is the only Android mechanism that
 * keeps that literally true.
 *
 * THE ONE DESIGN DECISION THAT MATTERS. We route *only the DNS server address*
 * into the tunnel, not the default route. `addDnsServer(10.111.0.1)` plus
 * `addRoute` for that single address means DNS packets arrive here and every
 * other byte the phone sends takes its normal path, untouched. A full-tunnel VPN
 * would mean reading, reassembling and re-emitting all traffic — vastly more
 * code, more battery, more to go wrong, and a much larger claim to make about
 * what we can see. This is the smallest tunnel that does the job.
 *
 * STATUS: written against the Android and Expo SDK 57 docs, but NOT yet compiled
 * or run — no JDK or Android SDK on the machine it was authored on. The pure
 * logic it depends on (CompiledBlocklist, DnsPacket) is pinned by
 * ConformanceTest against vectors from the tested TypeScript. The datapath below
 * is the part that needs a device before anyone should trust it; the UDP checksum
 * choice in `writeReply` is the most likely thing to need adjusting.
 */
class AegisVpnService : VpnService() {

  companion object {
    private const val TAG = "AegisVpn"

    /** Where the tunnel lives. Link-local-ish and unlikely to collide. */
    private const val TUN_ADDRESS = "10.111.0.2"
    private const val TUN_DNS = "10.111.0.1"
    private const val TUN_PREFIX = 32
    private const val MTU = 1500

    private const val CHANNEL_ID = "aegis.protection"
    private const val NOTIFICATION_ID = 1

    const val EXTRA_BLOCKLIST_PATH = "blocklistPath"
    const val EXTRA_UPSTREAM = "upstream"
    const val ACTION_STOP = "expo.modules.aegisfilter.STOP"

    private const val DEFAULT_UPSTREAM = "1.1.1.1"
    private const val UPSTREAM_TIMEOUT_MS = 3_000

    /** Set while the tunnel is up, so the module can answer without binding. */
    val running = AtomicBoolean(false)

    /** Blocks since the service started. Reported upward as a count only. */
    val blockedCount = AtomicInteger(0)

    /** Set when another VPN displaced us — the Android form of a bypass. */
    val revoked = AtomicBoolean(false)
  }

  private var tunnel: ParcelFileDescriptor? = null
  private var pump: Thread? = null
  private var blocklist: CompiledBlocklist = CompiledBlocklist.empty()
  private var upstream: InetAddress = InetAddress.getByName(DEFAULT_UPSTREAM)

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stop()
      return START_NOT_STICKY
    }

    intent?.getStringExtra(EXTRA_BLOCKLIST_PATH)?.let { path ->
      blocklist = try {
        CompiledBlocklist.parse(java.io.File(path).readBytes())
      } catch (error: Exception) {
        // Refusing to start beats starting with no rules and reporting success:
        // the user would believe they were protected.
        Log.e(TAG, "blocklist at $path is unusable: ${error.message}")
        stopSelf()
        return START_NOT_STICKY
      }
    }
    intent?.getStringExtra(EXTRA_UPSTREAM)?.let { upstream = InetAddress.getByName(it) }

    startForeground(NOTIFICATION_ID, buildNotification())

    if (running.get()) return START_STICKY
    return if (start()) START_STICKY else START_NOT_STICKY
  }

  private fun start(): Boolean {
    val descriptor = try {
      Builder()
        .setSession("Aegis")
        .addAddress(TUN_ADDRESS, TUN_PREFIX)
        // The whole trick: claim the DNS server, and route only it.
        .addDnsServer(TUN_DNS)
        .addRoute(TUN_DNS, 32)
        .setMtu(MTU)
        .setBlocking(true)
        .also { builder ->
          // Our own traffic must not re-enter the tunnel, or forwarding a query
          // upstream would loop back into us.
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setMetered(false)
          }
          runCatching { builder.addDisallowedApplication(packageName) }
        }
        .establish()
    } catch (error: Exception) {
      Log.e(TAG, "could not establish the tunnel", error)
      null
    }

    if (descriptor == null) {
      Log.e(TAG, "establish() returned null — permission not granted?")
      return false
    }

    tunnel = descriptor
    revoked.set(false)
    running.set(true)

    pump = Thread({ pumpLoop(descriptor) }, "aegis-dns-pump").apply {
      isDaemon = true
      start()
    }
    Log.i(TAG, "tunnel up, ${blocklist.count} domains, upstream ${upstream.hostAddress}")
    return true
  }

  /**
   * Reads DNS packets off the tunnel and answers them.
   *
   * Single-threaded and blocking on purpose. Only DNS reaches this interface, so
   * the volume is small, and a thread pool here would buy latency we do not need
   * at the cost of ordering bugs we would struggle to reproduce.
   */
  private fun pumpLoop(descriptor: ParcelFileDescriptor) {
    val input = FileInputStream(descriptor.fileDescriptor)
    val output = FileOutputStream(descriptor.fileDescriptor)
    val packet = ByteArray(MTU)

    DatagramSocket().use { forwarder ->
      // Without protect(), our upstream query would be routed back into the
      // tunnel we are currently servicing.
      protect(forwarder)
      forwarder.soTimeout = UPSTREAM_TIMEOUT_MS

      while (running.get()) {
        val length = try {
          input.read(packet)
        } catch (error: Exception) {
          if (running.get()) Log.w(TAG, "tunnel read failed: ${error.message}")
          break
        }
        if (length <= 0) continue

        try {
          handle(packet, length, output, forwarder)
        } catch (error: Exception) {
          // One malformed datagram must never take the tunnel down with it.
          Log.w(TAG, "dropped a packet: ${error.message}")
        }
      }
    }
    Log.i(TAG, "pump stopped")
  }

  private fun handle(
    packet: ByteArray,
    length: Int,
    output: FileOutputStream,
    forwarder: DatagramSocket,
  ) {
    val ip = IpV4Udp.parse(packet, length) ?: return
    val query = try {
      DnsPacket.parseQuestion(ip.payload)
    } catch (error: DnsPacket.Malformed) {
      writeReply(ip, DnsPacket.buildBareError(ip.payload, DnsPacket.RCODE_FORMERR), output)
      return
    }

    if (blocklist.blocks(query.name)) {
      blockedCount.incrementAndGet()
      writeReply(ip, DnsPacket.buildSinkhole(query, ip.payload), output)
      return
    }

    // Allowed: relay verbatim and hand the answer straight back, so unfamiliar
    // record types and DNSSEC survive untouched.
    val request = DatagramPacket(ip.payload, ip.payload.size, upstream, 53)
    forwarder.send(request)
    val buffer = ByteArray(4096)
    val reply = DatagramPacket(buffer, buffer.size)
    forwarder.receive(reply)
    writeReply(ip, buffer.copyOf(reply.length), output)
  }

  /** Wraps a DNS reply in IPv4+UDP with the addresses and ports swapped. */
  private fun writeReply(request: IpV4Udp, dns: ByteArray, output: FileOutputStream) {
    output.write(IpV4Udp.build(request, dns))
    output.flush()
  }

  override fun onRevoke() {
    // Android hands the VPN slot to one app at a time, so this fires when the
    // user starts another VPN. That is the Android shape of the bypass the macOS
    // client watches for, and it is the event an accountability partner cares
    // about — recorded rather than silently swallowed.
    Log.w(TAG, "VPN permission revoked — another VPN took the slot")
    revoked.set(true)
    stop()
    super.onRevoke()
  }

  override fun onDestroy() {
    stop()
    super.onDestroy()
  }

  private fun stop() {
    running.set(false)
    pump?.interrupt()
    pump = null
    runCatching { tunnel?.close() }
    tunnel = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun buildNotification(): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Protection", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shown while content filtering is active."
          setShowBadge(false)
        },
      )
    }

    val open = PendingIntent.getActivity(
      this,
      0,
      packageManager.getLaunchIntentForPackage(packageName) ?: Intent(),
      PendingIntent.FLAG_IMMUTABLE,
    )

    return Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("Protection is on")
      .setContentText("Filtering ${blocklist.count} domains on this device.")
      .setSmallIcon(android.R.drawable.ic_lock_lock)
      .setOngoing(true)
      .setContentIntent(open)
      .build()
  }
}

/**
 * The minimum IPv4/UDP handling needed to answer a query on a tun interface.
 *
 * Only IPv4 is handled. Android delivers IPv6 DNS through the same interface when
 * the network offers it, and that is a known gap: see the TODO in `parse`.
 */
internal data class IpV4Udp(
  val sourceAddress: ByteArray,
  val destinationAddress: ByteArray,
  val sourcePort: Int,
  val destinationPort: Int,
  val payload: ByteArray,
) {
  companion object {
    private const val IP_HEADER_LEN = 20
    private const val UDP_HEADER_LEN = 8
    private const val PROTOCOL_UDP = 17

    fun parse(packet: ByteArray, length: Int): IpV4Udp? {
      if (length < IP_HEADER_LEN + UDP_HEADER_LEN) return null
      val buffer = ByteBuffer.wrap(packet, 0, length).order(ByteOrder.BIG_ENDIAN)

      val versionAndIhl = buffer.get(0).toInt() and 0xFF
      // TODO(ipv6): version 6 arrives here when the network is v6-only. Until it
      // is handled, such queries are dropped rather than mis-parsed — which fails
      // closed for filtering but breaks resolution, so it must be handled before
      // this ships.
      if (versionAndIhl shr 4 != 4) return null

      val headerLength = (versionAndIhl and 0x0F) * 4
      if (headerLength < IP_HEADER_LEN || length < headerLength + UDP_HEADER_LEN) return null
      if ((buffer.get(9).toInt() and 0xFF) != PROTOCOL_UDP) return null

      val sourcePort = buffer.getShort(headerLength).toInt() and 0xFFFF
      val destinationPort = buffer.getShort(headerLength + 2).toInt() and 0xFFFF
      if (destinationPort != 53) return null

      val udpLength = buffer.getShort(headerLength + 4).toInt() and 0xFFFF
      val payloadLength = (udpLength - UDP_HEADER_LEN).coerceAtMost(length - headerLength - UDP_HEADER_LEN)
      if (payloadLength <= 0) return null

      val payloadStart = headerLength + UDP_HEADER_LEN
      return IpV4Udp(
        sourceAddress = packet.copyOfRange(12, 16),
        destinationAddress = packet.copyOfRange(16, 20),
        sourcePort = sourcePort,
        destinationPort = destinationPort,
        payload = packet.copyOfRange(payloadStart, payloadStart + payloadLength),
      )
    }

    /** Builds the reply datagram, addresses and ports reversed. */
    fun build(request: IpV4Udp, dns: ByteArray): ByteArray {
      val total = IP_HEADER_LEN + UDP_HEADER_LEN + dns.size
      val out = ByteBuffer.allocate(total).order(ByteOrder.BIG_ENDIAN)

      out.put(0x45)                       // IPv4, 20-byte header
      out.put(0)                          // DSCP/ECN
      out.putShort(total.toShort())
      out.putShort(0)                     // identification
      out.putShort(0x4000.toShort())      // don't fragment
      out.put(64)                         // TTL
      out.put(PROTOCOL_UDP.toByte())
      out.putShort(0)                     // checksum, filled in below
      out.put(request.destinationAddress) // from the resolver we impersonate
      out.put(request.sourceAddress)      // back to whoever asked

      out.putShort(request.destinationPort.toShort())
      out.putShort(request.sourcePort.toShort())
      out.putShort((UDP_HEADER_LEN + dns.size).toShort())
      // A zero UDP checksum means "not computed", which is legal over IPv4 and
      // which the local stack accepts for packets injected into a tun. Chosen
      // over computing it because the pseudo-header is a classic source of
      // silently-dropped packets — but it is the first thing to revisit if a
      // device drops our replies.
      out.putShort(0)
      out.put(dns)

      val bytes = out.array()
      val checksum = checksum(bytes, 0, IP_HEADER_LEN)
      bytes[10] = (checksum shr 8).toByte()
      bytes[11] = checksum.toByte()
      return bytes
    }

    private fun checksum(data: ByteArray, offset: Int, length: Int): Int {
      var sum = 0
      var i = offset
      while (i < offset + length - 1) {
        sum += ((data[i].toInt() and 0xFF) shl 8) or (data[i + 1].toInt() and 0xFF)
        i += 2
      }
      if (i < offset + length) sum += (data[i].toInt() and 0xFF) shl 8
      while (sum shr 16 != 0) sum = (sum and 0xFFFF) + (sum shr 16)
      return sum.inv() and 0xFFFF
    }
  }
}

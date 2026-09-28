package expo.modules.aegisfilter

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Reads the compiled blocklist the backend serves at `GET /blocklist/compiled`.
 *
 * The artifact is sorted 64-bit FNV-1a hashes, not text. That is the only reason
 * on-device filtering is possible here: 708k domains held as strings measures
 * around 110 MB, while the same set as hashes is 5.4 MB, and a Network Extension
 * or a VpnService has no room for the former.
 *
 * The bytes ARE the index — nothing is parsed or allocated per entry. The buffer
 * is memory-mapped or held once, and a lookup is a handful of binary searches.
 *
 * This must agree byte for byte with the server. `conformance/vectors.json`
 * holds values generated from the TypeScript implementation that has tests;
 * `CompiledBlocklistTest` checks this class against them.
 */
class CompiledBlocklist private constructor(
  private val buffer: ByteBuffer,
  val count: Int,
) {
  companion object {
    /** "AEGB", read little-endian. */
    private const val MAGIC = 0x42474541
    private const val SUPPORTED_VERSION = 1
    private const val HASH_FNV1A64 = 1
    private const val HEADER_BYTES = 12
    private const val ENTRY_BYTES = 8

    private const val FNV_OFFSET_BASIS = -0x340d631b7bdddcdbL // 0xcbf29ce484222325
    private const val FNV_PRIME = 0x100000001b3L

    /**
     * Parses an artifact, or throws.
     *
     * A payload whose magic, version or hash id we do not recognise is refused
     * rather than guessed at: misreading a blocklist either blocks everything or
     * nothing, and both are worse than declining to start.
     */
    fun parse(bytes: ByteArray): CompiledBlocklist {
      require(bytes.size >= HEADER_BYTES) { "compiled blocklist is truncated" }
      val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)

      require(buffer.getInt(0) == MAGIC) { "not a compiled blocklist" }
      val version = buffer.get(4).toInt() and 0xFF
      val hashId = buffer.get(5).toInt() and 0xFF
      require(version == SUPPORTED_VERSION) { "unsupported blocklist version $version" }
      require(hashId == HASH_FNV1A64) { "unsupported hash id $hashId" }

      val count = buffer.getInt(8)
      require(count >= 0) { "negative entry count" }
      val expected = HEADER_BYTES + count.toLong() * ENTRY_BYTES
      require(bytes.size.toLong() >= expected) {
        "blocklist claims $count entries but is only ${bytes.size} bytes"
      }
      return CompiledBlocklist(buffer, count)
    }

    fun empty(): CompiledBlocklist =
      parse(
        ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.LITTLE_ENDIAN)
          .putInt(MAGIC).put(SUPPORTED_VERSION.toByte()).put(HASH_FNV1A64.toByte())
          .putShort(0).putInt(0).array(),
      )

    /**
     * FNV-1a over the UTF-8 bytes of an already-normalised name.
     *
     * Kotlin's Long is signed; the algorithm is defined on unsigned 64-bit, but
     * the wrapping multiply and xor produce identical bit patterns either way,
     * so only the comparison has to treat them as unsigned.
     */
    fun hash(domain: String): Long {
      var value = FNV_OFFSET_BASIS
      for (byte in domain.toByteArray(Charsets.UTF_8)) {
        value = value xor (byte.toLong() and 0xFF)
        value *= FNV_PRIME
      }
      return value
    }

    /** Lowercase, strip a trailing dot. The same normalisation the server applies. */
    fun normalise(name: String): String = name.trimEnd('.').lowercase()
  }

  /**
   * Is this name blocked, by itself or by a parent?
   *
   * Walks labels rather than matching substrings, which is what makes
   * `pornhub.com` catch `www.pornhub.com` and never `notpornhub.com`.
   */
  fun blocks(name: String): Boolean {
    val normalised = normalise(name)
    if (normalised.isEmpty() || count == 0) return false

    var start = 0
    while (start < normalised.length) {
      if (contains(hash(normalised.substring(start)))) return true
      val dot = normalised.indexOf('.', start)
      if (dot < 0) break
      start = dot + 1
    }
    return false
  }

  private fun contains(needle: Long): Boolean {
    var low = 0
    var high = count - 1
    while (low <= high) {
      val mid = (low + high) ushr 1
      val value = buffer.getLong(HEADER_BYTES + mid * ENTRY_BYTES)
      // Entries are sorted by UNSIGNED value, as the server wrote them.
      val cmp = java.lang.Long.compareUnsigned(value, needle)
      when {
        cmp == 0 -> return true
        cmp < 0 -> low = mid + 1
        else -> high = mid - 1
      }
    }
    return false
  }
}

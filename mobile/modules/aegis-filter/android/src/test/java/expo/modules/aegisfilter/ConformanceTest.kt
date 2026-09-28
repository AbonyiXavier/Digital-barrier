package expo.modules.aegisfilter

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Checks this module against vectors generated from the TypeScript implementations
 * that already have test suites (`src/wire.ts` and
 * `backend/src/blocklist/compiled.ts`).
 *
 * The point is that "the Kotlin looks right" is not a claim anyone can check. A
 * blocklist reader that disagrees with the server by one bit blocks the wrong
 * domains, and a DNS codec that disagrees produces replies a browser quietly
 * ignores. These vectors make both falsifiable.
 *
 * Regenerate with `node scripts/gen-vectors.mjs` from the repo root.
 */
class ConformanceTest {
  private val vectors: JSONObject by lazy {
    val stream = javaClass.classLoader?.getResourceAsStream("conformance-vectors.json")
      ?: error("conformance-vectors.json missing — run: node scripts/gen-vectors.mjs")
    JSONObject(stream.bufferedReader().readText())
  }

  private fun hex(value: String): ByteArray =
    ByteArray(value.length / 2) { value.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

  @Test
  fun `fnv1a64 matches the server`() {
    val cases = vectors.getJSONArray("hashes")
    for (i in 0 until cases.length()) {
      val case = cases.getJSONObject(i)
      val input = case.getString("input")
      val expected = case.getString("fnv1a64")
      val actual = java.lang.Long.toHexString(CompiledBlocklist.hash(input)).padStart(16, '0')
      assertEquals("hash of \"$input\"", expected, actual)
    }
  }

  @Test
  fun `compiled artifact answers exactly as the server does`() {
    val artifact = vectors.getJSONObject("compiledArtifact")
    val list = CompiledBlocklist.parse(hex(artifact.getString("hex")))
    assertEquals(artifact.getJSONObject("header").getInt("count"), list.count)

    val lookups = vectors.getJSONArray("lookups")
    for (i in 0 until lookups.length()) {
      val case = lookups.getJSONObject(i)
      val domain = case.getString("domain")
      assertEquals("lookup of $domain", case.getBoolean("blocked"), list.blocks(domain))
    }
  }

  @Test
  fun `refuses an artifact it does not understand`() {
    // Guessing at a malformed blocklist blocks everything or nothing.
    val bogus = "this is definitely not a blocklist".toByteArray()
    var threw = false
    try {
      CompiledBlocklist.parse(bogus)
    } catch (expected: IllegalArgumentException) {
      threw = true
    }
    assertTrue("a non-artifact must be refused", threw)
  }

  @Test
  fun `dns questions parse to the same values`() {
    val cases = vectors.getJSONArray("dns")
    for (i in 0 until cases.length()) {
      val case = cases.getJSONObject(i)
      val parsed = DnsPacket.parseQuestion(hex(case.getString("query")))
      val expected = case.getJSONObject("parsed")
      assertEquals(expected.getInt("txid"), parsed.txid)
      assertEquals(expected.getString("name"), parsed.name)
      assertEquals(expected.getInt("qtype"), parsed.qtype)
      assertEquals(expected.getInt("qclass"), parsed.qclass)
    }
  }

  @Test
  fun `sinkhole replies are byte-identical to the server's`() {
    val cases = vectors.getJSONArray("dns")
    for (i in 0 until cases.length()) {
      val case = cases.getJSONObject(i)
      val raw = hex(case.getString("query"))
      val actual = DnsPacket.buildSinkhole(DnsPacket.parseQuestion(raw), raw, ttl = 60)
      assertArrayEquals(
        "sinkhole for ${case.getString("name")} qtype ${case.getInt("qtype")}",
        hex(case.getString("sinkhole")),
        actual,
      )
    }
  }

  @Test
  fun `https records get NODATA so ipv4hint cannot route around us`() {
    val cases = vectors.getJSONArray("dns")
    for (i in 0 until cases.length()) {
      val case = cases.getJSONObject(i)
      if (case.getInt("qtype") != 65) continue
      val raw = hex(case.getString("query"))
      val reply = DnsPacket.buildSinkhole(DnsPacket.parseQuestion(raw), raw)
      // ancount lives at offset 6.
      val ancount = ((reply[6].toInt() and 0xFF) shl 8) or (reply[7].toInt() and 0xFF)
      assertEquals("HTTPS/SVCB must carry no answer records", 0, ancount)
    }
  }

  @Test
  fun `label matching never catches a lookalike`() {
    val list = CompiledBlocklist.parse(
      hex(vectors.getJSONObject("compiledArtifact").getString("hex")),
    )
    assertTrue(list.blocks("deep.sub.pornhub.com"))
    assertFalse(list.blocks("notpornhub.com"))
    assertFalse(list.blocks("pornhub.com.evil.test"))
  }
}

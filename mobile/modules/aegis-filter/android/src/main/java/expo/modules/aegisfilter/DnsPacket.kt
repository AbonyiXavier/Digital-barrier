package expo.modules.aegisfilter

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Just enough DNS (RFC 1035 / 6891) to decide and answer.
 *
 * A mirror of `src/wire.ts` in the repo root, which has a test suite. Anything
 * we allow is relayed to the upstream resolver byte for byte, so this only ever
 * has to read a question and build a sinkhole — never a full answer section.
 * `conformance/vectors.json` holds query/response pairs generated from that
 * TypeScript, and `DnsPacketTest` checks this file against them.
 */
object DnsPacket {
  const val HEADER_LEN = 12
  private const val MAX_NAME_LEN = 255

  private const val QR = 0x8000
  private const val OPCODE_MASK = 0x7800
  private const val AA = 0x0400
  private const val RD = 0x0100
  private const val RA = 0x0080

  const val RCODE_NOERROR = 0
  const val RCODE_FORMERR = 1

  const val TYPE_A = 1
  const val TYPE_AAAA = 28
  const val TYPE_OPT = 41
  const val CLASS_IN = 1

  private const val EDNS_PAYLOAD = 1232

  class Malformed(message: String) : Exception(message)

  data class Question(
    val txid: Int,
    val flags: Int,
    val arcount: Int,
    /** Lower-cased, no trailing dot. */
    val name: String,
    val qtype: Int,
    val qclass: Int,
    /** Offset just past the question section. */
    val end: Int,
  )

  /** Reads the question out of a query. Questions never use compression pointers. */
  fun parseQuestion(data: ByteArray): Question {
    if (data.size < HEADER_LEN) throw Malformed("short header")
    val buffer = ByteBuffer.wrap(data).order(ByteOrder.BIG_ENDIAN)

    val txid = buffer.getShort(0).toInt() and 0xFFFF
    val flags = buffer.getShort(2).toInt() and 0xFFFF
    if (flags and QR != 0) throw Malformed("not a query")
    if ((buffer.getShort(4).toInt() and 0xFFFF) < 1) throw Malformed("no question")
    val arcount = buffer.getShort(10).toInt() and 0xFFFF

    val labels = StringBuilder()
    var offset = HEADER_LEN
    var length = 0
    while (true) {
      if (offset >= data.size) throw Malformed("truncated name")
      val size = data[offset].toInt() and 0xFF
      if (size == 0) {
        offset += 1
        break
      }
      if (size and 0xC0 != 0) throw Malformed("compression pointer in question")
      offset += 1
      if (offset + size > data.size) throw Malformed("truncated label")
      if (labels.isNotEmpty()) labels.append('.')
      labels.append(String(data, offset, size, Charsets.ISO_8859_1).lowercase())
      offset += size
      length += size + 1
      if (length > MAX_NAME_LEN) throw Malformed("name too long")
    }
    if (offset + 4 > data.size) throw Malformed("truncated question")

    return Question(
      txid = txid,
      flags = flags,
      arcount = arcount,
      name = labels.toString(),
      qtype = buffer.getShort(offset).toInt() and 0xFFFF,
      qclass = buffer.getShort(offset + 2).toInt() and 0xFFFF,
      end = offset + 4,
    )
  }

  /**
   * Answers a blocked name with a dead address.
   *
   * Any type other than A/AAAA gets NODATA — the name exists, it just has
   * nothing of that type. That matters most for HTTPS/SVCB, whose ipv4hint and
   * ipv6hint fields would otherwise hand the browser the real endpoint and route
   * straight around the block.
   */
  fun buildSinkhole(query: Question, raw: ByteArray, ttl: Int = 60): ByteArray {
    val rdata: ByteArray? = when {
      query.qclass != CLASS_IN -> null
      query.qtype == TYPE_A -> byteArrayOf(0, 0, 0, 0)
      query.qtype == TYPE_AAAA -> ByteArray(16)
      else -> null
    }

    val questionBytes = raw.copyOfRange(HEADER_LEN, query.end)
    // Echo an OPT record only if the client offered one, so EDNS stays symmetric.
    val opt = if (query.arcount > 0) optRecord() else ByteArray(0)
    val answer = if (rdata == null) ByteArray(0) else resourceRecord(query.qtype, ttl, rdata)

    val out = ByteBuffer
      .allocate(HEADER_LEN + questionBytes.size + answer.size + opt.size)
      .order(ByteOrder.BIG_ENDIAN)

    val flags = QR or RA or AA or (query.flags and OPCODE_MASK) or
      (query.flags and RD) or RCODE_NOERROR
    out.putShort(query.txid.toShort())
    out.putShort(flags.toShort())
    out.putShort(1)                                            // qdcount
    out.putShort(if (rdata == null) 0 else 1)                  // ancount
    out.putShort(0)                                            // nscount
    out.putShort(if (opt.isNotEmpty()) 1 else 0)               // arcount
    out.put(questionBytes)
    out.put(answer)
    out.put(opt)
    return out.array()
  }

  /** An error reply for a datagram too broken to read a question from. */
  fun buildBareError(raw: ByteArray, rcode: Int): ByteArray {
    val txid = if (raw.size >= 2) {
      ByteBuffer.wrap(raw).order(ByteOrder.BIG_ENDIAN).getShort(0)
    } else {
      0
    }
    return ByteBuffer.allocate(HEADER_LEN).order(ByteOrder.BIG_ENDIAN)
      .putShort(txid).putShort((QR or RA or rcode).toShort())
      .putShort(0).putShort(0).putShort(0).putShort(0)
      .array()
  }

  /** Pointer to the question's name at offset 12, then the record. */
  private fun resourceRecord(qtype: Int, ttl: Int, rdata: ByteArray): ByteArray =
    ByteBuffer.allocate(12 + rdata.size).order(ByteOrder.BIG_ENDIAN)
      .putShort(0xC00C.toShort())
      .putShort(qtype.toShort())
      .putShort(CLASS_IN.toShort())
      .putInt(ttl)
      .putShort(rdata.size.toShort())
      .put(rdata)
      .array()

  /** A bare EDNS(0) OPT record: root name, type 41, our UDP payload size. */
  private fun optRecord(): ByteArray =
    ByteBuffer.allocate(11).order(ByteOrder.BIG_ENDIAN)
      .put(0)
      .putShort(TYPE_OPT.toShort())
      .putShort(EDNS_PAYLOAD.toShort())
      .putInt(0)
      .putShort(0)
      .array()
}

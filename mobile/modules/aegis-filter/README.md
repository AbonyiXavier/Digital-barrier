# aegis-filter

On-device DNS filtering, as a local Expo module.

| Platform | State |
| --- | --- |
| **Android** | Written — `VpnService`. **Not yet compiled or run.** |
| **iOS** | Not implemented. Throws rather than pretending. |
| **web** | Reports unavailable. |

## What is actually verified

The pure logic is pinned against vectors generated from TypeScript that has its
own test suites (`src/wire.ts` and `backend/src/blocklist/compiled.ts`):

- `CompiledBlocklist.kt` — the artifact reader, FNV-1a, label-wise matching
- `DnsPacket.kt` — question parsing and sinkhole construction

`ConformanceTest.kt` checks both against `android/src/test/resources/conformance-vectors.json`,
including the published FNV-1a reference vectors and byte-identical sinkhole
replies. Regenerate with `node scripts/gen-vectors.mjs` from the repo root.

**Those tests have never been run** — there is no JDK or Android SDK on the
machine this was written on. They are a spec, not a passing suite, until someone
runs `./gradlew test`.

## What is not verified at all

`AegisVpnService.kt`. Reading packets off a tun interface and injecting replies
cannot be checked without a device. The likeliest thing to need adjusting is the
zero UDP checksum in `IpV4Udp.build` — legal over IPv4, accepted by most stacks
for injected packets, and the first suspect if replies are dropped.

There is also a known gap marked `TODO(ipv6)`: v6 DNS packets are currently
dropped rather than mis-parsed. That fails closed for filtering but breaks
resolution on a v6-only network, so it must be handled before this ships.

## The design decision worth knowing

**Only the DNS server address is routed into the tunnel**, not the default route:

```kotlin
.addDnsServer(TUN_DNS)
.addRoute(TUN_DNS, 32)
```

DNS arrives here; every other byte the phone sends takes its normal path. A
full-tunnel VPN would mean reassembling all traffic — far more code, more
battery, and a much larger claim about what this app can see.

## Running it

Requires a JDK and the Android SDK, neither of which is needed for the rest of
this repo.

```bash
# once
brew install --cask android-studio     # then install the SDK from its wizard

cd mobile
npx expo prebuild --platform android    # generates android/
npx expo run:android                    # builds and installs a dev build

# the conformance suite
cd android && ./gradlew :aegis-filter:test
```

Adding this module **ends Expo Go for this project** — Expo Go ships a fixed set
of native modules and cannot load ours. `expo run:android` installs your own
build instead; the developer experience is the same minus the QR code.

## Demo



https://github.com/user-attachments/assets/50bc08d9-3022-4adb-b401-0ae385313c6c




# Digital Barrier — prototype

The smallest thing that proves the core mechanic works:

```
ON  →  protection enabled  →  DNS filtering  →  pornhub.com BLOCKED / google.com ALLOWED
```

A local DNS resolver on `127.0.0.1:53` answers every lookup the machine makes.
Blocked names get a dead address (`0.0.0.0` / `::`); everything else is relayed
to an upstream resolver untouched. `barrier on` points macOS system DNS at that
resolver; `barrier off` puts the previous settings back.

TypeScript on Node, **no runtime dependencies** — `typescript` and `@types/node`
are the only packages, and both are dev-only.

## Requirements

Node 18 or newer (`.nvmrc` pins 24). If `node --version` is older:

```bash
nvm use
```

## Use

```bash
npm install
npm run build

sudo ./barrier on               # enable protection
./barrier check pornhub.com google.com
./barrier status
./barrier log -f                # live query log
sudo ./barrier off              # disable, restores previous DNS
```

`./barrier` builds on demand if `dist/` is missing, so the first run works
without a separate step.

## Blocklist feeds

Ten hand-written domains is a demo. `barrier update` installs a maintained feed
of tens of thousands:

```bash
./barrier sources               # what's available, what's installed
./barrier update                # install/refresh the default feed
./barrier update stevenblack-porn
./barrier update --url <url> --name mylist
sudo ./barrier reload           # apply to a running resolver
```

Feeds land in `feeds/` and are kept **separate from `blocklist.txt`**, so an
update can never overwrite rules you wrote by hand. The resolver merges
`blocklist.txt` + every `feeds/*.txt`, with `allowlist.txt` overriding both.

### Automatic updates

```bash
sudo ./barrier schedule             # every 6h by default
sudo ./barrier schedule --hours 12
sudo ./barrier unschedule
```

**launchd, not cron.** cron silently skips a run whose scheduled time passed
while the machine was asleep — on a laptop that is most of them. launchd runs a
missed interval job when the machine wakes. It installs as a *LaunchDaemon*
(root) because applying new rules means signalling a resolver that runs as root.

Because a LaunchDaemon has no `SUDO_USER`, the job passes `BARRIER_USER`
explicitly — otherwise its state would land in `/var/root` where your own
commands can't see it.

### Validation

Nothing is installed until it passes validation. A feed is about to become this
machine's DNS policy, so `update` refuses one that:

- yields fewer than 1,000 usable domains (a truncated download or an HTML error
  page);
- blocks any **sentinel** domain — `apple.com`, `google.com`, `cloudflare.com`,
  `github.com` and friends. A mis-categorised feed that sinkholes a CDN breaks
  browsing in a way that is near-impossible to diagnose from a browser error;
- **shrank by more than 30%** since the installed version. Validation catches a
  truncated download; this catches a feed that legitimately parsed but lost most
  of its domains to a broken upstream build. `--force` accepts it anyway.

A feed that hasn't changed is detected by hash and not rewritten. The version
being replaced is kept, so a bad update can be undone:

```bash
./barrier rollback              # restore the previous version
```

### Knowing it still works

An unattended updater that fails quietly is worse than none, because you go on
believing you're protected. Every attempt — success, failure, or no-op — is
recorded, and `barrier status` reports it:

```
  feed         hagezi-nsfw (74152 domains, fetched 39m ago)
  updates      last succeeded 12m ago
  auto-update  active (/Library/LaunchDaemons/com.digitalbarrier.update.plist)
```

A failing job shows `3 consecutive failure(s), last tried 18h ago: <reason>`.

Cost scales linearly, because rules live in a `Set`:

| Domains | Heap | Load | Lookup | Daemon RSS |
| --- | --- | --- | --- | --- |
| 74k (adult only) | 13 MB | 45 ms | 0.8 µs | ~85 MB |
| 599k (adult + gambling) | 110 MB | 590 ms | 2.3 µs | ~260 MB |

Still fast at 599k, but a quarter of a gigabyte resident is a real cost for a
background daemon. Worth deciding deliberately whether you need every category.

Editing your own rules:

```bash
vi blocklist.txt                # one domain per line, covers all subdomains
vi allowlist.txt                # overrides everything (for false positives)
sudo ./barrier reload           # apply without dropping in-flight queries
```

`reload` needs sudo while protection is on, because the resolver runs as root to
hold port 53.

## Verify it works

```bash
npm test                        # or: ./barrier test
```

Runs a resolver on an unprivileged port and drives real DNS traffic at it — no
sudo, no changes to your network settings. 19 checks covering the core flow,
matching correctness, bypass resistance, and behaviour under load.

To confirm the *system* integration after `sudo ./barrier on`:

```bash
dig +short pornhub.com          # → 0.0.0.0
dig +short google.com           # → a real address
scutil --dns | grep nameserver  # → 127.0.0.1
```

## Layout

| Path | Role |
| --- | --- |
| `barrier` | launcher — `./barrier <command>` |
| `src/wire.ts` | DNS wire format: parse a question, build a sinkhole or error |
| `src/blocklist.ts` | label-wise domain matching, blocklist + allowlist |
| `src/safesearch.ts` | forced safe-search redirect rules |
| `src/feeds.ts` | download, validate and install maintained feeds |
| `src/launchd.ts` | the boot and update LaunchDaemons |
| `src/bypass.ts` | bypass detection and the hash-chained event log |
| `src/resolver.ts` | the filtering forwarder (UDP + TCP) |
| `src/serve.ts` | daemon entry point (`node dist/src/serve.js`) |
| `src/system.ts` | macOS DNS control via `networksetup` |
| `src/state.ts` | `~/.digital-barrier` — saved DNS settings, pid, logs |
| `src/probe.ts` | small DNS client for health checks and tests |
| `src/cli.ts` | `on / off / status / check / reload / log / test` |
| `tests/prototype.test.ts` | the reliability suite |

## Design decisions worth keeping

**Sinkhole, not NXDOMAIN.** Blocked names resolve to `0.0.0.0`, which fails
fast and leaves room to later point them at a local "blocked" page carrying the
accountability message.

**Label-wise matching, never substrings.** `pornhub.com` matches
`media.cdn.pornhub.com` but not `notpornhub.com` or `pornhub.com.evil.test`.
Substring matching is the standard way a filter starts eating unrelated sites.

**HTTPS/SVCB records return NODATA.** Answering only A and AAAA would let a
browser fetch an HTTPS record and reach the site through an alternative
endpoint or ECH. Blocked names return nothing for every type.

**Relay allowed traffic byte-for-byte.** The forwarder never re-encodes an
upstream answer, so DNSSEC, unfamiliar record types and EDNS options survive.
It also means `Buffer` in, `Buffer` out — no DNS library to keep up to date.

**Restore before stopping.** `barrier off` puts DNS back *before* killing the
resolver, and `barrier on` persists the saved settings *before* changing
anything — so an interrupted run never strands the machine pointing at a
listener that isn't there. `barrier off` with no saved state still resets any
service pointing at `127.0.0.1`.

**`strict` TypeScript, and the types carry the protocol.** `Query`, `Decision`
and `QueryEvent` are the three shapes the whole system moves around; getting a
`Decision` wrong is a compile error rather than a silent leak.

## Surviving a reboot

```bash
sudo ./barrier install      # run the resolver at boot
sudo ./barrier uninstall    # stop doing that
```

Without this, a reboot with protection on leaves system DNS pointed at
`127.0.0.1` with nothing listening — **every lookup on the machine fails**, with
no obvious cause. Installing registers the resolver as a LaunchDaemon with
`RunAtLoad` and `KeepAlive`, so it starts at boot and is restarted if it dies.

Once installed, `on` and `off` drive launchd instead of spawning a process:

- `off` calls `bootout` **and** `disable`. `bootout` alone only lasts until the
  next reboot; `disable` is what makes "off" mean off.
- `on` calls `enable` then `bootstrap`, and waits until the resolver actually
  answers before touching DNS.

`install` verifies the daemon comes up and **rolls itself back if it doesn't** —
reporting success on an unverified install would be the one way to cause the
exact outage it exists to prevent.

### The one thing that can still bite

The plist pins an absolute path to the Node binary:

```xml
<string>/Users/<you>/.nvm/versions/node/<version>/bin/node</string>
```

If that version is removed (`nvm uninstall 24`), or the project directory is
moved, the boot job fails and DNS breaks at the next reboot. Recovery does not
need DNS:

```bash
sudo ./barrier off          # restores DNS immediately
```

Re-run `sudo ./barrier install` after moving the project or changing Node.

## Forced safe search

`safesearch.txt` maps each search hostname to the alternate host that serves the
same site with explicit results switched off:

```
www.google.com      forcesafesearch.google.com
www.youtube.com     restrictmoderate.youtube.com
www.bing.com        strict.bing.com
duckduckgo.com      safe.duckduckgo.com
```

This is a third kind of answer alongside block and allow: a **redirect**. The
site still loads and still presents a valid certificate — it is the same
company's servers — it just refuses to return explicit results. Comment out a
line to stop forcing that engine, then `sudo ./barrier reload`.

Two details that matter:

- The target is **resolved live on every query** rather than pinned to an IP, so
  it follows the engine whenever they move it.
- `HTTPS`/`SVCB` records for a redirected host return **NODATA**. Their
  `ipv4hint`/`ipv6hint` fields would otherwise hand the browser the unfiltered
  endpoint directly — the same bypass the sinkhole closes.

YouTube's `restrict.` is Strict mode and blocks a great deal of harmless
content; the shipped default is `restrictmoderate.`.

This is also the only practical answer to explicit *images*. Nothing in DNS can
inspect a picture, but Google Images with SafeSearch forced on does not serve
the explicit ones.

## Linking this Mac to the backend

The resolver can run entirely on its own. Linked to the API in `backend/`, it
stops being the only authority on its own configuration:

```bash
./barrier login                 # sign in (password is never echoed)
./barrier pair <code>           # claim a pairing code from the app
./barrier sync                  # take the server's policy, push block counts
```

`status` then reports the link, and says so when it has gone stale.

**Authority runs one way.** The server decides whether protection should be on
and which categories are enabled, because the product rests on a user not being
able to talk their own device out of it. This machine reports exactly two things
upward: that it is alive, and how many requests it blocked.

**Only counts leave.** The local query log holds hostnames — that is the point of
`barrier log`. What crosses the boundary is a date and an integer. The server has
no column for a domain, and rejects a body carrying one with a 400, so there is
nowhere for a hostname to land even if a future client sent it.

**Drift is reported, not silently corrected.** If the server expects protection on
and it is off here, `sync` says so and exits non-zero. It cannot fix it: changing
system DNS needs root, and a sync that quietly failed to would be the "status says
protected when it is not" problem all over again.

Two integration details worth knowing, both found by wiring this up:

- Node's `fetch` sends `Origin: null`, which Better Auth rejects as a CSRF risk —
  an *absent* Origin is fine, a null one is not. The client declares the API's own
  origin, which is always in the server's trusted list.
- Pairing codes are server-issued and single-use. A retried `pair` with the same
  `clientRef` returns the existing device rather than consuming a second code.

## Bypass detection

A filter that reports "protected" while a VPN routes around it is worse than no
filter — it manufactures confidence. The resolver watches for that and `status`
tells the truth:

```
PROTECTION BYPASSED -- the OS is using 8.8.8.8 via utun9
  since 12m ago
```

Three states, because they are genuinely different:

| State | Meaning |
| --- | --- |
| `protected` | every lookup reaches the filter |
| `degraded` | DNS is still filtered, but traffic can leave without asking us — a tunnel holds the default route, or a network service isn't covered |
| `bypassed` | lookups aren't reaching us at all, or the resolver is down |

Transitions are recorded to `~/.digital-barrier/bypass.log`:

```bash
./barrier events           # what happened, and verify the log
```

A change has to hold for two consecutive readings before it is recorded. Without
that, the few seconds between `barrier on` setting DNS and the OS picking it up
log as a bypass — which reads to a partner as "they turned it off" when they had
just turned it on. A log that cries wolf gets ignored, so brief flaps never reach
it. Real detection is delayed by at most one interval (15s by default).

Each entry is **hash-chained** to the one before it, so removing or editing a
single evening is detectable. It doesn't stop someone with root deleting the
whole file — nothing on a machine you control can — but it makes selective
edits fail verification, which is what an accountability partner needs.

### What macOS bypass actually looks like

Two distinct mechanisms, both detected:

1. **The tunnel takes the route.** The VPN installs a higher-priority resolver
   scope and the default route becomes `utun*`. Our settings are untouched and
   simply outranked.
2. **A new network service appears.** The VPN client registers itself with
   `networksetup` *after* `barrier on` ran, so it was never pointed at the
   filter. Re-running `sudo ./barrier on` covers it, since services are
   enumerated at run time.

### What this deliberately does not do

It does not try to prevent a VPN. Anyone with admin rights on their own machine
can route around any software running on it — that is the threat model, not a
defect. Blocking VPN vendor domains only works before a tunnel is up; firewall
rules on VPN ports break work VPNs and lose to anything tunnelling over 443.
Real prevention needs a supervised/MDM device, where someone else holds control,
which is a product decision rather than a feature.

For a user trying to stop *themselves*, cost and visibility are the mechanism.

## Known limits of this prototype

These are deliberate — the prototype proves the mechanism, not the product.

- **Trivially bypassed.** Anyone can run `sudo ./barrier off`, change DNS in
  System Settings, or use a VPN. This is now *detected and recorded* rather than
  silently ignored, but it is not prevented, and on a self-installed macOS app
  it cannot be.
- **DNS-over-HTTPS walks around it.** Chrome's and Firefox's secure DNS bypass
  the system resolver entirely. Real coverage means blocking known DoH
  endpoints and disabling it by policy/MDM.
- **Domain-level only.** No URL, page-content or image analysis. A feed of ~74k
  domains covers the mainstream, but not every mirror, and nothing catches a
  site the day it appears.
- **macOS only, this machine only.** Per-device DNS configuration; cross-device
  coverage means a router/profile/MDM or a hosted resolver.
- **Direct-IP access is unaffected**, since nothing is filtered at the packet
  layer.
- **Existing connections survive.** DNS filtering only affects *new* lookups, so
  a page already loaded, a cached DNS entry, or an open keep-alive/HTTP3 socket
  keeps working after protection is switched on. Closing that gap needs a
  packet-layer rule, not a resolver.

## Where this goes next

The pieces this prototype deliberately leaves out, roughly in order:

1. **Friction** — a delay and a typed reason before `off` actually takes effect.
   Today `sudo ./barrier off` is instant and free, which is the whole weakness.
2. **Accountability** — the query log shipped to a partner rather than sitting
   in `~`, which raises the privacy question the log makes obvious: it records
   every hostname the machine resolves, work traffic included.
4. **Cross-device** — router, MDM profile, or a hosted resolver.

## The app

`mobile/` holds the frontend prototype — an Expo / React Native app covering
onboarding, the dashboard, protection levels, the Protection Lock, accountability
partners, devices, subscription, blocklist management and the blocked page.

It is UI only: every screen runs against a seeded in-memory store, so the whole
product can be walked through before the backend exists. The friction and
accountability items listed above are designed there first.

```bash
cd mobile && nvm use && npm install && npm start
```

See `mobile/README.md` for the structure and `mobile/DESIGN.md` for the design
and domain contract.

# Aegis — API

NestJS + PostgreSQL + Redis. Owns the three rules the mobile prototype could not
be trusted with: the countdown deadline, the PIN, and who may approve turning
protection off.

## Run it

```bash
nvm use                 # Node 24
npm install
cp .env.example .env    # then set BETTER_AUTH_SECRET: openssl rand -base64 32
createdb aegis
npm run migrate:dev
npm run seed
npm run start:dev
```

Postgres and Redis are expected on their default ports. Swagger is at
`/docs`, the raw spec at `/docs/json`, and `/health/ready` reports both
dependencies.

Seeded account: `francis@example.com` / `aegis-dev-password`.

## The privacy constraint, in the schema

The product promises that blocked activity is *"a count per day. A number, never
a name."* So there is **no column anywhere** that records a domain a user
visited or was blocked from. `BlockCount(deviceId, day, count)` is the entire
telemetry surface, and it holds an integer.

This is enforced by the shape of the schema rather than by discipline: there is
nowhere to put a hostname even if a future endpoint wanted to. `POST
/devices/:id/blocks` accepts a count and the global validation pipe rejects any
other field.

Likewise `ApprovalSettings.shareActivityDetail` has no column. The app calls it
"not a setting — a guarantee", so storing it would imply it could be switched
on. The API returns a constant and the DTO rejects any attempt to write it.

## Rules the server owns

| Rule | Behaviour |
| --- | --- |
| Raising the lock level | immediate |
| Lowering from level 3 or 4 | `409 LOCK_REQUIRES_REQUEST` — must go through a request |
| Direct disable at level 3 or 4 | `409` — same |
| Approve `intent=disable` | protection off, **level unchanged** |
| Approve `intent=lower-level` | level changed, **protection untouched** |
| Two pending requests | `409` via a partial unique index |
| Approve a delay early | `409 WAITING_PERIOD_NOT_ELAPSED` |
| PIN | scrypt-hashed, never returned; only `pinSet` is exposed |
| Second device on the free plan | `402 PREMIUM_REQUIRED` |
| Downgrade to free | keeps the PIN, level, rules and protection state |

`declined` and `expired` have no client path by design — a partner declines
through their magic link, and a scheduled sweep expires what nobody answered.

## Design notes

**Deadlines are split in the database, single on the wire.** `readyAt` (a
countdown ending) and `expiresAt` (a request lapsing) mean different things and
are separately constrained, but a client only ever asks *when this resolves*, so
the API exposes one `resolvesAt`.

**Creates take a `clientRef`.** The mobile store dispatches optimistically with
a temporary id; echoing it back makes reconciliation unambiguous, and storing it
under a unique index makes a retried create idempotent instead of duplicating.
One column, two problems.

**One dialect outward.** Responses never contain a database enum — categories
are kebab-case ids, statuses are lowercase. The mapping lives in
`src/users/api-mappers.ts`.

**The outbox commits with the domain write.** `OutboxService.emit` takes a
transaction client, so a notification can never be sent for something that did
not commit. The relay claims rows with `FOR UPDATE SKIP LOCKED` and uses the row
id as the BullMQ job id, so replay enqueues nothing new. Delivery is
at-least-once, so consumers re-read rather than trusting the payload.

**BullMQ has no dead-letter queue**, so exhausted jobs are copied to one with
their payload and error rather than sitting in the failed set until trimmed.

**Notification channels are swappable** (`NOTIFICATION_CHANNELS=stub,email,push`).
The stub prints the full magic link, so the whole partner journey is walkable
locally with no email provider configured.

## The compiled blocklist

`GET /blocklist/compiled` serves the blocked domains as sorted 64-bit hashes
rather than text.

This exists for one reason. The macOS resolver holds its rules in a `Set<string>`,
which measures **110 MB** at 600k domains — fine on a Mac, impossible inside an
iOS Network Extension, where the whole process must fit in **50 MiB** on iOS 15+
(15 MB before that). Hashing server-side turns the same 708,729 domains into
**5.4 MB, about 11% of that budget**, and a client binary-searches the bytes
instead of parsing anything.

The format is documented in `src/blocklist/compiled.ts` and pinned by
`compiled.spec.ts`, including the published FNV-1a reference vectors — a Swift or
Kotlin client should check its hash against those before trusting the rest.
Matching walks labels exactly as the resolver does, so `pornhub.com` catches
`www.pornhub.com` and never `notpornhub.com`.

Two deliberate choices:

- **Feeds only.** The caller's own block rules are not folded in. They are a
  handful of domains, they already arrive with `GET /blocklist`, and including
  them would make the artifact per-user and uncacheable to save a client a
  trivial merge. As it is, every account with the same categories gets
  byte-identical bytes.
- **Filtered by the account's enabled categories.** This is why `Feed` gained a
  `categories` column: without it, someone who enabled only adult sites would be
  handed the 562k-domain gambling list too, and the category toggles would be
  decoration.

A 64-bit collision would wrongly block one unrelated domain — roughly 1 in 10^8
at this size — and the allowlist already exists to undo exactly that.

## Postman

```bash
npm run postman         # regenerates from the running API's OpenAPI document
```

Generated rather than hand-written so it cannot drift. Import
`postman/aegis.postman_collection.json`, run **00 · auth → sign in** first — its
test script stores the session for every request after it.

## Known gaps

- **`blocklist.autoUpdate` has nowhere to persist.** The app has the toggle, the
  schema has no column. The endpoint exists and reports the gap rather than
  pretending; adding the column is a migration.
- **Billing is not real.** `PUT /subscription` stands in for a completed App
  Store or Play purchase; production needs server-to-server receipt validation.
- **The macOS CLI does not talk to this yet.** Devices of that platform can be
  registered, but nothing reports in.

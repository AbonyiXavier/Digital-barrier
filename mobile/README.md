# Aegis — mobile prototype

The mobile client for the content-blocking product whose DNS mechanic is proven
in the repo root. It runs against the NestJS API in `../backend`: the store
hydrates from `GET /me/bootstrap`, writes go out as HTTP, and AsyncStorage is
demoted to an offline cache.

Expo (SDK 57) · React Native 0.86 · React 19 · TypeScript strict · expo-router.

## Run it

```bash
nvm use           # reads .nvmrc — Node 24; Expo 57 needs >= 20
npm install

# The API has to be up first.
(cd ../backend && npm run start:dev)

npm start         # then press i / a, or scan the QR code with Expo Go
```

`EXPO_PUBLIC_API_URL` points at the API. Unset, the app derives it from the
Metro host, so a phone on the same Wi-Fi finds your laptop unaided.

Sign in with the seeded account — `francis@example.com` / `aegis-dev-password` —
or create a new one through onboarding.

`npm run ios`, `npm run android` and `npm run web` skip the picker.

## What's here

```
src/
├── app/                      file-based routes (expo-router)
│   ├── _layout.tsx           providers + the root stack
│   ├── index.tsx             gate → onboarding or dashboard
│   ├── (onboarding)/         welcome → account → protection → device → done
│   ├── (tabs)/               dashboard · protection · accountability · devices · settings
│   ├── protection/           level · lock · disable (the lock enforcement flow)
│   ├── accountability/       invite · requests · approval settings
│   ├── devices/              add · [id]
│   ├── settings/             profile · notifications · privacy · support
│   ├── blocklist.tsx         blocklist health + the user's own overrides
│   ├── blocked-screen.tsx    live editor for the page shown instead of a DNS error
│   └── subscription.tsx      free vs premium
├── components/
│   ├── ui/                   the design system — every primitive the app uses
│   ├── navigation/           the floating tab bar
│   └── <feature>/            components belonging to one feature only
├── theme/                    palette → semantic colours → tokens → provider
├── store/                    reducer + context, persisted to AsyncStorage
├── types/                    the domain model
├── data/                     seed data for the prototype
└── lib/                      formatters and app constants
```

`DESIGN.md` is the contract: design language, the full component API, the store
API, and — most importantly — the domain model.

## The one thing to get right

Three concepts stay separate throughout the app:

| | What it is |
| --- | --- |
| **Protection** | on or off |
| **Protection Lock** | the mechanism that makes turning protection *off* hard; its strength is the **protection level**, 1–4 |
| **Accountability** | an optional human layer — a trusted person, who never sees browsing history |

So a user might run `Protection ON · Lock: waiting period (2 days) ·
Accountability: OFF`, and another `Protection ON · Lock: partner approval ·
Accountability: their wife`. The lock is not a level, and level 4 is not the
same thing as accountability being switched on.

## How state works now

`src/store/app-store.tsx` still exposes the same seven hooks, so no screen
changed when the backing was swapped. Underneath:

- **Hydration is two-step.** The AsyncStorage cache paints immediately so the
  app never opens on a spinner, then `GET /me/bootstrap` replaces it. The cache
  is a convenience, never the truth — anything the lock depends on comes from
  the API, because state a determined user can edit on their own device is
  exactly what this product must not trust.
- **Writes are optimistic.** `dispatch` stays synchronous and returns void, so
  the two dozen call sites that dispatch and immediately navigate still work.
  The request goes out in the background; the server's row then replaces the
  optimistic one (`src/store/reconcile.ts`), which matters because the server
  owns `resolvesAt`, `initials` and every id.
- **A failed write refetches** rather than restoring a local snapshot — the
  snapshot could itself be stale, and the server is the only authority on the
  lock. `useAppStore().syncError` carries the message for a screen to surface.
- **The session lives in the keychain** (`expo-secure-store`), not AsyncStorage.
- **The PIN never reaches the device.** The API sends `pinSet`, and
  `POST /protection/pin/verify` is the only correct check.
- `src/lib/api/actions.ts` is the single table of which action implies which
  HTTP call, so an action with no server call is a visible decision.

`APP_NAME` in `src/lib/app.ts` is still a placeholder; renaming is one line.

## Renaming / re-skinning

- Product name: `src/lib/app.ts`.
- Colours: `src/theme/palette.ts` (raw values) and `src/theme/colors.ts`
  (semantic roles). No screen hard-codes a hex, so a re-skin is those two files.
- Spacing, radii, type scale: `src/theme/tokens.ts`.

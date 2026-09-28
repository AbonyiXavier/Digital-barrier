# Aegis — UI contract

Everything a screen needs, in one place. Screens import from `@/components/ui`,
`@/theme`, `@/store/app-store`, `@/types` and `@/lib/format` — never from a
primitive's own file, and never from another screen.

---

## 1. Design language

**Feeling:** calm, confident, protective. Someone opens this app in a hard
moment. Nothing may shame them, nag them, or look clinical. Copy is warm and
short. No exclamation marks, no streak-guilt, no red unless something is
genuinely off.

**Colour roles**

| Role | Meaning | Token |
| --- | --- | --- |
| brand (indigo→violet) | actions, navigation, selection | `colors.brand`, `colors.brandGradient` |
| shield (mint) | protection is on and healthy | `colors.shield`, `colors.shieldGradient` |
| warn (amber) | waiting period running, approval pending | `colors.warn` |
| danger (coral) | protection off, destructive actions | `colors.danger` |

Never hard-code a hex. Everything comes from `useTheme()`.

**Structure**

- Dark is the default scheme; both are fully supported and must be checked.
- Cards are `radius.lg` (20). Buttons and badges are `radius.full`.
- Vertical rhythm: `Section` between groups, `spacing.base` (16) inside a card,
  `spacing.md` (12) between sibling cards.
- One clear primary action per screen, in `<Screen footer>` when the screen is
  a step in a flow.
- Big numbers use `<Text variant="display" rounded>`.

**Responsiveness** — `Screen` already clamps content to 560px and centres it,
and handles safe areas and the keyboard. Never add your own `SafeAreaView`.
Use flex and `gap`; never a fixed width that could exceed a 360px screen.

---

## 2. Conventions

```tsx
// Static layout in a module-scope StyleSheet; colours inline from the theme.
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 12 } });

export default function SomeScreen() {
  const theme = useTheme();
  const { devices } = useAppState();
  const dispatch = useAppDispatch();
  ...
}
```

- Functional components with hooks. **Default-export** every route file.
- TypeScript strict — no `any`, no non-null `!` on values that can be null.
- Comment *why*, never *what*. Most components need no comments at all.
- `router.push('/path')` from `useRouter()`; `router.back()` to dismiss.
- Never add an npm dependency.

---

## 3. Component API (`@/components/ui`)

```tsx
<Screen                      // every screen starts here
  header={<Header … />}      // optional, owns the top inset
  mode="scroll" | "fixed"    // default "scroll"
  footer={<Button … />}      // pinned above the bottom inset
  bleed                      // drop horizontal padding
  alt                        // use the alt background (grouped lists)
  bottomInset={number}       // tab screens pass TAB_BAR_CLEARANCE
  backdrop={<ReactNode/>}    // full-bleed layer behind content
/>

<Header title subtitle onBack={fn | false} right={<ReactNode/>} large />

<Text variant="hero|display|h1|h2|h3|body|bodyStrong|sub|caption|micro|label|mono"
      tone="default|secondary|muted|brand|shield|warn|danger|onAccent"
      rounded align weight numberOfLines />

<Button label onPress
        variant="primary|secondary|ghost|danger|shield"
        size="sm|base|lg" icon={IconName} iconTrailing
        disabled loading fullWidth />

<Card variant="plain|raised|outlined" padding="none|sm|base|lg"
      gradient={colors.brandGradient} onPress />

<Section title description action={{label,onPress}} gap>…</Section>

<ListRow title subtitle icon={IconName} iconColor leading={<ReactNode/>}
         trailing={<ReactNode/>} chevron onPress disabled divider />

<Badge label tone="neutral|brand|shield|warn|danger"
       variant="soft|solid" icon dot />

<OptionCard title description icon selected onPress
            locked indicator="radio|check|none">{children}</OptionCard>

<Toggle value onValueChange disabled tone="shield|brand" accessibilityLabel />
<Segmented options={[{value,label}]} value onChange />
<TextField label hint error icon {...TextInputProps} />

<ProgressRing progress={0..1} size thickness colors trackColor>{center}</ProgressRing>
<StrengthMeter value={1..4} max height />
<Sparkline data={number[]} labels={string[]} height color />
<StatTile value label icon tone="default|shield|warn|danger|brand" />
<Stepper current total />
<Avatar initials size pending />
<EmptyState icon title description action={{label,onPress}} />
<Divider inset />
<Icon name={IonicName} size color />
```

`IconName` is an Ionicons glyph name (`'shield-checkmark'`, `'time-outline'`, …).

---

## 4. Store (`@/store/app-store`)

```ts
useAppState()        // full AppState (see the file for fields)
useAppDispatch()     // dispatch(action)
useProtectionLevel() // the ProtectionLevel object for the current lock level
useActivePartner()   // Partner | null — the lock's level-4 approver
usePendingRequest()  // DisableRequest | null
useIsPremium()       // boolean
useProtectedDays()   // whole days since user.protectedSince
useProtectedDevices()
```

Actions (`dispatch({ type: … })`): `complete-onboarding`, `reset`,
`set-protection`, `set-level`, `set-pin`, `set-waiting-period`,
`set-lock-partner`, `toggle-category`, `set-accountability`, `add-partner`,
`remove-partner`, `set-partner-status`, `patch-approval-settings`,
`add-request`, `resolve-request`, `add-device`, `remove-device`,
`set-device-status`, `set-plan`, `patch-blocklist`, `allow-domain`,
`block-domain`, `remove-rule`, `patch-blocked-screen`, `patch-notifications`,
`patch-user`.

State persists to AsyncStorage automatically. Don't write to storage directly.

---

## 5. The domain — get this right

Three separate things. Conflating them builds the wrong product.

- **Protection** — on or off. One boolean, `state.protectionOn`.
- **Protection Lock** — the mechanism that makes turning protection *off* hard.
  Its strength is the **protection level**, 1–4 (`state.lock.level`):

  | Level | Name | Turning protection off… |
  | --- | --- | --- |
  | 1 | Normal | happens immediately |
  | 2 | Locked | requires the PIN |
  | 3 | Waiting period | starts a countdown; protection stays on until it ends |
  | 4 | Accountability | requires a partner's approval |

  The lock is *not* a level itself, and level 4 is *not* the same thing as
  accountability being on.
- **Accountability** — an optional human layer (`state.accountabilityOn` +
  `state.partners`). A partner **never sees browsing history**; say so in the UI.

A user may run any combination, e.g. `Protection ON / Lock: waiting period /
Accountability: OFF`.

Clearing a lock and *weakening* one both have to get past the same barrier, so
both raise a `DisableRequest`. They are told apart by `intent`
(`'disable' | 'lower-level'`) rather than by parsing the reason text, and the
reducer only drops `protectionOn` for an approved `'disable'`.

---

## 6. Helpers (`@/lib/format`)

`relativeTime`, `describeWaitingPeriod`, `countdown`, `elapsedFraction`,
`platformLabel`, `platformIcon`, `compactNumber`, `plural`, `initialsFrom`,
`weekdayLabels`. `APP_NAME` lives in `@/lib/app`.

---

## 7. Routes

```
(onboarding)/ welcome · create-account · choose-protection · register-device · complete
(tabs)/       index (dashboard) · protection · accountability · devices · settings
protection/   level · lock · disable(modal)
accountability/ invite(modal) · requests · approval-settings
devices/      add(modal) · [id]
              blocklist · blocked-screen · subscription(modal)
settings/     profile · notifications · privacy · support
```

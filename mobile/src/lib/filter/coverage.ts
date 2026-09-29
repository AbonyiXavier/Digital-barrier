/**
 * Whether *this* device is actually filtering.
 *
 * `protectionOn` is the account's intent and lives on the server. Whether this
 * phone is filtering is a local fact, and the two disagree more often than is
 * comfortable: consent not granted yet, another VPN holding Android's single VPN
 * slot, a start that failed, or a platform with no datapath built at all.
 *
 * Every screen that makes a claim about protection reads it from here, because
 * the alternative — each screen deciding for itself — is how one of them ends up
 * showing a green shield to someone who is not protected. For this product that
 * is the worst available bug: a user who believes they are covered will not
 * check, and the whole value on offer is that they do not have to.
 */
import type { EnforcementState } from './enforcement';

export type DeviceCoverage =
  /** The account is off. Nothing is expected to be filtering. */
  | { kind: 'off' }
  /** Intent and fact agree: this device is filtering. */
  | { kind: 'covered' }
  /** Too early to say — the first reconcile has not answered yet. */
  | { kind: 'pending' }
  /** The account says on, this device is not filtering. The honest unhappy path. */
  | { kind: 'gap' };

/**
 * `idle` maps to `pending` rather than `gap` on purpose. The reconciler only
 * settles on `idle` when protection is off (see `enforcement.ts` — the
 * `protectionOn && !running` branch returns before the fallthrough), so `idle`
 * while protection is on can only be the initial state before the first pass.
 * Treating it as a gap would flash a warning on every cold start and train the
 * user to ignore the one warning that matters.
 */
export function coverageOf(protectionOn: boolean, state: EnforcementState): DeviceCoverage {
  if (!protectionOn) return { kind: 'off' };

  switch (state.kind) {
    case 'filtering':
      return { kind: 'covered' };
    case 'idle':
    case 'starting':
      return { kind: 'pending' };
    case 'needs-consent':
    case 'revoked':
    case 'failed':
    case 'unsupported':
      return { kind: 'gap' };
  }
}

/**
 * True when it is safe to show the reassuring version of a screen. `pending` is
 * included: it lasts about one render, and flickering amber on every launch
 * would cost more trust than it buys.
 */
export function isReassuring(coverage: DeviceCoverage): boolean {
  return coverage.kind === 'covered' || coverage.kind === 'pending';
}

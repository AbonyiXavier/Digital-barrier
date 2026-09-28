/**
 * Making the device match the state.
 *
 * `state.protectionOn` is the intent; the tunnel is the fact. This reconciles the
 * second to the first, which is the same shape as the rest of the app: screens
 * dispatch, and an effect makes the world agree.
 *
 * Deliberately NOT called from the reducer. Starting a VPN needs user consent,
 * can fail, and takes time — none of which belongs in a synchronous state
 * transition. Keeping it here means a toggle stays instant and the enforcement
 * catches up, or reports that it could not.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState as RNAppState, Platform } from 'react-native';

import AegisFilter from '../../../modules/aegis-filter';
import { useAppState } from '@/store/app-store';

import { ensureBlocklist } from './blocklist-cache';

export type EnforcementState =
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'needs-consent' }
  | { kind: 'starting' }
  | { kind: 'filtering'; domains: number; blocked: number }
  | { kind: 'revoked' }
  | { kind: 'failed'; message: string };

/** Only Android has a datapath today; iOS throws by design rather than pretending. */
const SUPPORTED = Platform.OS === 'android';

const POLL_MS = 5_000;

export function useProtectionEnforcement(): {
  state: EnforcementState;
  requestConsent: () => Promise<void>;
  retry: () => void;
} {
  const { protectionOn, hydrated } = useAppState();
  const [state, setState] = useState<EnforcementState>(
    SUPPORTED ? { kind: 'idle' } : { kind: 'unsupported' },
  );
  const [attempt, setAttempt] = useState(0);

  // Guards against two reconciliations overlapping — a fast toggle would
  // otherwise race a start against a stop.
  const busy = useRef(false);

  useEffect(() => {
    if (!SUPPORTED || !hydrated) return;
    let cancelled = false;

    const reconcile = async (): Promise<void> => {
      if (busy.current) return;
      busy.current = true;
      try {
        const native = AegisFilter.status();

        if (native.revoked) {
          // Android gives the VPN slot to one app at a time, so this means
          // another VPN displaced us. Surfaced rather than silently restarted:
          // it is exactly the event an accountability partner should hear about.
          if (!cancelled) setState({ kind: 'revoked' });
          return;
        }

        if (protectionOn && !native.running) {
          if (!AegisFilter.hasPermission()) {
            if (!cancelled) setState({ kind: 'needs-consent' });
            return;
          }
          if (!cancelled) setState({ kind: 'starting' });
          const list = await ensureBlocklist();
          await AegisFilter.start(list.path);
          if (!cancelled) {
            setState({ kind: 'filtering', domains: 0, blocked: 0 });
          }
          return;
        }

        if (!protectionOn && native.running) {
          await AegisFilter.stop();
          if (!cancelled) setState({ kind: 'idle' });
          return;
        }

        if (!cancelled) {
          setState(
            native.running
              ? { kind: 'filtering', domains: 0, blocked: native.blockedCount }
              : { kind: 'idle' },
          );
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            kind: 'failed',
            message: error instanceof Error ? error.message : 'Could not start filtering.',
          });
        }
      } finally {
        busy.current = false;
      }
    };

    void reconcile();

    // Poll, because the tunnel can stop without telling us — the user can revoke
    // it from Android's own settings, and no callback reaches a backgrounded app.
    const timer = setInterval(() => void reconcile(), POLL_MS);

    // And re-check on foreground, since that is when a user who just changed
    // something in system settings comes back.
    const subscription = RNAppState.addEventListener('change', (next) => {
      if (next === 'active') void reconcile();
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [protectionOn, hydrated, attempt]);

  return {
    state,
    requestConsent: async () => {
      if (!SUPPORTED) return;
      try {
        await AegisFilter.requestPermission();
        // The answer arrives as an Activity result, so the foreground listener
        // above is what actually picks it up. Nudge a re-check regardless.
        setAttempt((n) => n + 1);
      } catch (error) {
        setState({
          kind: 'failed',
          message: error instanceof Error ? error.message : 'Consent was not granted.',
        });
      }
    },
    retry: () => setAttempt((n) => n + 1),
  };
}

/** One-line summary for a screen to render. */
export function describeEnforcement(state: EnforcementState): string {
  switch (state.kind) {
    case 'unsupported':
      return Platform.OS === 'ios'
        ? 'Filtering on iOS is not built yet.'
        : 'Filtering is not available here.';
    case 'idle':
      return 'Not filtering on this device.';
    case 'needs-consent':
      return 'Android needs your permission before filtering can start.';
    case 'starting':
      return 'Starting…';
    case 'filtering':
      return state.blocked > 0
        ? `Filtering. ${state.blocked} blocked since it started.`
        : 'Filtering on this device.';
    case 'revoked':
      return 'Another VPN took over. Protection is not filtering.';
    case 'failed':
      return state.message;
  }
}

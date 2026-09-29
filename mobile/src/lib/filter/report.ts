/**
 * Telling the server what this device is actually doing.
 *
 * The server cannot see a handset's tunnel. Left to itself it would have to infer
 * a device's status from "the account is switched on", which is the same
 * assumption that had the dashboard showing a green shield to a phone that had
 * never been granted VPN consent. So the device reports, and the report is the
 * only thing that can mark a row `protected`.
 *
 * Sent on change rather than on every poll: the enforcement hook reconciles every
 * five seconds, and a request each time would be a lot of radio for a value that
 * changes perhaps twice a day. A slow repeat keeps `lastSeenAt` fresh so the
 * server's offline sweep does not mistake a quiet device for a gone one.
 */
import { useEffect, useRef } from 'react';

import { getInstallId } from '@/lib/api/install-id';
import { reportFiltering } from '@/lib/api/this-device';
import { useAppState } from '@/store/app-store';

import type { EnforcementState } from './enforcement';

/** How often to repeat an unchanged report, so `lastSeenAt` stays current. */
const REFRESH_MS = 5 * 60 * 1000;

/**
 * What to report, or null when the state carries no usable answer.
 *
 * `starting` is transient. `idle` is ambiguous in the one place it matters: it is
 * also the hook's initial value, so reporting it would demote a perfectly healthy
 * device on every cold start, for the second before the first reconcile answers.
 */
function reportable(state: EnforcementState): boolean | null {
  switch (state.kind) {
    case 'filtering':
      return true;
    case 'needs-consent':
    case 'revoked':
    case 'failed':
    case 'unsupported':
      return false;
    case 'idle':
    case 'starting':
      return null;
  }
}

export function useFilteringReport(state: EnforcementState): void {
  const { devices, hydrated } = useAppState();
  const deviceId = devices.find((device) => device.isCurrent)?.id ?? null;

  const last = useRef<{ value: boolean; at: number } | null>(null);

  const filtering = reportable(state);

  useEffect(() => {
    if (!hydrated || deviceId === null || filtering === null) return;
    let cancelled = false;

    const send = async (): Promise<void> => {
      const previous = last.current;
      const stale = previous === null || Date.now() - previous.at > REFRESH_MS;
      if (previous !== null && previous.value === filtering && !stale) return;

      try {
        await reportFiltering(deviceId, filtering, await getInstallId());
        if (!cancelled) last.current = { value: filtering, at: Date.now() };
      } catch {
        // Offline, or the row was removed from another device. Neither is worth
        // interrupting the user for, and the next tick reports again.
      }
    };

    void send();

    // The interval is what actually delivers the slow repeat: this effect only
    // re-runs when the reported value changes, which for a healthy device is
    // approximately never.
    const timer = setInterval(() => void send(), REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hydrated, deviceId, filtering]);
}

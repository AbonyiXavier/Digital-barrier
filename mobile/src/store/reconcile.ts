/**
 * Reconciling optimistic writes with what the server actually stored.
 *
 * Screens dispatch and navigate away in the same tick — `dispatch(...)` then
 * `router.back()` — so a write has to appear instant. The store applies the
 * change locally with an invented id, sends the request in the background, and
 * then has to make the local copy agree with the server's.
 *
 * That is more than renaming an id. `lock.partnerId` and `request.partnerId`
 * point at the temporary id, so missing one leaves a dangling reference that
 * surfaces much later as a partner who cannot be chosen as an approver. And the
 * server owns fields the client only guessed at — `resolvesAt`, `initials`,
 * `status`, timestamps — so the optimistic row is replaced wholesale rather
 * than patched.
 */
import type { SyncResult } from '@/lib/api/actions';
import type { AppState } from './app-store';

/** Ids the client mints look like `p_1758901234567`; the server issues cuids. */
export function isTempId(id: string): boolean {
  return /^[a-z]+_\d{10,}$/.test(id);
}

export function makeTempId(prefix: 'p' | 'd' | 'r' | 'u'): string {
  return `${prefix}_${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/**
 * Rewrites every reference to a temporary id.
 *
 * Deliberately exhaustive rather than generic: each site is named, so adding a
 * new field that holds an entity id fails to compile here instead of silently
 * dangling at runtime.
 */
export function rewriteId(state: AppState, from: string, to: string): AppState {
  if (from === to) return state;
  const swap = (id: string | null): string | null => (id === from ? to : id);

  return {
    ...state,
    lock: { ...state.lock, partnerId: swap(state.lock.partnerId) },
    partners: state.partners.map((p) => (p.id === from ? { ...p, id: to } : p)),
    devices: state.devices.map((d) => (d.id === from ? { ...d, id: to } : d)),
    requests: state.requests.map((r) => {
      const id = r.id === from ? to : r.id;
      const partnerId = swap(r.partnerId);
      return id === r.id && partnerId === r.partnerId ? r : { ...r, id, partnerId };
    }),
  };
}

/** Replaces the optimistic entity with the server's, then fixes references. */
export function reconcile(state: AppState, result: SyncResult): AppState {
  if (!result) return state;
  const { kind, tempId, entity } = result;

  const replaced: AppState =
    kind === 'partner'
      ? {
          ...state,
          partners: state.partners.map((p) => (p.id === tempId ? { ...p, ...entity } : p)),
        }
      : kind === 'device'
        ? {
            ...state,
            devices: state.devices.map((d) => (d.id === tempId ? { ...d, ...entity } : d)),
          }
        : {
            ...state,
            requests: state.requests.map((r) => (r.id === tempId ? { ...r, ...entity } : r)),
          };

  return rewriteId(replaced, tempId, entity.id);
}

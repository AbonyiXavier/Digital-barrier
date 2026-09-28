/**
 * Which HTTP call, if any, each store action implies.
 *
 * Kept as one table rather than scattered through the provider so that the
 * answer to "what does this action do on the server" is in a single place, and
 * so an action added without a server call is visibly a local-only decision
 * rather than an oversight.
 */
import type { AppAction, AppState } from '@/store/app-store';
import type { Device, DisableRequest, Partner } from '@/types';

import { api } from './client';

/**
 * What a create returns, so the optimistic row can be replaced by the real one.
 * Not just the id: the server also owns `resolvesAt`, `initials`, `status` and
 * timestamps, and keeping a client guess for those would drift.
 */
export type SyncResult =
  | { kind: 'partner'; tempId: string; entity: Partner }
  | { kind: 'device'; tempId: string; entity: Device }
  | { kind: 'request'; tempId: string; entity: DisableRequest }
  | undefined;

export type SyncCall = (installId: string) => Promise<SyncResult>;

/** Category enum ids are already kebab-case on both sides. */
export function requestFor(action: AppAction, before: AppState): SyncCall | null {
  switch (action.type) {
    // --- local only, by design ---------------------------------------------
    case 'hydrate':
    case 'reset':
      return null;
    case 'set-partner-status':
      // Server-driven: a partner accepts through their own link, and the change
      // arrives on the next fetch. Nothing to push.
      return null;

    // --- protection ---------------------------------------------------------
    case 'set-protection':
      return () => api.put('/protection/enabled', { on: action.on }).then(() => undefined);
    case 'set-level':
      return () => api.put('/protection/level', { level: action.level }).then(() => undefined);
    case 'set-pin':
      return () => api.put('/protection/pin', { pin: action.pin }).then(() => undefined);
    case 'set-waiting-period':
      return () =>
        api.put('/protection/waiting-period', { minutes: action.minutes }).then(() => undefined);
    case 'set-lock-partner':
      return () =>
        api.put('/protection/partner', { partnerId: action.partnerId }).then(() => undefined);
    case 'set-accountability':
      return () => api.put('/protection/accountability', { on: action.on }).then(() => undefined);
    case 'toggle-category': {
      // The reducer flips; the server is told the resulting state so a retry is
      // idempotent rather than flipping a second time.
      const on = !before.enabledCategories.includes(action.id);
      return () =>
        api.put(`/protection/categories/${action.id}`, { on }).then(() => undefined);
    }

    // --- onboarding and profile --------------------------------------------
    case 'complete-onboarding':
      return () =>
        api.post('/me/onboarding', { categories: action.categories }).then(() => undefined);
    case 'patch-user':
      return () => api.patch('/me', action.patch).then(() => undefined);

    // --- partners -----------------------------------------------------------
    case 'add-partner':
      return async () => ({
        kind: 'partner',
        tempId: action.partner.id,
        entity: await api.post<Partner>('/partners', {
          name: action.partner.name,
          relationship: action.partner.relationship,
          email: action.partner.email,
          clientRef: action.partner.id,
        }),
      });
    case 'remove-partner':
      return () => api.delete(`/partners/${action.id}`).then(() => undefined);

    // --- requests -----------------------------------------------------------
    case 'add-request':
      return async () => ({
        kind: 'request',
        tempId: action.request.id,
        entity: await api.post<DisableRequest>('/requests', {
          intent: action.request.intent,
          targetLevel: action.request.targetLevel,
          reason: action.request.reason,
          clientRef: action.request.id,
        }),
      });
    case 'resolve-request': {
      // Cancelling is the only resolution a user can drive. Approval belongs to
      // the countdown or the partner, and declining and expiring are the
      // server's alone.
      if (action.status !== 'cancelled') return null;
      return () => api.post(`/requests/${action.id}/cancel`).then(() => undefined);
    }

    // --- devices ------------------------------------------------------------
    case 'add-device':
      return async () => ({
        kind: 'device',
        tempId: action.device.id,
        entity: await api.post<Device>('/devices', {
          name: action.device.name,
          platform: action.device.platform,
          clientRef: action.device.id,
        }),
      });
    case 'remove-device':
      return () => api.delete(`/devices/${action.id}`).then(() => undefined);
    case 'set-device-status':
      return () =>
        api.patch(`/devices/${action.id}`, { status: action.status }).then(() => undefined);

    // --- billing and settings ----------------------------------------------
    case 'set-plan':
      return () =>
        api.put('/subscription', { plan: action.plan, period: action.period }).then(() => undefined);
    case 'patch-approval-settings':
      return () => api.put('/settings/approval', action.patch).then(() => undefined);
    case 'patch-notifications':
      return () => api.put('/settings/notifications', action.patch).then(() => undefined);
    case 'patch-blocked-screen':
      return () => api.put('/settings/blocked-screen', action.patch).then(() => undefined);

    // --- blocklist ----------------------------------------------------------
    case 'allow-domain':
      return () =>
        api.post('/blocklist/rules', { domain: action.domain, list: 'allowed' }).then(() => undefined);
    case 'block-domain':
      return () =>
        api.post('/blocklist/rules', { domain: action.domain, list: 'blocked' }).then(() => undefined);
    case 'remove-rule':
      return () =>
        api.delete(`/blocklist/rules/${encodeURIComponent(action.domain)}`).then(() => undefined);
    case 'patch-blocklist': {
      // `lastCheckedAt` moves as a side effect of a refresh, not as a write.
      if (action.patch.autoUpdate === undefined) {
        return action.patch.lastCheckedAt !== undefined
          ? () => api.post('/blocklist/refresh', {}).then(() => undefined)
          : null;
      }
      const autoUpdate = action.patch.autoUpdate;
      return () => api.put('/blocklist/auto-update', { autoUpdate }).then(() => undefined);
    }

    default:
      return null;
  }
}

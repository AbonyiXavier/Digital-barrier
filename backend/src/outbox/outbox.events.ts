/**
 * Every event the outbox can carry.
 *
 * The payload is deliberately thin: an id and the few fields a notification
 * needs. Consumers re-read the database for anything else, so an event that sits
 * in the queue for a minute cannot deliver stale content.
 *
 * Nothing here carries a domain name. The product promises a partner sees only
 * "a request to turn protection off, and the reason you wrote with it", and that
 * blocked activity is "a number, never a name" -- so there is no event shape in
 * which a hostname could travel.
 */
export const OUTBOX_EVENT = {
  PARTNER_INVITED: 'partner.invited',
  PARTNER_RESPONDED: 'partner.responded',
  REQUEST_CREATED: 'request.created',
  REQUEST_APPROVED: 'request.approved',
  REQUEST_DECLINED: 'request.declined',
  REQUEST_EXPIRED: 'request.expired',
  PROTECTION_DISABLED: 'protection.disabled',
  PROTECTION_LEVEL_CHANGED: 'protection.level_changed',
  FEED_REFRESH_FAILED: 'feed.refresh_failed',
  WEEKLY_DIGEST: 'digest.weekly',
} as const;

export type OutboxEventType = (typeof OUTBOX_EVENT)[keyof typeof OUTBOX_EVENT];

export interface OutboxEventInput {
  aggregateType: 'partner' | 'request' | 'protection' | 'feed' | 'user';
  aggregateId: string;
  eventType: OutboxEventType;
  payload: Record<string, unknown>;
}

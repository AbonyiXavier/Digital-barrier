import { RequestIntent, RequestMethod, RequestStatus } from '../../generated/prisma/client';
import { LOCK_LEVEL } from '../protection/lock-levels';

/**
 * The wire vocabulary.
 *
 * The app speaks kebab-case (`lower-level`, `pending`) and the database speaks
 * enums. Translating in one place keeps the mapping auditable, and keeps the app's
 * spelling from leaking into a column name or vice versa.
 */

export const CLIENT_INTENT = {
  DISABLE: 'disable',
  LOWER_LEVEL: 'lower-level',
} as const;

export type ClientIntent = (typeof CLIENT_INTENT)[keyof typeof CLIENT_INTENT];

export const CLIENT_INTENTS: readonly ClientIntent[] = [
  CLIENT_INTENT.DISABLE,
  CLIENT_INTENT.LOWER_LEVEL,
];

export function intentToEnum(intent: ClientIntent): RequestIntent {
  return intent === CLIENT_INTENT.LOWER_LEVEL ? RequestIntent.LOWER_LEVEL : RequestIntent.DISABLE;
}

export function intentToClient(intent: RequestIntent): ClientIntent {
  return intent === RequestIntent.LOWER_LEVEL ? CLIENT_INTENT.LOWER_LEVEL : CLIENT_INTENT.DISABLE;
}

/** `?status=` on GET /requests. The app partitions on exactly these two. */
export const STATUS_FILTER = { PENDING: 'pending', RESOLVED: 'resolved' } as const;

export type StatusFilter = (typeof STATUS_FILTER)[keyof typeof STATUS_FILTER];

export const STATUS_FILTERS: readonly StatusFilter[] = [
  STATUS_FILTER.PENDING,
  STATUS_FILTER.RESOLVED,
];

/** Everything that is not PENDING is resolved -- including the two the client cannot produce. */
export const RESOLVED_STATUSES: readonly RequestStatus[] = [
  RequestStatus.APPROVED,
  RequestStatus.DECLINED,
  RequestStatus.EXPIRED,
  RequestStatus.CANCELLED,
];

/**
 * The lock level decides the method, not the client. Levels 1 and 2 produce no
 * request at all: they mutate directly.
 */
export function methodForLevel(lockLevel: number): RequestMethod | null {
  if (lockLevel === LOCK_LEVEL.DELAY) return RequestMethod.DELAY;
  if (lockLevel === LOCK_LEVEL.PARTNER) return RequestMethod.PARTNER;
  return null;
}

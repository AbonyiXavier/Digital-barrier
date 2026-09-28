/**
 * The Protection Lock.
 *
 * `lockLevel` maps 1:1 onto a method, and that mapping is the only thing that
 * decides whether a change is immediate or has to pass through a request. It
 * lives in its own dependency-free file so both `protection` and `requests` can
 * import it without either module depending on the other.
 *
 * Nothing here is derived from `protectionOn` or from `accountabilityOn`: level 4
 * is not "accountability is on", and level 4 with no approver is a valid state
 * the UI flags rather than one the API prevents.
 */

export const LOCK_LEVEL = {
  NONE: 1,
  PIN: 2,
  DELAY: 3,
  PARTNER: 4,
} as const;

export type LockLevel = (typeof LOCK_LEVEL)[keyof typeof LOCK_LEVEL];

export const LOCK_LEVELS: readonly LockLevel[] = [
  LOCK_LEVEL.NONE,
  LOCK_LEVEL.PIN,
  LOCK_LEVEL.DELAY,
  LOCK_LEVEL.PARTNER,
];

/** The four values the DB check constraint `protection_waiting_period_allowed` permits. */
export const WAITING_PERIOD_MINUTES: readonly number[] = [15, 60, 1440, 2880];

/**
 * A level whose lock can be weakened or cleared by a direct write.
 *
 * Levels 3 and 4 are excluded on purpose: lowering a strong lock has to pass
 * through the lock itself, or the lock would be worth nothing.
 */
export function isDirectlyReleasable(level: number): boolean {
  return level === LOCK_LEVEL.NONE || level === LOCK_LEVEL.PIN;
}

/** Levels 3 and 4 create a request; 1 and 2 mutate directly. */
export function requiresRequest(level: number): boolean {
  return level === LOCK_LEVEL.DELAY || level === LOCK_LEVEL.PARTNER;
}

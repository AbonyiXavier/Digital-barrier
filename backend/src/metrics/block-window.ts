/**
 * The seven-day window every block figure in the API is expressed in.
 *
 * One orientation rule, stated once and imported everywhere: **oldest first,
 * index 6 = today**. The dashboard sparkline and the device detail chart both
 * assume it, the seed writes it, and a silent disagreement here would show up as
 * a chart that is subtly wrong rather than as an error.
 *
 * Days are handled as `YYYY-MM-DD` strings rather than `Date`s. `BlockCount.day`
 * is a SQL `DATE`, and turning a bare date into a `Date` invites the timezone
 * bug where a row lands in yesterday's bucket for anyone east of UTC. Comparing
 * text keys produced by Postgres' own `to_char` removes the question.
 */

export const WINDOW_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/** UTC midnight of `date`, in milliseconds. */
function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** `YYYY-MM-DD` for the UTC day `date` falls in. */
export function dayKey(date: Date): string {
  return new Date(utcMidnight(date)).toISOString().slice(0, 10);
}

/** The window's day keys, oldest first, with `today` last. */
export function windowKeys(now: Date = new Date()): string[] {
  const today = utcMidnight(now);
  return Array.from({ length: WINDOW_DAYS }, (_, index) =>
    new Date(today - (WINDOW_DAYS - 1 - index) * MS_PER_DAY).toISOString().slice(0, 10),
  );
}

/** A fresh, correctly sized run of zeroes. */
export function zeroWindow(): number[] {
  return new Array<number>(WINDOW_DAYS).fill(0);
}

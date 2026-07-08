// Spaced-review scheduling — the one bit of real logic in the app, kept pure
// (no DB, no side effects) so it is easy to unit-test and later swap for a
// smarter algorithm without touching storage.
//
// MVP rule (from the product spec):
//   rating 1 (forgot) -> review in  1 day
//   rating 2 (poor)   -> review in  2 days
//   rating 3 (okay)   -> review in  4 days
//   rating 4 (good)   -> review in  7 days
//   rating 5 (easy)   -> review in 14 days

export const RATING_INTERVAL_DAYS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  5: 14,
};

export function intervalForRating(rating: number): number {
  const days = RATING_INTERVAL_DAYS[rating];
  if (days === undefined) {
    throw new Error(`invalid rating: ${rating} (expected an integer 1-5)`);
  }
  return days;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar date as 'YYYY-MM-DD'. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Local timestamp as 'YYYY-MM-DD HH:MM:SS'. */
export function localTimestamp(now: Date = new Date()): string {
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

/**
 * Add whole days to an ISO date. Uses UTC arithmetic on the calendar date so it
 * is immune to DST — the input's time component (if any) is ignored.
 */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Next review date (ISO) given the attempt's date and the self-rating. */
export function nextReviewDate(fromIsoDate: string, rating: number): string {
  return addDaysIso(fromIsoDate, intervalForRating(rating));
}

/**
 * Is a question due for review on `today`? Null next-review means the question
 * has never been attempted — treat it as due (new material to learn).
 */
export function isDue(nextReview: string | null, today: string = todayIso()): boolean {
  return nextReview === null || nextReview <= today;
}

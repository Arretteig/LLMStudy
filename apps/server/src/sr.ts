// Spaced-review scheduling — the one bit of real logic in the app, kept pure
// (no DB, no side effects) so it is easy to unit-test and later swap for a
// smarter algorithm without touching storage.
//
// Base ladder (from the product spec) — also the interval for a FIRST attempt:
//   rating 1 (forgot) -> review in  1 day
//   rating 2 (poor)   -> review in  2 days
//   rating 3 (okay)   -> review in  4 days
//   rating 4 (good)   -> review in  7 days
//   rating 5 (easy)   -> review in 14 days
//
// Growing ladder (F11): repeated success multiplies the previous interval
// (schedule() below) instead of re-reading the fixed ladder, so a well-known
// card backs off exponentially; any lapse (rating 1-2) resets growth.
//
// TIMEZONE: todayIso()/localTimestamp() emit LOCAL wall-clock values — these
// feed attempted_date / next_review_date and all analytics. created_at /
// updated_at columns are UTC (SQLite datetime('now')) bookkeeping only and
// must never feed analytics, or day boundaries shift by the UTC offset.

import { ValidationError } from './errors';

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
    throw new ValidationError(`invalid rating: ${rating} (expected an integer 1-5)`);
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

// ---------------------------------------------------------------------------
// Growing-ladder scheduler (F11)
// ---------------------------------------------------------------------------

/** A question's current scheduling state (the cache columns on recall_questions). */
export interface ScheduleState {
  /** Current interval in days; null when the question has never been attempted. */
  intervalDays: number | null;
  /** How many times the card has lapsed (rated 1-2). */
  lapses: number;
}

/** Interval growth per successful rating (applied to the previous interval). */
const GROWTH_MULTIPLIER: Record<number, number> = {
  3: 1.2,
  4: 2.0,
  5: 2.5,
};

/** Absolute ceiling on any interval, exam date or not. */
export const MAX_INTERVAL_DAYS = 60;

/** Whole days from `fromIso` to `toIso` (negative when `toIso` is earlier). UTC calendar arithmetic, DST-immune. */
export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toIso.slice(0, 10).split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

/**
 * Compute the next interval from the previous state and a 1-5 self-rating.
 *
 *   rating 1-2 (lapse): interval snaps back to the base ladder value and the
 *     lapse counter increments — forgetting resets all accumulated growth.
 *   rating 3-5: interval = max(ladder value, round(previous * multiplier)),
 *     so a first attempt (or a card fresh off a lapse) starts on the ladder
 *     and repeated success backs off exponentially.
 *
 * Caps: 60 days absolute. When an exam date is set (and still ahead), the cap
 * tightens to 15% of the days remaining — per Cepeda et al.'s optimal-gap
 * heuristic (best study gap ~10-20% of the retention interval), which also
 * guarantees every card gets a touch near exam day.
 */
export function schedule(
  prev: ScheduleState,
  rating: number,
  today: string,
  examDate?: string | null,
): { intervalDays: number; lapses: number; nextReviewDate: string } {
  const base = intervalForRating(rating); // throws ValidationError on a bad rating

  let intervalDays: number;
  let lapses = prev.lapses;
  if (rating <= 2) {
    intervalDays = base;
    lapses += 1;
  } else {
    intervalDays = prev.intervalDays // null/0 -> first attempt, use the ladder
      ? Math.max(base, Math.round(prev.intervalDays * GROWTH_MULTIPLIER[rating]))
      : base;
  }

  let cap = MAX_INTERVAL_DAYS;
  if (examDate && examDate > today) {
    cap = Math.min(cap, Math.max(1, Math.floor(0.15 * daysBetween(today, examDate))));
  }
  intervalDays = Math.min(intervalDays, cap);

  return { intervalDays, lapses, nextReviewDate: addDaysIso(today, intervalDays) };
}

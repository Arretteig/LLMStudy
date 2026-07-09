import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  daysBetween,
  intervalForRating,
  isDue,
  MAX_INTERVAL_DAYS,
  nextReviewDate,
  schedule,
  todayIso,
} from './sr';

describe('spaced-review scheduler', () => {
  it('maps each rating to the spec interval', () => {
    expect(intervalForRating(1)).toBe(1);
    expect(intervalForRating(2)).toBe(2);
    expect(intervalForRating(3)).toBe(4);
    expect(intervalForRating(4)).toBe(7);
    expect(intervalForRating(5)).toBe(14);
  });

  it('throws on an invalid rating', () => {
    expect(() => intervalForRating(0)).toThrow(/invalid rating/);
    expect(() => intervalForRating(6)).toThrow(/invalid rating/);
    expect(() => intervalForRating(2.5)).toThrow(/invalid rating/);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDaysIso('2026-01-30', 2)).toBe('2026-02-01');
    expect(addDaysIso('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDaysIso('2024-02-28', 1)).toBe('2024-02-29'); // leap year
    expect(addDaysIso('2026-07-08T13:45:00', 1)).toBe('2026-07-09'); // ignores time
  });

  it('computes next review date from rating', () => {
    expect(nextReviewDate('2026-07-08', 1)).toBe('2026-07-09');
    expect(nextReviewDate('2026-07-08', 3)).toBe('2026-07-12');
    expect(nextReviewDate('2026-07-08', 5)).toBe('2026-07-22');
  });

  it('treats never-attempted and past-due as due, future as not due', () => {
    expect(isDue(null, '2026-07-08')).toBe(true);
    expect(isDue('2026-07-08', '2026-07-08')).toBe(true); // today
    expect(isDue('2026-07-01', '2026-07-08')).toBe(true); // overdue
    expect(isDue('2026-07-20', '2026-07-08')).toBe(false); // future
  });

  it('formats today as YYYY-MM-DD', () => {
    expect(todayIso(new Date(2026, 6, 8))).toBe('2026-07-08');
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('counts whole days between ISO dates', () => {
    expect(daysBetween('2026-07-08', '2026-08-17')).toBe(40);
    expect(daysBetween('2026-07-08', '2026-07-08')).toBe(0);
    expect(daysBetween('2026-07-08', '2026-07-01')).toBe(-7);
    expect(daysBetween('2026-12-28', '2027-01-04')).toBe(7); // year boundary
  });
});

describe('growing-ladder schedule()', () => {
  const TODAY = '2026-07-08';
  const fresh = { intervalDays: null, lapses: 0 };

  it('first attempt uses the base ladder', () => {
    expect(schedule(fresh, 1, TODAY)).toEqual({
      intervalDays: 1,
      lapses: 1, // rating 1 is a lapse even on a first attempt
      nextReviewDate: '2026-07-09',
    });
    expect(schedule(fresh, 4, TODAY)).toEqual({
      intervalDays: 7,
      lapses: 0,
      nextReviewDate: '2026-07-15',
    });
    expect(schedule(fresh, 5, TODAY).intervalDays).toBe(14);
    // interval 0 behaves like a first attempt too
    expect(schedule({ intervalDays: 0, lapses: 0 }, 4, TODAY).intervalDays).toBe(7);
  });

  it('grows the interval on repeated success (7 -> 14 -> 28 via rating 4)', () => {
    const first = schedule(fresh, 4, TODAY);
    expect(first.intervalDays).toBe(7);
    const second = schedule({ intervalDays: 7, lapses: 0 }, 4, TODAY);
    expect(second.intervalDays).toBe(14);
    const third = schedule({ intervalDays: 14, lapses: 0 }, 4, TODAY);
    expect(third.intervalDays).toBe(28);
    expect(third.nextReviewDate).toBe('2026-08-05');
  });

  it('applies the per-rating multiplier, floored at the ladder value', () => {
    expect(schedule({ intervalDays: 10, lapses: 0 }, 3, TODAY).intervalDays).toBe(12); // 10 * 1.2
    expect(schedule({ intervalDays: 10, lapses: 0 }, 5, TODAY).intervalDays).toBe(25); // 10 * 2.5
    // grown value below the ladder -> ladder wins (2 * 1.2 = 2.4 -> 2 < 4)
    expect(schedule({ intervalDays: 2, lapses: 0 }, 3, TODAY).intervalDays).toBe(4);
  });

  it('a lapse (rating 1-2) resets growth and increments the counter', () => {
    const lapsed = schedule({ intervalDays: 28, lapses: 1 }, 2, TODAY);
    expect(lapsed).toEqual({ intervalDays: 2, lapses: 2, nextReviewDate: '2026-07-10' });
    expect(schedule({ intervalDays: 60, lapses: 0 }, 1, TODAY).intervalDays).toBe(1);
    // success leaves the lapse counter alone
    expect(schedule({ intervalDays: 4, lapses: 3 }, 4, TODAY).lapses).toBe(3);
  });

  it('caps at 60 days absolute', () => {
    const capped = schedule({ intervalDays: 40, lapses: 0 }, 5, TODAY); // 100 uncapped
    expect(capped.intervalDays).toBe(MAX_INTERVAL_DAYS);
    expect(capped.nextReviewDate).toBe(addDaysIso(TODAY, 60));
  });

  it('caps at 15% of the days to the exam (Cepeda heuristic)', () => {
    const exam = '2026-08-17'; // 40 days out -> cap floor(0.15 * 40) = 6
    expect(schedule(fresh, 5, TODAY, exam).intervalDays).toBe(6);
    expect(schedule({ intervalDays: 14, lapses: 0 }, 4, TODAY, exam).intervalDays).toBe(6);
    // short ladder intervals are untouched by the cap
    expect(schedule(fresh, 1, TODAY, exam).intervalDays).toBe(1);
    // exam tomorrow: cap floors at 1 day, never 0
    expect(schedule(fresh, 5, TODAY, '2026-07-09').intervalDays).toBe(1);
  });

  it('ignores an unset, past, or same-day exam date', () => {
    expect(schedule(fresh, 5, TODAY, null).intervalDays).toBe(14);
    expect(schedule(fresh, 5, TODAY, '2026-07-01').intervalDays).toBe(14);
    expect(schedule(fresh, 5, TODAY, TODAY).intervalDays).toBe(14);
  });

  it('rejects an invalid rating', () => {
    expect(() => schedule(fresh, 0, TODAY)).toThrow(/invalid rating/);
    expect(() => schedule(fresh, 6, TODAY)).toThrow(/invalid rating/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  intervalForRating,
  isDue,
  nextReviewDate,
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
});

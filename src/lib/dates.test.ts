import { describe, expect, it } from 'vitest';
import { dayKey, dayKeyOffset, daysBetween, formatDayShort, recentDays } from './dates';

/** Local-time timestamps, so the tests hold in any time zone. */
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('dayKey', () => {
  it('uses local calendar fields, zero-padded', () => {
    expect(dayKey(local(2026, 1, 5, 0))).toBe('2026-01-05');
    expect(dayKey(local(2026, 12, 31, 23))).toBe('2026-12-31');
  });

  it('handles 29 Feb 2028', () => {
    expect(dayKey(local(2028, 2, 29))).toBe('2028-02-29');
  });
});

describe('dayKeyOffset', () => {
  it('crosses the year end both ways', () => {
    expect(dayKeyOffset(1, local(2026, 12, 31, 23))).toBe('2027-01-01');
    expect(dayKeyOffset(-1, local(2027, 1, 1, 0))).toBe('2026-12-31');
  });

  it('lands on and skips past a leap day', () => {
    expect(dayKeyOffset(1, local(2028, 2, 28))).toBe('2028-02-29');
    expect(dayKeyOffset(1, local(2028, 2, 29))).toBe('2028-03-01');
    expect(dayKeyOffset(365, local(2028, 2, 29))).toBe('2029-02-28');
  });

  it('moves one calendar day across the EU and US DST changes, even near midnight', () => {
    // 2026: EU spring forward 29 Mar, fall back 25 Oct; US 8 Mar and 1 Nov.
    for (const [from, to] of [
      [local(2026, 3, 28, 23), '2026-03-29'],
      [local(2026, 3, 29, 0), '2026-03-30'],
      [local(2026, 10, 25, 0), '2026-10-26'],
      [local(2026, 10, 24, 23), '2026-10-25'],
      [local(2026, 3, 7, 23), '2026-03-08'],
      [local(2026, 10, 31, 23), '2026-11-01'],
    ] as const) {
      expect(dayKeyOffset(1, from)).toBe(to);
    }
  });
});

describe('daysBetween', () => {
  it('counts whole days across DST changes', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-03-01', '2026-11-30')).toBe(274);
  });

  it('counts across year end and leap years', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });

  it('is negative when the order is reversed, zero for the same day', () => {
    expect(daysBetween('2027-01-01', '2026-12-31')).toBe(-1);
    expect(daysBetween('2026-10-25', '2026-10-25')).toBe(0);
  });
});

describe('recentDays', () => {
  it('lists consecutive days oldest first, ending today, across year end', () => {
    expect(recentDays(3, local(2027, 1, 1, 0))).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });

  it('includes the leap day and has no gaps or repeats across DST', () => {
    expect(recentDays(3, local(2028, 3, 1))).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
    const days = recentDays(14, local(2026, 11, 2, 0));
    expect(new Set(days).size).toBe(14);
    for (let i = 1; i < days.length; i += 1) expect(daysBetween(days[i - 1], days[i])).toBe(1);
    expect(days.at(-1)).toBe('2026-11-02');
  });

  it('returns nothing for a zero count', () => {
    expect(recentDays(0, local(2026, 1, 1))).toEqual([]);
  });
});

describe('formatDayShort', () => {
  it('formats without throwing', () => {
    for (const key of ['2026-01-05', '2028-02-29', '2026-10-25']) {
      expect(() => formatDayShort(key)).not.toThrow();
      expect(formatDayShort(key)).not.toMatch(/invalid/i);
    }
  });
});

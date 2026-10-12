import { describe, expect, it } from 'vitest';
import { dailyInstalls, installTotals, installsLabel, packageTimeline, weekStart, weeklyInstalls } from '@/src/lib/activity/installs';
import { formatDay, formatMoney, formatWeek, plainAmount } from '@/src/lib/activity/format';

const NOW = new Date('2026-10-12T15:00:00Z');
const at = (iso: string, version = '1.0.0') => ({ at: iso, version });

describe('format', () => {
  it('formats days and weeks in en-GB, UTC', () => {
    expect(formatDay('2026-10-05')).toBe('5 Oct 2026');
    expect(formatDay('2026-10-10T23:30:00Z')).toBe('10 Oct 2026');
    expect(formatWeek('2026-10-05')).toBe('Week of 5 Oct 2026');
    const months = Array.from({ length: 12 }, (_, i) => formatDay(`2026-${String(i + 1).padStart(2, '0')}-15`).split(' ')[1]);
    expect(months).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  });
  it('formats euros with two decimals and thousands separators', () => {
    expect(formatMoney(34500)).toBe('€345.00');
    expect(formatMoney(5)).toBe('€0.05');
    expect(formatMoney(0)).toBe('€0.00');
    expect(formatMoney(123456789)).toBe('€1,234,567.89');
    expect(formatMoney(-1250)).toBe('-€12.50');
    expect(plainAmount(-1250)).toBe('-12.50');
    expect(plainAmount(123456)).toBe('1234.56');
    expect(plainAmount(7)).toBe('0.07');
  });
  it('pluralises installs', () => {
    expect(installsLabel(1)).toBe('1 install');
    expect(installsLabel(0)).toBe('0 installs');
    expect(installsLabel(3)).toBe('3 installs');
  });
});

describe('weekStart', () => {
  it('is the Monday on or before the day', () => {
    expect(weekStart('2026-10-05')).toBe('2026-10-05'); // Monday
    expect(weekStart('2026-10-11')).toBe('2026-10-05'); // Sunday
    expect(weekStart('2026-10-12')).toBe('2026-10-12'); // Monday
    expect(weekStart('2026-01-01')).toBe('2025-12-29'); // crosses a year
  });
});

describe('dailyInstalls', () => {
  it('fills every day of the range with a count, oldest first', () => {
    const days = dailyInstalls([at('2026-10-10T08:00:00Z'), at('2026-10-10T22:00:00Z'), at('2026-10-12T01:00:00Z'), at('2026-09-01T00:00:00Z')], { from: '2026-10-09', to: '2026-10-12' });
    expect(days).toEqual([
      { date: '2026-10-09', installs: 0 },
      { date: '2026-10-10', installs: 2 },
      { date: '2026-10-11', installs: 0 },
      { date: '2026-10-12', installs: 1 },
    ]);
  });
  it('is empty for an inverted range', () => {
    expect(dailyInstalls([], { from: '2026-10-12', to: '2026-10-09' })).toEqual([]);
  });
});

describe('weeklyInstalls', () => {
  it('sums days into Monday-start weeks', () => {
    expect(
      weeklyInstalls([
        { date: '2026-10-04', installs: 1 },
        { date: '2026-10-05', installs: 2 },
        { date: '2026-10-11', installs: 3 },
        { date: '2026-10-12', installs: 4 },
      ]),
    ).toEqual([
      { week: '2026-09-28', installs: 1 },
      { week: '2026-10-05', installs: 5 },
      { week: '2026-10-12', installs: 4 },
    ]);
    expect(weeklyInstalls([])).toEqual([]);
  });
});

describe('packageTimeline', () => {
  it('counts installs per day and version, newest day first, versions in order', () => {
    expect(
      packageTimeline([at('2026-10-10T08:00:00Z', '1.1.0'), at('2026-10-10T09:00:00Z', '1.0.0'), at('2026-10-10T10:00:00Z', '1.1.0'), at('2026-10-11T10:00:00Z', '1.1.0'), { at: '2026-10-11T11:00:00Z', version: null }]),
    ).toEqual([
      { date: '2026-10-11', version: '1.1.0', installs: 1 },
      { date: '2026-10-11', version: 'unknown', installs: 1 },
      { date: '2026-10-10', version: '1.0.0', installs: 1 },
      { date: '2026-10-10', version: '1.1.0', installs: 2 },
    ]);
  });
});

describe('installTotals', () => {
  it('counts all time, the last 7 and the last 30 days', () => {
    const rows = [at('2026-10-12T14:00:00Z'), at('2026-10-05T15:00:01Z'), at('2026-10-05T14:59:59Z'), at('2026-09-12T15:00:01Z'), at('2026-09-01T00:00:00Z')];
    expect(installTotals(rows, NOW)).toEqual({ all: 5, last7: 2, last30: 4 });
    expect(installTotals([], NOW)).toEqual({ all: 0, last7: 0, last30: 0 });
    // exactly 7 / 30 days old is outside the window
    expect(installTotals([at('2026-10-05T15:00:00Z'), at('2026-09-12T15:00:00Z')], NOW)).toEqual({ all: 2, last7: 0, last30: 1 });
  });
});

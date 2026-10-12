/**
 * Publisher install analytics. Inputs are install events with a time and a version only: the
 * installer is never part of them, so nothing here can leak who installed a package.
 */
import { dayOf } from './format';

export interface InstallEvent {
  at: string;
  version: string | null;
}

export interface DailyInstalls {
  date: string;
  installs: number;
}

export interface WeeklyInstalls {
  week: string;
  installs: number;
}

export interface TimelineRow {
  date: string;
  version: string;
  installs: number;
}

const DAY_MS = 86_400_000;

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function dayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function installsLabel(n: number): string {
  return n === 1 ? '1 install' : `${n} installs`;
}

/** The Monday on or before `day` (weeks start on Monday). */
export function weekStart(day: string): string {
  const ms = dayMs(day);
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday
  return dayString(ms - ((dow + 6) % 7) * DAY_MS);
}

/** One entry per day in [from, to], oldest first, zero-filled. */
export function dailyInstalls(installs: readonly Pick<InstallEvent, 'at'>[], range: { from: string; to: string }): DailyInstalls[] {
  const counts = new Map<string, number>();
  for (const i of installs) {
    const d = dayOf(i.at);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const out: DailyInstalls[] = [];
  for (let ms = dayMs(range.from); ms <= dayMs(range.to); ms += DAY_MS) {
    const date = dayString(ms);
    out.push({ date, installs: counts.get(date) ?? 0 });
  }
  return out;
}

/** Days summed into Monday-start weeks, oldest first. */
export function weeklyInstalls(days: readonly DailyInstalls[]): WeeklyInstalls[] {
  const out: WeeklyInstalls[] = [];
  for (const d of days) {
    const week = weekStart(d.date);
    const last = out[out.length - 1];
    if (last && last.week === week) last.installs += d.installs;
    else out.push({ week, installs: d.installs });
  }
  return out;
}

/** Installs per day and version: newest day first, versions in string order. */
export function packageTimeline(installs: readonly InstallEvent[]): TimelineRow[] {
  const counts = new Map<string, TimelineRow>();
  for (const i of installs) {
    const date = dayOf(i.at);
    const version = i.version || 'unknown';
    const key = `${date}|${version}`;
    const row = counts.get(key) ?? { date, version, installs: 0 };
    row.installs += 1;
    counts.set(key, row);
  }
  return [...counts.values()].sort((a, b) => b.date.localeCompare(a.date) || a.version.localeCompare(b.version));
}

/** All time, the last 7 and the last 30 days (rolling, from `now`). */
export function installTotals(installs: readonly Pick<InstallEvent, 'at'>[], now: Date): { all: number; last7: number; last30: number } {
  const t = now.getTime();
  let last7 = 0;
  let last30 = 0;
  for (const i of installs) {
    const age = t - Date.parse(i.at);
    if (age < 7 * DAY_MS) last7 += 1;
    if (age < 30 * DAY_MS) last30 += 1;
  }
  return { all: installs.length, last7, last30 };
}

/**
 * Publisher install activity (GET /api/marketplace/publisher/activity): anonymous counts per
 * package, per day and version. Installer identities are never read (no paid packages yet; when
 * paid packages arrive, buyers of those may be shown, still not free installers).
 */
import { getPublisherInstallEvents } from '../marketplace-service';
import { dailyInstalls, installTotals, packageTimeline, type DailyInstalls, type TimelineRow } from './installs';

export const DAILY_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface PublisherActivity {
  totals: { all: number; last7: number; last30: number };
  daily: DailyInstalls[];
  packages: Array<{ id: string; name: string; total: number; timeline: TimelineRow[] }>;
}

export async function loadPublisherActivity(userId: string, now: Date = new Date()): Promise<PublisherActivity> {
  const { packages, installs } = await getPublisherInstallEvents(userId);
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - (DAILY_WINDOW_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
  return {
    totals: installTotals(installs, now),
    daily: dailyInstalls(installs, { from, to }),
    packages: packages.map((p) => {
      const mine = installs.filter((i) => i.packageId === p.id);
      return { id: p.id, name: p.name, total: mine.length, timeline: packageTimeline(mine) };
    }),
  };
}

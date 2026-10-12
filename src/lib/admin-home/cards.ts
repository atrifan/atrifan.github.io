/**
 * The admin home's area cards (hub /admin): one per admin area with its key number. Pure; the
 * numbers are read by ./admin-home-service.ts and the links built by the page.
 */
import { formatMoney } from '../activity/format';

export type AdminArea = 'qa' | 'disputes' | 'inbox' | 'moderation' | 'activity';

/** The key numbers; null when that area's read failed. */
export interface AdminHomeNumbers {
  awaitingQa: number | null;
  openDisputes: number | null;
  openThreads: number | null;
  pendingPackages: number | null;
  commissionCents30d: number | null;
}

export interface AdminCard {
  area: AdminArea;
  title: string;
  href: string;
  /** The number as shown ("2", "€90.00"), or "—" when it could not be read. */
  value: string;
  caption: string;
  /** Work is waiting (a non-zero queue); never for activity. */
  attention: boolean;
}

export const UNAVAILABLE = '—';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** A settled read → its number, or null if it failed. */
export function settledNumber(result: PromiseSettledResult<number>): number | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function countCard(area: AdminArea, title: string, href: string, n: number | null, caption: (n: number) => string): AdminCard {
  if (n === null) return { area, title, href, value: UNAVAILABLE, caption: 'Couldn’t load', attention: false };
  return { area, title, href, value: String(n), caption: caption(n), attention: n > 0 };
}

export function adminHomeCards(numbers: AdminHomeNumbers, links: Record<AdminArea, string>): AdminCard[] {
  const commission = numbers.commissionCents30d;
  return [
    countCard('qa', 'QA queue', links.qa, numbers.awaitingQa, () => 'awaiting QA'),
    countCard('disputes', 'Disputes', links.disputes, numbers.openDisputes, () => 'open'),
    countCard('inbox', 'Inbox', links.inbox, numbers.openThreads, (n) => plural(n, 'open thread', 'open threads')),
    countCard('moderation', 'Marketplace moderation', links.moderation, numbers.pendingPackages, (n) =>
      plural(n, 'pending package', 'pending packages'),
    ),
    {
      area: 'activity',
      title: 'Activity',
      href: links.activity,
      value: commission === null ? UNAVAILABLE : formatMoney(commission),
      caption: commission === null ? 'Couldn’t load' : 'commission, last 30 days',
      attention: false,
    },
  ];
}

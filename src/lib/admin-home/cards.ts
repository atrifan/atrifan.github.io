/**
 * The admin home's area cards (hub /admin): one per admin area with its key number. Pure; the
 * numbers are read by ./admin-home-service.ts and the links built by the page.
 */
import { formatMoney } from '../activity/format';

export type AdminArea = 'qa' | 'disputes' | 'inbox' | 'moderation' | 'activity' | 'relay';

/** The chat relay's health: whether any secret is missing, and whole days until the broker JWT expires (null if unknown). */
export interface RelayHealth {
  secretsMissing: boolean;
  daysLeft: number | null;
}

/** The broker JWT must have more than this many days left for the relay to read OK. */
export const RELAY_MIN_DAYS = 30;

/** The key numbers; null when that area's read failed. */
export interface AdminHomeNumbers {
  awaitingQa: number | null;
  openDisputes: number | null;
  openThreads: number | null;
  pendingPackages: number | null;
  commissionCents30d: number | null;
  /** null when the relay read failed. */
  relay: RelayHealth | null;
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

function relayCard(health: RelayHealth | null, href: string): AdminCard {
  if (health === null) return { area: 'relay', title: 'Chat relay', href, value: UNAVAILABLE, caption: 'Couldn’t load', attention: false };
  const ok = !health.secretsMissing && health.daysLeft !== null && health.daysLeft > RELAY_MIN_DAYS;
  const caption = health.secretsMissing
    ? 'secrets missing'
    : health.daysLeft === null
      ? 'expiry unknown'
      : health.daysLeft <= 0
        ? 'expired'
        : `expires in ${health.daysLeft} ${plural(health.daysLeft, 'day', 'days')}`;
  return { area: 'relay', title: 'Chat relay', href, value: ok ? 'OK' : 'Set up', caption, attention: !ok };
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
    relayCard(numbers.relay, links.relay),
  ];
}

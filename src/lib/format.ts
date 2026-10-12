/** Display formatting for hub pages. Pure and locale-fixed (en), so server and client agree. */

const INTEGER = () => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const USD = () => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const DATE = () => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "1 payout", "2 payouts", "12,345 jobs"; pass the plural when it isn't singular + "s". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(count)} ${count === 1 ? singular : plural}`;
}

export function formatCredits(credits: number): string {
  return `${INTEGER().format(credits)} ${credits === 1 ? 'credit' : 'credits'}`;
}

/** A credit change: "+1,500", "-20", "0". */
export function formatSignedCredits(credits: number): string {
  return credits > 0 ? `+${INTEGER().format(credits)}` : INTEGER().format(credits);
}

export function formatUsd(usd: number): string {
  return USD().format(usd);
}

/** Money in minor units with its ISO currency (EUR when unknown); "—" when there is no amount. */
export function formatMoneyCents(cents: number | null | undefined, currency: string | null | undefined): string {
  if (typeof cents !== 'number') return '—';
  const code = (currency || 'eur').toUpperCase();
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(cents / 100);
}

/** "1 Oct 2026" (UTC); "—" for a missing or invalid date. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE().format(d);
}

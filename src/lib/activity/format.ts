/**
 * Display text for the activity views. Pure and locale/timezone independent (en-GB style, UTC),
 * so the server and the browser render the same thing.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-05` or an ISO timestamp → "5 Oct 2026" (UTC). */
export function formatDay(isoOrDay: string): string {
  // A date-only string parses as UTC midnight, like the ISO timestamps.
  const d = new Date(isoOrDay);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatWeek(weekStartDay: string): string {
  return `Week of ${formatDay(weekStartDay)}`;
}

/** Cents → "€1,234.50" (always two decimals). */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}€${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** Cents → "1234.50" (CSV). */
export function plainAmount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** The UTC day (`YYYY-MM-DD`) of an ISO timestamp. */
export function dayOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

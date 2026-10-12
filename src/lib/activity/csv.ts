/**
 * CSV export of the gigs ledger. RFC 4180 quoting, plus the OWASP guard against formula
 * injection: a cell that a spreadsheet would evaluate (= + - @, tab, CR) gets a leading quote.
 */
import { plainAmount } from './format';
import { LEDGER_KIND_LABELS, type LedgerEntry } from './ledger';

export const CSV_HEADER = ['Date', 'Role', 'Event', 'Job', 'Amount', 'Commission', 'Currency', 'Status'] as const;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

const money = (cents: number | null) => (cents === null ? '' : plainAmount(cents));

export function ledgerCsv(entries: readonly LedgerEntry[], currency = 'EUR'): string {
  return toCsv([
    CSV_HEADER,
    ...entries.map((e) => [
      e.at.slice(0, 10),
      e.role === 'customer' ? 'Customer' : 'Provider',
      LEDGER_KIND_LABELS[e.kind],
      e.jobTitle,
      money(e.amountCents),
      money(e.commissionCents),
      currency.toUpperCase(),
      e.status,
    ]),
  ]);
}

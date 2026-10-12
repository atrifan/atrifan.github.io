import { describe, expect, it } from 'vitest';
import { CSV_HEADER, csvCell, ledgerCsv, toCsv } from '@/src/lib/activity/csv';
import type { LedgerEntry } from '@/src/lib/activity/ledger';

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'payment:p1',
  at: '2026-10-03T09:00:00.000Z',
  role: 'customer',
  kind: 'payment',
  jobTitle: 'CSV importer',
  amountCents: 34500,
  commissionCents: 4500,
  status: 'succeeded',
  ...over,
});

describe('csvCell', () => {
  it('leaves plain text alone', () => {
    expect(csvCell('hello')).toBe('hello');
    expect(csvCell('')).toBe('');
  });
  it('quotes commas, quotes and line breaks (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('cr\rhere')).toBe('"cr\rhere"');
  });
  it('defuses spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('=a,b')).toBe('"\'=a,b"');
    expect(csvCell('a=b')).toBe('a=b');
  });
});

describe('toCsv', () => {
  it('joins rows with newlines and ends without a trailing newline', () => {
    expect(toCsv([['a', 'b'], ['c', 'd,e']])).toBe('a,b\nc,"d,e"');
    expect(toCsv([])).toBe('');
  });
});

describe('ledgerCsv', () => {
  it('starts with the fixed header', () => {
    expect(CSV_HEADER).toEqual(['Date', 'Role', 'Event', 'Job', 'Amount', 'Commission', 'Currency', 'Status']);
    expect(ledgerCsv([]).split('\n')).toEqual(['Date,Role,Event,Job,Amount,Commission,Currency,Status']);
  });

  it('writes one line per entry with ISO dates, decimal euros and empty cells for missing money', () => {
    const lines = ledgerCsv([
      entry(),
      entry({ id: 'review:r1', role: 'provider', kind: 'review', jobTitle: 'Relay, v2', amountCents: null, commissionCents: null, status: '5/5', at: '2026-10-09T23:59:00.000Z' }),
      entry({ id: 'bid:b1', kind: 'bid_received', jobTitle: '=HYPERLINK("x")', amountCents: 5, commissionCents: 0 }),
    ]).split('\n');
    expect(lines).toEqual([
      'Date,Role,Event,Job,Amount,Commission,Currency,Status',
      '2026-10-03,Customer,Payment,CSV importer,345.00,45.00,EUR,succeeded',
      '2026-10-09,Provider,Review,"Relay, v2",,,EUR,5/5',
      '2026-10-03,Customer,Bid received,"\'=HYPERLINK(""x"")",0.05,0.00,EUR,succeeded',
    ]);
  });

  it('labels every event kind', () => {
    const kinds = ['job_posted', 'bid_received', 'contract', 'payment', 'delivery', 'bid_placed', 'contract_won', 'payout', 'review'] as const;
    const labels = ledgerCsv(kinds.map((kind) => entry({ kind }))).split('\n').slice(1).map((l) => l.split(',')[2]);
    expect(labels).toEqual(['Job posted', 'Bid received', 'Contract', 'Payment', 'Delivery', 'Bid placed', 'Contract won', 'Payout', 'Review']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  breakdownKeyLabel,
  currentPeriod,
  formatCost,
  formatTokens,
  normalizeBreakdown,
  normalizeRuns,
  summarizeDeviceUsage,
} from '@/src/lib/ai-usage';

describe('formatCost', () => {
  it('shows dollars with two decimals, tiny amounts as <$0.01, nothing as a dash', () => {
    expect(formatCost(12.345)).toBe('$12.35');
    expect(formatCost(0.42)).toBe('$0.42');
    expect(formatCost(0.01)).toBe('$0.01');
    expect(formatCost(0.0099)).toBe('<$0.01');
    expect(formatCost(0)).toBe('$0.00');
    expect(formatCost(null)).toBe('—');
    expect(formatCost(undefined)).toBe('—');
    expect(formatCost(Number.NaN)).toBe('—');
  });
});

describe('formatTokens', () => {
  it('abbreviates thousands and millions', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1000)).toBe('1K');
    expect(formatTokens(15400)).toBe('15K');
    expect(formatTokens(999_999)).toBe('1000K');
    expect(formatTokens(1_000_000)).toBe('1.0M');
    expect(formatTokens(2_340_000)).toBe('2.3M');
    expect(formatTokens(0)).toBe('0');
  });
});

describe('currentPeriod', () => {
  it('is the UTC month and year', () => {
    expect(currentPeriod(new Date('2026-10-12T10:00:00Z'))).toEqual({ month: '2026-10', year: '2026' });
    expect(currentPeriod(new Date('2026-01-31T23:59:59Z'))).toEqual({ month: '2026-01', year: '2026' });
  });
});

describe('summarizeDeviceUsage', () => {
  const data = {
    month: '2026-10',
    totalCost: 12.34,
    providers: {
      openai: { totalCost: 2, inputTokens: 100, outputTokens: 50, calls: 3 },
      anthropic: { totalCost: 10.34, inputTokens: 1000, outputTokens: 400, calls: 7 },
    },
  };

  it('accepts the {ok, data} envelope and the bare summary', () => {
    const a = summarizeDeviceUsage({ ok: true, data });
    const b = summarizeDeviceUsage(data);
    expect(a).toEqual(b);
    expect(a).toEqual({
      month: '2026-10',
      totalCost: 12.34,
      inputTokens: 1100,
      outputTokens: 450,
      calls: 10,
      providers: [
        { name: 'anthropic', totalCost: 10.34, inputTokens: 1000, outputTokens: 400, calls: 7 },
        { name: 'openai', totalCost: 2, inputTokens: 100, outputTokens: 50, calls: 3 },
      ],
    });
  });

  it('treats missing numbers as zero and missing providers as none', () => {
    expect(summarizeDeviceUsage({ data: { month: '2026-10', providers: { x: {} } } })).toEqual({
      month: '2026-10',
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      calls: 0,
      providers: [{ name: 'x', totalCost: 0, inputTokens: 0, outputTokens: 0, calls: 0 }],
    });
    expect(summarizeDeviceUsage({ totalCost: 1 })).toMatchObject({ month: '', totalCost: 1, providers: [] });
  });

  it('is null for anything that is not a usage summary', () => {
    expect(summarizeDeviceUsage(null)).toBeNull();
    expect(summarizeDeviceUsage('x')).toBeNull();
    expect(summarizeDeviceUsage({ ok: true })).toBeNull();
    expect(summarizeDeviceUsage({ ok: true, data: { month: '2026-10' } })).toBeNull();
  });
});

describe('normalizeBreakdown', () => {
  const reply = {
    ok: true,
    data: {
      rows: [
        { key: 'sess-b', totalCost: 0.2, inputTokens: 10, outputTokens: 5, calls: 1 },
        { key: 'sess-a', totalCost: 1.5, inputTokens: 100, outputTokens: 50, calls: 4 },
      ],
      attribution: { capsTotalCost: 2.0, attributedCost: 1.7, groupsTotal: 2, causes: [] },
    },
  };

  it('keeps rows ordered by cost and computes what no row explains', () => {
    const b = normalizeBreakdown('session', reply);
    expect(b.rows.map((r) => r.key)).toEqual(['sess-a', 'sess-b']);
    expect(b.total).toBeCloseTo(1.7);
    expect(b.unattributed).toBeCloseTo(0.3);
  });

  it('reports no difference when the rows cover the month (or exceed it)', () => {
    const covered = { data: { rows: reply.data.rows, attribution: { capsTotalCost: 1.704 } } };
    expect(normalizeBreakdown('agent', covered).unattributed).toBe(0);
    const over = { data: { rows: reply.data.rows, attribution: { capsTotalCost: 1 } } };
    expect(normalizeBreakdown('agent', over).unattributed).toBe(0);
    expect(normalizeBreakdown('schedule', { data: { rows: [] } })).toEqual({ rows: [], total: 0, unattributed: 0 });
  });

  it('a difference just over half a cent is reported', () => {
    const near = { data: { rows: [{ key: 'a', totalCost: 1, calls: 1 }], attribution: { capsTotalCost: 1.006 } } };
    expect(normalizeBreakdown('session', near).unattributed).toBeCloseTo(0.006);
  });

  it('by month: one row per month, newest first, no calls figure', () => {
    const b = normalizeBreakdown('month', {
      ok: true,
      data: { rows: [{ month: '2026-08', totalCost: 3 }, { month: '2026-09', totalCost: 1 }, { month: '2026-10', totalCost: 2 }] },
    });
    expect(b.rows).toEqual([
      { key: '2026-10', calls: null, inputTokens: null, outputTokens: null, totalCost: 2 },
      { key: '2026-09', calls: null, inputTokens: null, outputTokens: null, totalCost: 1 },
      { key: '2026-08', calls: null, inputTokens: null, outputTokens: null, totalCost: 3 },
    ]);
    expect(b.total).toBe(6);
    expect(b.unattributed).toBe(0);
  });

  it('ignores malformed rows and malformed replies', () => {
    expect(normalizeBreakdown('session', { data: { rows: [null, { totalCost: 1 }, { key: 'k', calls: '2' }] } }).rows).toEqual([
      { key: 'k', calls: 0, inputTokens: 0, outputTokens: 0, totalCost: 0 },
    ]);
    expect(normalizeBreakdown('session', undefined)).toEqual({ rows: [], total: 0, unattributed: 0 });
    expect(normalizeBreakdown('month', { data: { rows: 'x' } })).toEqual({ rows: [], total: 0, unattributed: 0 });
  });
});

describe('breakdownKeyLabel', () => {
  it('names the orchestrator and leaves other keys as they are', () => {
    expect(breakdownKeyLabel('agent', 'orchestrator')).toBe('Main agent');
    expect(breakdownKeyLabel('agent', 'researcher')).toBe('researcher');
    expect(breakdownKeyLabel('session', 'orchestrator')).toBe('orchestrator');
  });
});

describe('normalizeRuns', () => {
  it('lists runs newest first with their cost and calls', () => {
    expect(
      normalizeRuns({
        ok: true,
        data: {
          runs: [
            { key: 'r1', totalCost: 0.1, calls: 2, firstTs: 1000, lastTs: 2000 },
            { key: 'r2', totalCost: 0.3, calls: 5, firstTs: 5000, lastTs: 6000 },
          ],
        },
      }),
    ).toEqual([
      { key: 'r2', totalCost: 0.3, calls: 5, startedAt: 5000 },
      { key: 'r1', totalCost: 0.1, calls: 2, startedAt: 1000 },
    ]);
    expect(normalizeRuns({ ok: true, data: {} })).toEqual([]);
    expect(normalizeRuns(null)).toEqual([]);
    expect(normalizeRuns({ data: { runs: [{ firstTs: 1 }] } })).toEqual([]);
  });
});

/**
 * Usage figures for the ai. Usage tab, from the assistant's GET_USAGE and GET_USAGE_BY_* replies. Pure.
 *
 * Shapes (assistant native-host): GET_USAGE → { ok, data: { month, totalCost, providers: { name: {...} } } };
 * GET_USAGE_BY_SESSION|SCHEDULE|AGENT → { ok, data: { rows: [{ key, totalCost, inputTokens, outputTokens, calls }],
 * attribution: { capsTotalCost, ... } } }; GET_USAGE_BY_MONTH → { ok, data: { rows: [{ month, totalCost }] } };
 * GET_SCHEDULE_RUNS → { ok, data: { runs: [{ key, totalCost, calls, firstTs, lastTs }] } }.
 */
import type { UsageBreakdown } from './bridge-commands';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
// Number.isFinite is false for anything that is not a finite number, strings included.
const num = (v: unknown): number => (Number.isFinite(v) ? (v as number) : 0);
/** `{ ok, data }` envelope or the bare payload. */
const payload = (raw: unknown): Obj | null => (isObj(raw) ? (isObj(raw.data) ? raw.data : raw) : null);

export function formatCost(n: number | null | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  if (n > 0 && n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export function currentPeriod(now: Date): { month: string; year: string } {
  const iso = now.toISOString();
  return { month: iso.slice(0, 7), year: iso.slice(0, 4) };
}

export interface ProviderUsage {
  name: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface DeviceUsage {
  month: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  providers: ProviderUsage[];
}

export function summarizeDeviceUsage(raw: unknown): DeviceUsage | null {
  const d = payload(raw);
  if (!d || !('totalCost' in d || 'providers' in d)) return null;
  const providers: ProviderUsage[] = Object.entries(isObj(d.providers) ? d.providers : {}).map(([name, p]) => {
    const q = isObj(p) ? p : {};
    return { name, totalCost: num(q.totalCost), inputTokens: num(q.inputTokens), outputTokens: num(q.outputTokens), calls: num(q.calls) };
  });
  providers.sort((a, b) => b.totalCost - a.totalCost);
  const sum = (k: 'inputTokens' | 'outputTokens' | 'calls') => providers.reduce((s, p) => s + p[k], 0);
  return {
    month: typeof d.month === 'string' ? d.month : '',
    totalCost: num(d.totalCost),
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    calls: sum('calls'),
    providers,
  };
}

export interface BreakdownRow {
  key: string;
  /** null for the month roll-up, which carries cost only. */
  calls: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalCost: number;
}

export interface Breakdown {
  rows: BreakdownRow[];
  total: number;
  /** What the month's metered total has that no row explains (0 when the rows cover it). */
  unattributed: number;
}

const EMPTY: Breakdown = { rows: [], total: 0, unattributed: 0 };

export function normalizeBreakdown(kind: UsageBreakdown, raw: unknown): Breakdown {
  const d = payload(raw);
  if (!d || !Array.isArray(d.rows)) return { ...EMPTY };
  if (kind === 'month') {
    const rows: BreakdownRow[] = d.rows
      .filter((r): r is Obj => isObj(r) && typeof r.month === 'string')
      .map((r) => ({ key: r.month as string, calls: null, inputTokens: null, outputTokens: null, totalCost: num(r.totalCost) }))
      .sort((a, b) => b.key.localeCompare(a.key));
    return { rows, total: rows.reduce((s, r) => s + r.totalCost, 0), unattributed: 0 };
  }
  const rows: BreakdownRow[] = d.rows
    .filter((r): r is Obj => isObj(r) && typeof r.key === 'string')
    .map((r) => ({
      key: r.key as string,
      calls: num(r.calls),
      inputTokens: num(r.inputTokens),
      outputTokens: num(r.outputTokens),
      totalCost: num(r.totalCost),
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
  const total = rows.reduce((s, r) => s + r.totalCost, 0);
  const caps = isObj(d.attribution) ? num(d.attribution.capsTotalCost) : 0;
  const diff = caps - total;
  // Reported once it is at least a cent after rounding: a smaller gap is float noise, not spend.
  return { rows, total, unattributed: Math.round(diff * 100) >= 1 ? diff : 0 };
}

export function breakdownKeyLabel(kind: UsageBreakdown, key: string): string {
  return kind === 'agent' && key === 'orchestrator' ? 'Main agent' : key;
}

export interface ScheduleRun {
  key: string;
  totalCost: number;
  calls: number;
  startedAt: number;
}

export function normalizeRuns(raw: unknown): ScheduleRun[] {
  const d = payload(raw);
  if (!d || !Array.isArray(d.runs)) return [];
  return d.runs
    .filter((r): r is Obj => isObj(r) && typeof r.key === 'string')
    .map((r) => ({ key: r.key as string, totalCost: num(r.totalCost), calls: num(r.calls), startedAt: num(r.firstTs) }))
    .sort((a, b) => b.startedAt - a.startedAt);
}

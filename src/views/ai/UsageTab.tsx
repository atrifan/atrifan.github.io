'use client';

import { useMemo, useState } from 'react';
import { buildUsageBreakdown, request, type UsageBreakdown } from '@/src/lib/bridge-commands';
import { breakdownKeyLabel, currentPeriod, formatCost, formatTokens, normalizeBreakdown, summarizeDeviceUsage } from '@/src/lib/ai-usage';
import { surfaceUrl } from '@/src/lib/surface-url';
import { useDeviceQuery } from './device';
import { useControlPanelData } from './useControlPanelData';
import { Alert, DeviceGate, Muted, PageHeading, Section, Stat, Stats, TextField } from './ui';
import s from './ai.module.css';

const KINDS: Array<{ kind: UsageBreakdown; label: string; column: string }> = [
  { kind: 'session', label: 'By conversation', column: 'Conversation' },
  { kind: 'schedule', label: 'By schedule', column: 'Schedule' },
  { kind: 'agent', label: 'By agent', column: 'Agent' },
  { kind: 'month', label: 'By month', column: 'Month' },
];

export function UsageTab() {
  const { usageStats, connected } = useControlPanelData();
  return (
    <>
      <PageHeading lede="Requests through Tulzo's API and MCP endpoints, and what your assistant spends on its own model calls.">Usage</PageHeading>
      <Section
        title="Tulzo API usage"
        actions={
          <a className={s.btn} href={surfaceUrl('hub', '/credits')}>
            Credits and billing
          </a>
        }
      >
        <Stats>
          <Stat label="Total requests" value={usageStats ? usageStats.totalRequests.toLocaleString('en-US') : '—'} />
          <Stat label="Today" value={usageStats ? usageStats.requestsToday.toLocaleString('en-US') : '—'} />
          <Stat label="This month" value={usageStats ? usageStats.requestsThisMonth.toLocaleString('en-US') : '—'} />
        </Stats>
      </Section>
      <Section title="Device usage">{connected ? <DeviceUsage /> : <Muted>Connect the extension to see device usage.</Muted>}</Section>
    </>
  );
}

function DeviceUsage() {
  const initial = useMemo(() => currentPeriod(new Date()), []);
  const [kind, setKind] = useState<UsageBreakdown>('session');
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const summary = useDeviceQuery(request('GET_USAGE'), (raw) => ({ usage: summarizeDeviceUsage(raw) }));
  const built = buildUsageBreakdown(kind, { month, year });
  const breakdown = useDeviceQuery(built.ok ? built.request : null, (raw) => normalizeBreakdown(kind, raw));
  const column = KINDS.find((k) => k.kind === kind)!.column;

  return (
    <>
      <DeviceGate query={summary}>
        {({ usage: u }) =>
          u ? (
            <Stats>
              <Stat label="This month" value={formatCost(u.totalCost)} />
              <Stat label="Tokens in" value={formatTokens(u.inputTokens)} />
              <Stat label="Tokens out" value={formatTokens(u.outputTokens)} />
              <Stat label="Model calls" value={u.calls.toLocaleString('en-US')} />
            </Stats>
          ) : (
            <Muted>No usage recorded on this device yet.</Muted>
          )
        }
      </DeviceGate>

      <div className={s.toolbar}>
        <div className={s.segmented} role="group" aria-label="Breakdown">
          {KINDS.map((k) => (
            <button key={k.kind} type="button" className={s.segment} aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
              {k.label}
            </button>
          ))}
        </div>
        {kind === 'month' ? (
          <TextField label="Year" value={year} onChange={setYear} type="number" />
        ) : (
          <TextField label="Month" value={month} onChange={setMonth} type="month" />
        )}
      </div>
      {!built.ok ? <Alert>{built.error}</Alert> : null}
      {built.ok ? (
        <DeviceGate query={breakdown}>
          {(b) =>
            b.rows.length === 0 ? (
              <Muted>No usage recorded for this period.</Muted>
            ) : (
              <>
                <div className={s.tableWrap}>
                  <table className={`${s.table} ${s.stack}`}>
                    <thead>
                      <tr>
                        <th scope="col">{column}</th>
                        {kind !== 'month' ? (
                          <>
                            <th scope="col" className={s.num}>
                              Calls
                            </th>
                            <th scope="col" className={s.num}>
                              Tokens
                            </th>
                          </>
                        ) : null}
                        <th scope="col" className={s.num}>
                          Cost
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.rows.map((r) => (
                        <tr key={r.key}>
                          <td data-label={column}>
                            <span className={kind === 'session' ? s.code : undefined}>{breakdownKeyLabel(kind, r.key)}</span>
                          </td>
                          {kind !== 'month' ? (
                            <>
                              <td data-label="Calls" className={s.num}>
                                {r.calls}
                              </td>
                              <td data-label="Tokens" className={s.num}>
                                {formatTokens((r.inputTokens ?? 0) + (r.outputTokens ?? 0))}
                              </td>
                            </>
                          ) : null}
                          <td data-label="Cost" className={s.num}>
                            {formatCost(r.totalCost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {b.unattributed > 0 ? <Muted>Not attributed to a row: {formatCost(b.unattributed)}</Muted> : null}
              </>
            )
          }
        </DeviceGate>
      ) : null}
    </>
  );
}

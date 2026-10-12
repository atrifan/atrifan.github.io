'use client';

import { useState } from 'react';
import { request } from '@/src/lib/bridge-commands';
import { filterLogs, normalizeLogs, type LogLevel } from '@/src/lib/ai-device-data';
import { useDeviceQuery } from './device';
import { useControlPanelData } from './useControlPanelData';
import { Button, DeviceGate, Muted, PageHeading, Section, TextField } from './ui';
import s from './ai.module.css';

const LEVELS: LogLevel[] = ['info', 'warn', 'error'];
const time = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });

export function LogsTab() {
  const { bridgeLog, clearBridgeLog } = useControlPanelData();
  const [date, setDate] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [levels, setLevels] = useState<Set<string>>(new Set(LEVELS));
  const [search, setSearch] = useState('');
  const logs = useDeviceQuery(request('GET_LOGS', date ? { date } : {}), (raw) => {
    const n = normalizeLogs(raw);
    if (n.dates.length) setDates(n.dates);
    return n;
  });

  const toggle = (l: string) =>
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });

  return (
    <>
      <PageHeading lede="What the assistant on this device has logged, and the messages between this page and the extension.">Logs</PageHeading>
      <Section title="Device logs" actions={<Button onClick={() => logs.reload()}>Refresh</Button>}>
        <DeviceGate query={logs}>
          {(data) => {
            const shown = filterLogs(data.logs, { levels, search });
            return (
              <>
                {dates.length ? (
                  <div className={s.segmented} role="group" aria-label="Day">
                    {dates.map((d) => (
                      <button key={d} type="button" className={s.segment} aria-pressed={date === d} onClick={() => setDate(d)}>
                        {d}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className={s.toolbar}>
                  <div className={s.segmented} role="group" aria-label="Levels">
                    {LEVELS.map((l) => (
                      <button key={l} type="button" className={s.segment} aria-pressed={levels.has(l)} onClick={() => toggle(l)}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <TextField label="Search logs" value={search} onChange={setSearch} />
                </div>
                {data.logs.length === 0 ? (
                  <Muted>No device logs.</Muted>
                ) : shown.length === 0 ? (
                  <Muted>No logs match these filters.</Muted>
                ) : (
                  <ul className={s.logBox} aria-label="Device log entries">
                    {shown.map((l, i) => (
                      <li key={`${l.ts}-${i}`} className={s.logLine}>
                        <span className={s.logTime}>{time(l.ts)}</span>
                        <span className={l.level === 'error' ? s.logError : l.level === 'warn' ? s.logWarn : s.logCat}>{l.level}</span>
                        <span className={s.logCat}>{l.category}</span>
                        <span>{l.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            );
          }}
        </DeviceGate>
      </Section>
      <Section title="Bridge messages" actions={<Button onClick={clearBridgeLog}>Clear</Button>}>
        {bridgeLog.length === 0 ? (
          <Muted>No bridge messages yet.</Muted>
        ) : (
          <ul className={s.logBox} aria-label="Bridge messages">
            {bridgeLog.map((l, i) => (
              <li key={`${l.ts}-${i}`} className={s.logLine}>
                <span className={s.logTime}>{time(l.ts)}</span>
                <span className={s.logCat}>{l.direction === 'out' ? 'page → extension' : 'extension → page'}</span>
                <span>{l.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

'use client';

import { useState } from 'react';
import { buildScheduleAdd, request } from '@/src/lib/bridge-commands';
import { normalizeSchedules, reloadSummary, relativeTime } from '@/src/lib/ai-device-data';
import { formatCost, normalizeRuns, type ScheduleRun } from '@/src/lib/ai-usage';
import { useDeviceAction, useDeviceQuery } from './device';
import { Alert, Badge, Button, ConfirmButton, DeviceGate, Form, Muted, Notice, PageHeading, Row, Rows, Section, TextField, DeviceOnly } from './ui';
import s from './ai.module.css';

const runTime = (ts: number) => new Date(ts).toLocaleString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function SchedulesTab() {
  const schedules = useDeviceQuery(request('SCHEDULE_LIST'), normalizeSchedules);
  const action = useDeviceAction();
  const [cron, setCron] = useState('');
  const [prompt, setPrompt] = useState('');
  const [runs, setRuns] = useState<Record<string, ScheduleRun[]>>({});
  const now = Date.now();

  const change = async (key: string, req: Parameters<typeof action.run>[1], opts?: Parameters<typeof action.run>[2]) => {
    const r = await action.run(key, req, opts);
    if (!r) return null;
    if (Array.isArray((r as { schedules?: unknown }).schedules)) schedules.apply(r);
    else await schedules.reload();
    return r;
  };

  const history = async (id: string) => {
    if (runs[id]) return setRuns(({ [id]: _drop, ...rest }) => rest);
    const r = await action.run(`runs:${id}`, request('GET_SCHEDULE_RUNS', { scheduleId: id }));
    if (r) setRuns((prev) => ({ ...prev, [id]: normalizeRuns(r) }));
  };

  return (
    <>
      <PageHeading lede="Recurring tasks the assistant runs on this device.">Schedules</PageHeading>
      <DeviceOnly>
      {action.error ? <Alert>{action.error}</Alert> : null}
      {action.notice ? <Notice>{action.notice}</Notice> : null}
      <Section
        title="Your schedules"
        actions={
          schedules.status === 'ready' ? (
            <Button onClick={() => change('reload', request('RELOAD_DECLARED_SCHEDULES'), { notice: reloadSummary })} busy={action.busy === 'reload'}>
              Reload declared schedules
            </Button>
          ) : null
        }
      >
        <DeviceGate query={schedules}>
          {(rows) =>
            rows.length === 0 ? (
              <Muted>No schedules yet.</Muted>
            ) : (
              <Rows label="Schedules">
                {rows.map((sc) => {
                  const label = sc.prompt || sc.id;
                  const r = runs[sc.id];
                  return (
                    <Row
                      key={sc.id}
                      dim={!sc.enabled}
                      title={
                        <>
                          <span>{label}</span> <Badge tone={sc.enabled ? 'success' : 'neutral'}>{sc.enabled ? 'Active' : 'Paused'}</Badge>
                        </>
                      }
                      meta={
                        <>
                          <code className={s.code}>{sc.cron}</code>
                          {sc.source ? <span>from {sc.source}</span> : null}
                          <span>last run {relativeTime(sc.lastRun, now)}</span>
                        </>
                      }
                      actions={
                        <>
                          {sc.enabled ? (
                            <Button onClick={() => change(`p:${sc.id}`, request('SCHEDULE_PAUSE', { scheduleId: sc.id }))} busy={action.busy === `p:${sc.id}`} aria-label={`Pause schedule: ${label}`}>
                              Pause
                            </Button>
                          ) : (
                            <Button onClick={() => change(`r:${sc.id}`, request('SCHEDULE_RESUME', { scheduleId: sc.id }))} busy={action.busy === `r:${sc.id}`} aria-label={`Resume schedule: ${label}`}>
                              Resume
                            </Button>
                          )}
                          <Button onClick={() => history(sc.id)} busy={action.busy === `runs:${sc.id}`} aria-label={`Run history: ${label}`} aria-expanded={!!r}>
                            History
                          </Button>
                          <ConfirmButton text="Remove" label={`Remove schedule: ${label}`} confirmLabel="Confirm remove" onConfirm={() => change(`x:${sc.id}`, request('SCHEDULE_REMOVE', { scheduleId: sc.id }))} />
                        </>
                      }
                    >
                      {r ? (
                        r.length === 0 ? (
                          <Muted>No runs this month.</Muted>
                        ) : (
                          <ul className={s.rowMeta} aria-label={`Runs of ${label}`}>
                            {r.map((run) => (
                              <li key={run.key} className={s.confirm}>
                                <span>{runTime(run.startedAt)}</span>
                                <span>{formatCost(run.totalCost)}</span>
                                <span>{run.calls} calls</span>
                              </li>
                            ))}
                          </ul>
                        )
                      ) : null}
                    </Row>
                  );
                })}
              </Rows>
            )
          }
        </DeviceGate>
      </Section>
      {schedules.status === 'ready' ? (
        <Section title="Add a schedule">
          <Muted>Five cron fields: minute, hour, day of month, month, day of week. Example: 0 9 * * 1-5 is 09:00 on weekdays.</Muted>
          <Form
            onSubmit={async () => {
              if (await change('add', buildScheduleAdd({ cron, prompt }))) {
                setCron('');
                setPrompt('');
              }
            }}
          >
            <TextField label="Cron expression" value={cron} onChange={setCron} placeholder="0 9 * * 1-5" />
            <TextField label="Prompt" value={prompt} onChange={setPrompt} placeholder="Summarise my inbox" />
            <div className={s.formActions}>
              <Button type="submit" variant="primary" busy={action.busy === 'add'}>
                Add schedule
              </Button>
            </div>
          </Form>
        </Section>
      ) : null}
      </DeviceOnly>
    </>
  );
}

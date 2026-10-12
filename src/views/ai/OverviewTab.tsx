'use client';

import { useMemo, useState } from 'react';
import { request } from '@/src/lib/bridge-commands';
import { eventLabel, relativeTime } from '@/src/lib/ai-device-data';
import { formatCost } from '@/src/lib/ai-usage';
import { surfaceUrl } from '@/src/lib/surface-url';
import { useDeviceAction, useDeviceQuery } from './device';
import { useControlPanelData } from './useControlPanelData';
import { Alert, Button, Muted, Notice, PageHeading, Section, Stat, Stats } from './ui';
import s from './ai.module.css';

const planName = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);
const completedOf = (raw: unknown) => (raw as { data?: { completed?: unknown } } | null)?.data?.completed === true;

export function OverviewTab() {
  const { plan, devices, deviceLimit, usageStats, activity, connected, deviceSummary } = useControlPanelData();
  const onboarding = useDeviceQuery(useMemo(() => request('GET_ONBOARDING_STATE'), []), completedOf);
  const action = useDeviceAction();
  const [justCompleted, setJustCompleted] = useState(false);
  const now = Date.now();

  const complete = async () => {
    const r = await action.run('onboarding', request('SET_ONBOARDING_COMPLETED', { completed: true }));
    if (r) {
      onboarding.apply(r);
      setJustCompleted(true);
    }
  };

  return (
    <>
      <PageHeading lede="Your plan, devices and what your assistant has been doing.">Overview</PageHeading>

      <Section
        title="Plan"
        actions={
          <>
            {plan === 'free' ? (
              <a className={`${s.btn} ${s.btn_primary}`} href={surfaceUrl('hub', '/pricing')}>
                Upgrade
              </a>
            ) : null}
            <a className={s.btn} href={surfaceUrl('hub', '/credits')}>
              Credits and billing
            </a>
          </>
        }
      >
        <Stats>
          <Stat label="Current plan" value={planName(plan)} />
          <Stat label="Devices" value={`${devices.length} / ${deviceLimit}`} />
          <Stat label="API requests today" value={usageStats ? usageStats.requestsToday.toLocaleString('en-US') : '—'} />
          <Stat label="API requests this month" value={usageStats ? usageStats.requestsThisMonth.toLocaleString('en-US') : '—'} />
        </Stats>
      </Section>

      {connected && onboarding.status === 'ready' && (!onboarding.data || justCompleted) ? (
        <Section title={justCompleted ? 'Setup' : 'Finish setting up'}>
          {justCompleted ? (
            <Notice>Setup complete</Notice>
          ) : (
            <>
              <Muted>Pair this browser, add a model key on the device, then mark setup complete so every surface stops asking.</Muted>
              {action.error ? <Alert>{action.error}</Alert> : null}
              <div>
                <Button variant="primary" onClick={complete} busy={action.busy === 'onboarding'}>
                  Mark setup complete
                </Button>
              </div>
            </>
          )}
        </Section>
      ) : null}

      {connected ? (
        <Section title="This device">
          {deviceSummary ? (
            <Stats>
              <Stat label="Monthly cost" value={formatCost(deviceSummary.monthlyCost)} />
              <Stat label="Active model" value={deviceSummary.activeModel || '—'} small />
              <Stat label="Skills" value={deviceSummary.skills} />
              <Stat label="MCP servers connected" value={`${deviceSummary.mcpConnected} / ${deviceSummary.mcpTotal}`} />
              <Stat label="Active schedules" value={deviceSummary.activeSchedules} />
            </Stats>
          ) : (
            <Muted>Reading the device…</Muted>
          )}
        </Section>
      ) : null}

      <Section title="Recent activity">
        {activity && activity.timeline.length > 0 ? (
          <ul className={s.rows}>
            {activity.timeline.slice(0, 10).map((ev, i) => (
              <li key={`${ev.created_at}-${i}`} className={s.row}>
                <span>{eventLabel(ev.event_type)}</span>
                <span className={s.muted}>{relativeTime(ev.created_at, now)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Muted>No activity yet.</Muted>
        )}
      </Section>
    </>
  );
}

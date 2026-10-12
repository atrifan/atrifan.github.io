'use client';

import { useState } from 'react';
import { request } from '@/src/lib/bridge-commands';
import { normalizeFleet, normalizeQueue } from '@/src/lib/ai-device-data';
import { useDeviceAction, useDeviceQuery } from './device';
import { Alert, Badge, Button, DeviceGate, Muted, PageHeading, Row, Rows, Section, DeviceOnly } from './ui';

const runningOf = (raw: unknown) => ({ running: (raw as { running?: unknown } | null)?.running === true });

export function FleetTab() {
  const fleet = useDeviceQuery(request('LIST_FLEET'), normalizeFleet);
  const queue = useDeviceQuery(request('LIST_QUEUE'), normalizeQueue);
  const browser = useDeviceQuery(request('DAEMON_BROWSER_STATUS'), runningOf);
  const action = useDeviceAction();

  const refresh = () => Promise.all([fleet.reload(), queue.reload(), browser.reload()]);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const browserChange = async (key: string, req: ReturnType<typeof request>) => {
    setBrowserError(null);
    const r = (await action.run(key, req)) as { status?: string; error?: string } | null;
    // DAEMON_BROWSER_START answers { status: 'error', error } rather than failing.
    if (r && r.status === 'error') setBrowserError(r.error ?? 'The browser did not start');
    await browser.reload();
  };

  return (
    <>
      <PageHeading lede="What the assistant is doing right now: agent loops, sub-agents, the background queue and the headless browser.">Fleet</PageHeading>
      <DeviceOnly>
      {action.error ? <Alert>{action.error}</Alert> : null}
      {fleet.status !== 'disconnected' ? (
        <div>
          <Button onClick={refresh}>Refresh</Button>
        </div>
      ) : null}
      <Section title="Running now">
        <DeviceGate query={fleet}>
          {(f) =>
            f.loops.length === 0 && f.subAgents.length === 0 ? (
              <Muted>Nothing running right now.</Muted>
            ) : (
              <Rows label="Running now">
                {f.loops.map((l) => (
                  <Row
                    key={l.loopId}
                    title={
                      <>
                        <span>Agent loop</span> <Badge tone="accent">{l.surface || 'unknown surface'}</Badge>
                      </>
                    }
                    meta={<span>{l.currentAction || 'Thinking'}</span>}
                  />
                ))}
                {f.subAgents.map((a) => (
                  <Row
                    key={a.agentId}
                    title={
                      <>
                        <span>{a.defId || 'Sub-agent'}</span> <Badge tone={a.state === 'running' ? 'success' : 'warning'}>{a.state}</Badge>
                      </>
                    }
                    meta={
                      <>
                        <span>
                          {a.tokensIn.toLocaleString('en-US')} tokens in · {a.tokensOut.toLocaleString('en-US')} out
                        </span>
                        {a.currentAction ? <span>{a.currentAction}</span> : null}
                      </>
                    }
                  />
                ))}
              </Rows>
            )
          }
        </DeviceGate>
      </Section>
      <Section title="Queue">
        <DeviceGate query={queue}>
          {(q) => (
            <>
              <Muted>
                {q.running} running · {q.waiting} waiting · {q.pending} pending
              </Muted>
              {q.jobs.length === 0 ? (
                <Muted>The queue is empty.</Muted>
              ) : (
                <Rows label="Queued jobs">
                  {q.jobs.map((j) => (
                    <Row
                      key={j.id}
                      title={
                        <>
                          <span>{j.prompt || j.kind}</span> <Badge tone={j.status === 'running' ? 'success' : j.status === 'waiting' ? 'warning' : 'neutral'}>{j.status}</Badge>
                        </>
                      }
                      meta={<span>{j.kind}</span>}
                    />
                  ))}
                </Rows>
              )}
            </>
          )}
        </DeviceGate>
      </Section>
      <Section title="Headless browser">
        <DeviceGate query={browser}>
          {(b) => (
            <Rows label="Headless browser">
            <Row
              title={
                <>
                  <span>Browser</span> <Badge tone={b.running ? 'success' : 'neutral'}>{b.running ? 'Running' : 'Stopped'}</Badge>
                </>
              }
              actions={
                b.running ? (
                  <Button onClick={() => browserChange('stop', request('DAEMON_BROWSER_STOP'))} busy={action.busy === 'stop'}>
                    Stop browser
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => browserChange('start', request('DAEMON_BROWSER_START'))} busy={action.busy === 'start'}>
                    Start browser
                  </Button>
                )
              }
            />
            </Rows>
          )}
        </DeviceGate>
        {browserError ? <Alert>{browserError}</Alert> : null}
      </Section>
      </DeviceOnly>
    </>
  );
}

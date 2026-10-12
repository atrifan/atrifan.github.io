'use client';

import { useState } from 'react';
import { buildAllowSite, request } from '@/src/lib/bridge-commands';
import { allowlistSourceLabel, normalizeAllowlist } from '@/src/lib/ai-device-data';
import { useDeviceAction, useDeviceQuery } from './device';
import { Alert, Badge, Button, DeviceGate, Form, Muted, PageHeading, Row, Rows, Section, TextField, DeviceOnly } from './ui';
import s from './ai.module.css';

export function AllowlistTab() {
  const entries = useDeviceQuery(request('WHITELIST_LIST'), normalizeAllowlist);
  const action = useDeviceAction();
  const [host, setHost] = useState('');

  const change = async (key: string, req: Parameters<typeof action.run>[1]) => {
    const r = await action.run(key, req);
    if (!r) return false;
    if (Array.isArray((r as { entries?: unknown }).entries)) entries.apply(r);
    else await entries.reload();
    return true;
  };

  return (
    <>
      <PageHeading lede="Sites the assistant may open without asking. Entries from skills and plugins are managed by them.">Site allowlist</PageHeading>
      <DeviceOnly>
      {action.error ? <Alert>{action.error}</Alert> : null}
      <Section title="Allowed sites">
        <DeviceGate query={entries}>
          {(rows) =>
            rows.length === 0 ? (
              <Muted>No allowed sites yet.</Muted>
            ) : (
              <Rows label="Allowed sites">
                {rows.map((e) => (
                  <Row
                    key={`${e.source}:${e.host}`}
                    title={
                      <>
                        <span>{e.host}</span> <Badge tone={e.removable ? 'accent' : 'neutral'}>{allowlistSourceLabel(e.source)}</Badge>
                      </>
                    }
                    meta={e.reason ? <span>{e.reason}</span> : null}
                    actions={
                      e.removable ? (
                        <Button variant="ghost" onClick={() => change(`rm:${e.host}`, request('WHITELIST_REMOVE', { host: e.host }))} busy={action.busy === `rm:${e.host}`} aria-label={`Remove ${e.host}`}>
                          Remove
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </Rows>
            )
          }
        </DeviceGate>
      </Section>
      {entries.status === 'ready' ? (
        <Section title="Allow a site">
          <Form
            onSubmit={async () => {
              if (await change('add', buildAllowSite(host))) setHost('');
            }}
          >
            <TextField label="Host" value={host} onChange={setHost} placeholder="docs.example.com" />
            <div className={s.formActions}>
              <Button type="submit" variant="primary" busy={action.busy === 'add'}>
                Allow site
              </Button>
            </div>
          </Form>
        </Section>
      ) : null}
      </DeviceOnly>
    </>
  );
}

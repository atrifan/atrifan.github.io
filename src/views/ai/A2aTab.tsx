'use client';

import { useState } from 'react';
import { buildA2aAdd, buildA2aPreview, clientAuthParam, request } from '@/src/lib/bridge-commands';
import { normalizeA2aAgents } from '@/src/lib/ai-device-data';
import { useDeviceAction, useDeviceQuery } from './device';
import { CLIENT_AUTH_OPTIONS } from './McpTab';
import { Alert, Badge, Button, ConfirmButton, DeviceGate, Form, Muted, Notice, PageHeading, Row, Rows, Section, SelectField, Switch, TextField, DeviceOnly } from './ui';
import s from './ai.module.css';

interface CardPreview {
  name: string;
  description: string;
  skills: number;
}

function toPreview(raw: unknown): CardPreview | null {
  const card = (raw as { card?: { name?: unknown; description?: unknown; skills?: unknown } } | null)?.card;
  if (!card) return null;
  return { name: typeof card.name === 'string' ? card.name : 'Unnamed agent', description: typeof card.description === 'string' ? card.description : '', skills: Array.isArray(card.skills) ? card.skills.length : 0 };
}

export function A2aTab() {
  const agents = useDeviceQuery(request('A2A_LIST_AGENTS'), normalizeA2aAgents);
  const action = useDeviceAction();
  const [name, setName] = useState('');
  const [cardUrl, setCardUrl] = useState('');
  const [preview, setPreview] = useState<CardPreview | null>(null);

  const change = async (key: string, req: Parameters<typeof action.run>[1]) => {
    const r = await action.run(key, req);
    if (!r) return false;
    if (Array.isArray((r as { agents?: unknown }).agents)) agents.apply(r);
    else await agents.reload();
    return true;
  };

  return (
    <>
      <PageHeading lede="Remote agents your assistant can hand work to over the A2A protocol.">A2A peers</PageHeading>
      <DeviceOnly>
      {action.error ? <Alert>{action.error}</Alert> : null}
      <Section title="Peers">
        <DeviceGate query={agents}>
          {(rows) =>
            rows.length === 0 ? (
              <Muted>No A2A peers yet.</Muted>
            ) : (
              <Rows label="A2A peers">
                {rows.map((a) => (
                  <Row
                    key={a.id}
                    dim={!a.enabled}
                    title={
                      <>
                        <span>{a.name}</span>
                        {a.authStatus !== 'none' ? <Badge tone={a.authStatus === 'ok' ? 'success' : 'warning'}>{a.authStatus === 'ok' ? 'Signed in' : 'Sign-in needed'}</Badge> : null}
                      </>
                    }
                    meta={
                      <>
                        <span>{a.cardUrl}</span>
                        <span>
                          {a.skills} skill{a.skills === 1 ? '' : 's'}
                        </span>
                        {a.source ? <span>source: {a.source}</span> : null}
                      </>
                    }
                    actions={
                      <>
                        <Switch label={`${a.name} enabled`} checked={a.enabled} onChange={(on) => change(`en:${a.id}`, request('A2A_SET_ENABLED', { agentId: a.id, enabled: on }))} disabled={action.busy === `en:${a.id}`} />
                        {a.source === 'skill' ? (
                          <Button onClick={() => change(`rs:${a.id}`, request('A2A_RESYNC', { agentId: a.id }))} busy={action.busy === `rs:${a.id}`} aria-label={`Resync ${a.name}`}>
                            Resync
                          </Button>
                        ) : null}
                        {a.hasOAuth ? (
                          <>
                            {a.authStatus === 'ok' ? (
                              <Button variant="ghost" onClick={() => change(`out:${a.id}`, request('A2A_AUTH_REVOKE', { agentId: a.id }))} busy={action.busy === `out:${a.id}`} aria-label={`Sign out of ${a.name}`}>
                                Sign out
                              </Button>
                            ) : (
                              <Button onClick={() => change(`in:${a.id}`, request('A2A_AUTHENTICATE', { agentId: a.id }))} busy={action.busy === `in:${a.id}`} aria-label={`Sign in to ${a.name}`}>
                                Sign in
                              </Button>
                            )}
                            <SelectField
                              hideLabel
                              label={`Client authentication for ${a.name}`}
                              caption="Client authentication"
                              value={a.clientAuthMethod}
                              options={CLIENT_AUTH_OPTIONS}
                              onChange={(v) => change(`ca:${a.id}`, request('A2A_SET_CLIENT_AUTH', { agentId: a.id, method: clientAuthParam(v) }))}
                            />
                          </>
                        ) : null}
                        <ConfirmButton text="Remove" label={`Remove ${a.name}`} confirmLabel="Confirm remove" onConfirm={() => change(`rm:${a.id}`, request('A2A_REMOVE_AGENT', { agentId: a.id }))} />
                      </>
                    }
                  />
                ))}
              </Rows>
            )
          }
        </DeviceGate>
      </Section>
      {agents.status === 'ready' ? (
        <Section title="Add a peer">
          <Muted>Paste the agent&apos;s card URL (often /.well-known/agent.json). Preview it before adding.</Muted>
          <Form
            onSubmit={async () => {
              if (await change('add', buildA2aAdd({ name, cardUrl }))) {
                setName('');
                setCardUrl('');
                setPreview(null);
              }
            }}
          >
            <TextField label="Name" value={name} onChange={setName} />
            <TextField label="Agent card URL" value={cardUrl} onChange={setCardUrl} type="url" placeholder="https://agent.example/.well-known/agent.json" />
            <div className={s.formActions}>
              <Button
                onClick={async () => {
                  setPreview(null);
                  const r = await action.run('preview', buildA2aPreview(cardUrl));
                  if (r) setPreview(toPreview(r));
                }}
                busy={action.busy === 'preview'}
              >
                Preview card
              </Button>
              <Button type="submit" variant="primary" busy={action.busy === 'add'}>
                Add peer
              </Button>
            </div>
          </Form>
          {preview ? (
            <Notice>
              <strong className={s.noticePart}>{preview.name}</strong>
              {preview.description ? <span className={s.noticePart}>{preview.description}</span> : null}
              <span className={s.noticePart}>
                {preview.skills} skill{preview.skills === 1 ? '' : 's'}
              </span>
            </Notice>
          ) : null}
        </Section>
      ) : null}
      </DeviceOnly>
    </>
  );
}

'use client';

import { useState } from 'react';
import { buildSecretAdd, buildSecretUpdate, request } from '@/src/lib/bridge-commands';
import { normalizeSecrets, type SecretRow } from '@/src/lib/ai-device-data';
import { useDeviceAction, useDeviceQuery } from './device';
import { Alert, Button, ConfirmButton, DeviceGate, Form, Muted, PageHeading, Row, Rows, Section, TextField, DeviceOnly } from './ui';
import s from './ai.module.css';

/** Secret values are write-only here: the list never carries them (normalizeSecrets drops them). */
export function SecretsTab() {
  const secrets = useDeviceQuery(request('SECRETS_LIST'), normalizeSecrets);
  const action = useDeviceAction();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const change = async (key: string, req: Parameters<typeof action.run>[1]) => {
    const r = await action.run(key, req);
    if (!r) return false;
    if (Array.isArray((r as { secrets?: unknown }).secrets)) secrets.apply(r);
    else await secrets.reload();
    return true;
  };

  return (
    <>
      <PageHeading lede="Values your skills and MCP servers use as $SECRET_NAME. They stay on the device and are never shown again here.">Secrets</PageHeading>
      <DeviceOnly>
      {action.error ? <Alert>{action.error}</Alert> : null}
      <Section title="Stored secrets">
        <DeviceGate query={secrets}>
          {(rows) =>
            rows.length === 0 ? (
              <Muted>No secrets yet.</Muted>
            ) : (
              <Rows label="Secrets">
                {rows.map((sec) => (
                  <Row
                    key={sec.name}
                    title={<code className={s.code}>{sec.name}</code>}
                    meta={sec.description ? <span>{sec.description}</span> : null}
                    actions={
                      <>
                        <Button onClick={() => setEditing(editing === sec.name ? null : sec.name)} aria-expanded={editing === sec.name} aria-label={`Edit ${sec.name}`}>
                          Edit
                        </Button>
                        <ConfirmButton text="Remove" label={`Remove ${sec.name}`} confirmLabel="Confirm remove" onConfirm={() => change(`rm:${sec.name}`, request('SECRETS_REMOVE', { name: sec.name }))} />
                      </>
                    }
                  >
                    {editing === sec.name ? (
                      <EditSecret
                        secret={sec}
                        busy={action.busy === `up:${sec.name}`}
                        onSave={async (d, v) => {
                          if (await change(`up:${sec.name}`, buildSecretUpdate({ name: sec.name, description: d, value: v }))) setEditing(null);
                        }}
                      />
                    ) : null}
                  </Row>
                ))}
              </Rows>
            )
          }
        </DeviceGate>
      </Section>
      {secrets.status === 'ready' ? (
        <Section title="Add a secret">
          <Form
            onSubmit={async () => {
              if (await change('add', buildSecretAdd({ name, description, value }))) {
                setName('');
                setDescription('');
                setValue('');
              }
            }}
          >
            <TextField label="Name" value={name} onChange={setName} placeholder="GITHUB_TOKEN" />
            <TextField label="Description" value={description} onChange={setDescription} />
            <TextField label="Value" value={value} onChange={setValue} type="password" autoComplete="new-password" />
            <div className={s.formActions}>
              <Button type="submit" variant="primary" busy={action.busy === 'add'}>
                Add secret
              </Button>
            </div>
          </Form>
        </Section>
      ) : null}
      </DeviceOnly>
    </>
  );
}

function EditSecret({ secret, busy, onSave }: { secret: SecretRow; busy: boolean; onSave: (description: string, value: string) => void }) {
  const [description, setDescription] = useState(secret.description);
  const [value, setValue] = useState('');
  return (
    <Form onSubmit={() => onSave(description, value)}>
      <TextField label={`Description for ${secret.name}`} value={description} onChange={setDescription} />
      <TextField label={`New value for ${secret.name}`} value={value} onChange={setValue} type="password" autoComplete="new-password" placeholder="Leave empty to keep" />
      <div className={s.formActions}>
        <Button type="submit" variant="primary" busy={busy} aria-label={`Save ${secret.name}`}>
          Save
        </Button>
      </div>
    </Form>
  );
}

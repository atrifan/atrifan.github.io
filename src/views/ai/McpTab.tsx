'use client';

import { useState } from 'react';
import { CLIENT_AUTH_METHODS, buildMcpAdd, buildMcpDiscover, clientAuthParam, request } from '@/src/lib/bridge-commands';
import { MCP_STATUS_LABEL, describeDiscovery, normalizeMcpServers, type McpStatus } from '@/src/lib/ai-device-data';
import { useDeviceAction, useDeviceQuery } from './device';
import { useControlPanelData } from './useControlPanelData';
import { Alert, Badge, Button, ConfirmButton, DeviceGate, Form, Muted, Notice, PageHeading, Row, Rows, Section, SelectField, Switch, TextField, DeviceOnly } from './ui';
import s from './ai.module.css';

export const CLIENT_AUTH_OPTIONS = [{ value: '', label: 'Automatic' }, ...CLIENT_AUTH_METHODS.map((m) => ({ value: m, label: m }))];

const TONE: Record<McpStatus, 'success' | 'neutral' | 'warning' | 'danger'> = {
  connected: 'success',
  disconnected: 'danger',
  disabled: 'neutral',
  auth_required: 'warning',
};

export function McpTab() {
  const servers = useDeviceQuery(request('MCP_LIST_SERVERS'), normalizeMcpServers);
  const action = useDeviceAction();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [discovery, setDiscovery] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const { send } = useControlPanelData();

  /** Mutations reply with the refreshed `servers`; one without it (remove) re-reads the list. */
  const change = async (key: string, req: Parameters<typeof action.run>[1]) => {
    const r = await action.run(key, req);
    if (!r) return false;
    if (Array.isArray((r as { servers?: unknown }).servers)) servers.apply(r);
    else await servers.reload();
    return true;
  };

  return (
    <>
      <PageHeading lede="Tool servers your assistant can call. Changes apply on the device right away.">MCP servers</PageHeading>
      <DeviceOnly>
      {action.error ? <Alert>{action.error}</Alert> : null}
      {action.notice ? <Notice>{action.notice}</Notice> : null}
      <Section
        title="Servers"
        actions={
          servers.status === 'ready' ? (
            <Button onClick={() => change('reconnect-all', request('MCP_RECONNECT'))} busy={action.busy === 'reconnect-all'}>
              Reconnect all
            </Button>
          ) : null
        }
      >
        <DeviceGate query={servers}>
          {(rows) =>
            rows.length === 0 ? (
              <Muted>No MCP servers yet.</Muted>
            ) : (
              <Rows label="MCP servers">
                {rows.map((m) => (
                  <Row
                    key={m.id}
                    dim={!m.enabled}
                    title={
                      <>
                        <span>{m.name}</span> <Badge tone={TONE[m.status]}>{MCP_STATUS_LABEL[m.status]}</Badge>
                      </>
                    }
                    meta={
                      <>
                        {m.transport ? <span>{m.transport}</span> : null}
                        <span>{m.toolCount} tools</span>
                        {m.source ? <span>source: {m.source}</span> : null}
                        {m.lastError ? <span>{m.lastError}</span> : null}
                      </>
                    }
                    actions={
                      <>
                        <Switch label={`${m.name} enabled`} checked={m.enabled} onChange={(on) => change(`en:${m.id}`, request('MCP_SET_ENABLED', { serverId: m.id, enabled: on }))} disabled={action.busy === `en:${m.id}`} />
                        <Button onClick={() => change(`rc:${m.id}`, request('MCP_RECONNECT', { serverId: m.id }))} busy={action.busy === `rc:${m.id}`} aria-label={`Reconnect ${m.name}`}>
                          Reconnect
                        </Button>
                        {m.source === 'skill' ? (
                          <Button onClick={() => change(`rs:${m.id}`, request('MCP_RESYNC', { serverId: m.id }))} busy={action.busy === `rs:${m.id}`} aria-label={`Resync ${m.name}`}>
                            Resync
                          </Button>
                        ) : null}
                        {m.hasOAuth ? (
                          <SelectField
                            hideLabel
                            label={`Client authentication for ${m.name}`}
                            caption="Client authentication"
                            value={m.clientAuthMethod}
                            options={CLIENT_AUTH_OPTIONS}
                            onChange={(v) => change(`ca:${m.id}`, request('MCP_SET_CLIENT_AUTH', { serverId: m.id, method: clientAuthParam(v) }))}
                          />
                        ) : null}
                        <ConfirmButton text="Remove" label={`Remove ${m.name}`} confirmLabel="Confirm remove" onConfirm={() => change(`rm:${m.id}`, request('MCP_REMOVE_SERVER', { serverId: m.id }))} />
                      </>
                    }
                  />
                ))}
              </Rows>
            )
          }
        </DeviceGate>
      </Section>
      {servers.status === 'ready' ? (
        <Section title="Add a server">
          <Muted>An HTTP MCP server. Check sign-in first to see whether it needs an OAuth login.</Muted>
          <Form
            onSubmit={async () => {
              if (await change('add', buildMcpAdd({ name, url }))) {
                setName('');
                setUrl('');
                setDiscovery(null);
              }
            }}
          >
            <TextField label="Name" value={name} onChange={setName} />
            <TextField label="Server URL" value={url} onChange={setUrl} type="url" placeholder="https://example.com/mcp" />
            <div className={s.formActions}>
              <Button
                onClick={async () => {
                  setDiscovery(null);
                  action.clear();
                  const built = buildMcpDiscover(url);
                  if (!built.ok) return void (await action.run('discover', built));
                  setDiscovering(true);
                  try {
                    // A refusal is an answer here ("No sign-in found"), not an error.
                    setDiscovery(describeDiscovery(await send(built.request)));
                  } catch (e) {
                    setDiscovery(`Could not check sign-in: ${e instanceof Error ? e.message : String(e)}`);
                  } finally {
                    setDiscovering(false);
                  }
                }}
                busy={discovering}
              >
                Check sign-in
              </Button>
              <Button type="submit" variant="primary" busy={action.busy === 'add'}>
                Add server
              </Button>
            </div>
          </Form>
          {discovery ? (
            <Notice>
              {discovery.split(' · ').map((part) => (
                <span key={part} className={s.noticePart}>
                  {part}
                </span>
              ))}
            </Notice>
          ) : null}
        </Section>
      ) : null}
      </DeviceOnly>
    </>
  );
}

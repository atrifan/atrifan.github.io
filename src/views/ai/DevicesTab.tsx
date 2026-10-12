'use client';

import { useState } from 'react';
import { relativeTime } from '@/src/lib/ai-device-data';
import { surfaceUrl } from '@/src/lib/surface-url';
import { useControlPanelData, type DeviceItem } from './useControlPanelData';
import { Alert, Badge, Button, ConfirmButton, Modal, Muted, Notice, PageHeading, Row, Rows, Section, TextField } from './ui';
import s from './ai.module.css';

const STATUS: Record<DeviceItem['status'], { label: string; tone: 'success' | 'neutral' | 'warning' }> = {
  online: { label: 'Online', tone: 'success' },
  offline: { label: 'Offline', tone: 'neutral' },
  never_connected: { label: 'Never connected', tone: 'warning' },
};

export function DevicesTab() {
  const { devices, deviceLimit, plan, devicesLoaded, refreshDevices, connected, deviceName } = useControlPanelData();
  const [adding, setAdding] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const now = Date.now();
  const full = devices.length >= deviceLimit;

  const revoke = async (d: DeviceItem) => {
    setRevokeError(null);
    setRevoking(d.id);
    try {
      const res = await fetch('/api/keys/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyId: d.id }) });
      if (!res.ok) setRevokeError(`Could not revoke ${d.device_name}.`);
      await refreshDevices();
    } catch {
      setRevokeError('Network error. Please try again.');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <>
      <PageHeading lede="Each device connects with its own API key. Revoking a key disconnects that device.">Devices and API keys</PageHeading>
      <Section
        title={`Devices (${devices.length} of ${deviceLimit})`}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)} disabled={full || plan === 'free'}>
            Add device
          </Button>
        }
      >
        {plan === 'free' ? (
          <Muted>
            Device API keys need a paid plan.{' '}
            <a className={s.link} href={surfaceUrl('hub', '/pricing')}>
              See plans
            </a>
          </Muted>
        ) : full ? (
          <Muted>You have reached your plan&apos;s device limit.</Muted>
        ) : null}
        {revokeError ? <Alert>{revokeError}</Alert> : null}
        {!devicesLoaded ? (
          <Muted>Loading…</Muted>
        ) : devices.length === 0 ? (
          <Muted>No devices yet.</Muted>
        ) : (
          <Rows label="Devices">
            {devices.map((d) => {
              const live = connected && (d.device_name === deviceName || devices.length === 1);
              const status = STATUS[live ? 'online' : d.status] ?? STATUS.offline;
              return (
                <Row
                  key={d.id}
                  title={
                    <>
                      <span>{d.device_name}</span> <Badge tone={status.tone}>{status.label}</Badge>
                    </>
                  }
                  meta={
                    <>
                      <span>Key ending {d.api_key_suffix}</span>
                      {d.platform ? <span>{[d.platform, d.arch].filter(Boolean).join(' · ')}</span> : null}
                      {d.model ? <span>{d.model}</span> : null}
                      <span>Last seen {relativeTime(d.last_seen_at, now)}</span>
                    </>
                  }
                  actions={
                    <>
                      {d.is_active && plan !== 'free' ? (
                        <a className={s.btn} href={surfaceUrl('chat', `/?device=${encodeURIComponent(d.id)}`)} aria-label={`Chat with ${d.device_name}`}>
                          Chat
                        </a>
                      ) : null}
                      <ConfirmButton text="Revoke" label={`Revoke ${d.device_name}`} confirmLabel="Confirm revoke" onConfirm={() => revoke(d)} busy={revoking === d.id} />
                    </>
                  }
                />
              );
            })}
          </Rows>
        )}
      </Section>
      {adding ? <AddDeviceDialog onClose={() => setAdding(false)} /> : null}
    </>
  );
}

function AddDeviceDialog({ onClose }: { onClose: () => void }) {
  const { connected, refreshDevices, activateDevice } = useControlPanelData();
  const [name, setName] = useState('');
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!name.trim()) return setError('Enter a device name');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/keys/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_name: name.trim() }) });
      const data = (await res.json().catch(() => ({}))) as { apiKey?: string; error?: string; limit?: number };
      if (!res.ok || !data.apiKey) {
        setError(
          data.error === 'device_limit_reached'
            ? `Device limit reached (${data.limit ?? deviceLimitText}). Upgrade your plan to add more devices.`
            : data.error === 'device_name_exists'
              ? `A device named "${name.trim()}" already exists.`
              : (data.error ?? 'Could not add the device.'),
        );
        return;
      }
      setKey(data.apiKey);
      refreshDevices();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add device" onClose={onClose}>
      {!key ? (
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            generate();
          }}
        >
          <TextField label="Device name" value={name} onChange={setName} placeholder="Work laptop" />
          {error ? <Alert>{error}</Alert> : null}
          <div className={s.formActions}>
            <Button type="submit" variant="primary" busy={busy}>
              Generate key
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </div>
        </form>
      ) : (
        <>
          <Muted>Copy this API key now. It won&apos;t be shown again.</Muted>
          <code className={s.keyBox}>{key}</code>
          {sent ? <Notice>Sent to the extension</Notice> : null}
          <div className={s.formActions}>
            <Button
              onClick={() => {
                navigator.clipboard?.writeText(key).catch(() => {});
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy key'}
            </Button>
            {connected ? (
              <Button
                variant="primary"
                onClick={() => {
                  activateDevice(key, name.trim());
                  setSent(true);
                }}
              >
                Send to extension
              </Button>
            ) : null}
            <Button onClick={onClose}>Done</Button>
          </div>
          {!connected ? <Muted>Extension not detected here: paste the key into the extension&apos;s settings.</Muted> : null}
        </>
      )}
    </Modal>
  );
}

const deviceLimitText = 'your plan';

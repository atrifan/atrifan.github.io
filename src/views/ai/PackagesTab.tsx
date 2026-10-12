'use client';

import { useState } from 'react';
import { activationChoice, request } from '@/src/lib/bridge-commands';
import { normalizeInstalled, normalizeSkills, type SkillRow } from '@/src/lib/ai-device-data';
import { surfaceUrl } from '@/src/lib/surface-url';
import { useDeviceAction, useDeviceQuery } from './device';
import { Alert, Badge, Button, ConfirmButton, DeviceGate, Modal, Muted, Notice, PageHeading, Row, Rows, Section, SelectField, Switch, TextField, DeviceOnly } from './ui';
import s from './ai.module.css';

const ACTIVATION = [
  { value: '', label: 'Follow the skill file' },
  { value: 'always', label: 'Always' },
  { value: 'on-demand', label: 'On demand' },
];

export function PackagesTab() {
  const installed = useDeviceQuery(request('LIST_INSTALLED'), normalizeInstalled);
  const skills = useDeviceQuery(request('LIST_SKILLS'), normalizeSkills);
  const action = useDeviceAction();
  const [settings, setSettings] = useState<{ skillId: string; file: string; content: string } | null>(null);

  const change = async (key: string, req: Parameters<typeof action.run>[1], after: () => Promise<void>) => {
    if (await action.run(key, req)) await after();
  };
  const reloadSkills = () => skills.reload();
  const reloadInstalled = () => installed.reload();

  const openSettings = async (skill: SkillRow) => {
    const r = (await action.run(`settings:${skill.id}`, request('GET_SKILL_SETTINGS', { skillId: skill.id }))) as { settingsFile?: string; content?: string } | null;
    if (r) setSettings({ skillId: skill.id, file: r.settingsFile || skill.settingsFile || 'settings.yaml', content: r.content ?? '' });
  };

  return (
    <>
      <PageHeading
        lede={
          <>
            What is installed on this device. To find more,{' '}
            <a className={s.link} href={surfaceUrl('marketplace', '/')}>
              Browse the marketplace
            </a>
            .
          </>
        }
      >
        Packages and skills
      </PageHeading>
      <DeviceOnly>
      {action.error && !settings ? <Alert>{action.error}</Alert> : null}
      {action.notice ? <Notice>{action.notice}</Notice> : null}

      <Section title="Installed packages">
        <DeviceGate query={installed}>
          {(rows) =>
            rows.length === 0 ? (
              <Muted>No packages installed.</Muted>
            ) : (
              <Rows label="Installed packages">
                {rows.map((p) => (
                  <Row
                    key={p.id}
                    title={
                      <>
                        <span>{p.id}</span> <Badge>{p.type}</Badge>
                      </>
                    }
                    meta={p.version ? <span>v{p.version}</span> : null}
                    actions={
                      <>
                        <Button onClick={() => change(`update:${p.id}`, request('UPDATE_PACKAGE', { id: p.id }), reloadInstalled)} busy={action.busy === `update:${p.id}`} aria-label={`Update ${p.id}`}>
                          Update
                        </Button>
                        <ConfirmButton
                          text="Uninstall"
                          label={`Uninstall ${p.id}`}
                          confirmLabel="Confirm uninstall"
                          onConfirm={() => change(`uninstall:${p.id}`, request('UNINSTALL_PACKAGE', { id: p.id }), reloadInstalled)}
                          busy={action.busy === `uninstall:${p.id}`}
                        />
                      </>
                    }
                  />
                ))}
              </Rows>
            )
          }
        </DeviceGate>
      </Section>

      <Section title="Skills">
        <DeviceGate query={skills}>
          {({ skills: rows }) =>
            rows.length === 0 ? (
              <Muted>No skills on this device.</Muted>
            ) : (
              <Rows label="Skills">
                {rows.map((sk) => (
                  <Row
                    key={sk.id}
                    dim={!sk.enabled}
                    title={sk.name}
                    meta={sk.description ? <span>{sk.description}</span> : null}
                    actions={
                      <>
                        <Switch label={`${sk.name} enabled`} checked={sk.enabled} onChange={(on) => change(`skill:${sk.id}`, request('SKILL_SET_ENABLED', { id: sk.id, enabled: on }), reloadSkills)} disabled={action.busy === `skill:${sk.id}`} />
                        <SelectField
                          hideLabel
                          label={`Activation for ${sk.name}`}
                          caption="Activation"
                          value={sk.activation}
                          options={ACTIVATION}
                          onChange={(v) => change(`act:${sk.id}`, request('SKILL_SET_ACTIVATION', { id: sk.id, choice: activationChoice(v) }), reloadSkills)}
                        />
                        {sk.settingsFile ? (
                          <Button onClick={() => openSettings(sk)} busy={action.busy === `settings:${sk.id}`} aria-label={`Settings for ${sk.name}`}>
                            Settings
                          </Button>
                        ) : null}
                        {sk.deletable ? (
                          <ConfirmButton text="Delete" label={`Delete ${sk.name}`} confirmLabel="Confirm delete" onConfirm={() => change(`del:${sk.id}`, request('DELETE_SKILL', { id: sk.id }), reloadSkills)} />
                        ) : null}
                      </>
                    }
                  >
                    {sk.connectors.length ? (
                      <ul className={s.connectors} aria-label={`Sign-ins for ${sk.name}`}>
                        {sk.connectors.map((c) => (
                          <li key={c.connectorId} className={s.connector}>
                            <span>{c.label}</span>
                            <Badge tone={c.state === 'Signed in' ? 'success' : 'warning'}>{c.state}</Badge>
                            {c.authenticated ? (
                              <Button variant="ghost" onClick={() => change(`revoke:${c.connectorId}`, request('CONNECTOR_REVOKE', { connectorId: c.connectorId }), reloadSkills)} aria-label={`Sign out ${c.label}`}>
                                Sign out
                              </Button>
                            ) : null}
                            {c.refreshable ? (
                              <Button variant="ghost" onClick={() => change(`refresh:${c.connectorId}`, request('CONNECTOR_REFRESH', { connectorId: c.connectorId }), reloadSkills)} aria-label={`Refresh ${c.label}`}>
                                Refresh
                              </Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </Row>
                ))}
              </Rows>
            )
          }
        </DeviceGate>
      </Section>

      <Section title="Plugins">
        <DeviceGate query={skills}>
          {({ plugins }) =>
            plugins.length === 0 ? (
              <Muted>No plugins on this device.</Muted>
            ) : (
              <Rows label="Plugins">
                {plugins.map((p) => (
                  <Row
                    key={p.id}
                    dim={!p.enabled}
                    title={p.name}
                    meta={
                      <>
                        {p.description ? <span>{p.description}</span> : null}
                        <span>
                          {p.skillCount} skill{p.skillCount === 1 ? '' : 's'}
                        </span>
                      </>
                    }
                    actions={
                      <>
                        <Switch label={`${p.name} enabled`} checked={p.enabled} onChange={(on) => change(`plugin:${p.id}`, request('PLUGIN_SET_ENABLED', { id: p.id, enabled: on }), reloadSkills)} disabled={action.busy === `plugin:${p.id}`} />
                        {p.deletable ? (
                          <ConfirmButton text="Delete" label={`Delete ${p.name}`} confirmLabel="Confirm delete" onConfirm={() => change(`delp:${p.id}`, request('DELETE_PLUGIN', { id: p.id }), reloadSkills)} />
                        ) : null}
                      </>
                    }
                  />
                ))}
              </Rows>
            )
          }
        </DeviceGate>
      </Section>

      {settings ? (
        <Modal title={settings.file} onClose={() => setSettings(null)}>
          <TextField label="Settings (YAML)" value={settings.content} onChange={(content) => setSettings({ ...settings, content })} multiline />
          {action.error ? <Alert>{action.error}</Alert> : null}
          <div className={s.formActions}>
            <Button
              variant="primary"
              busy={action.busy === 'save-settings'}
              onClick={async () => {
                if (await action.run('save-settings', request('SET_SKILL_SETTINGS', { skillId: settings.skillId, content: settings.content }), { notice: () => 'Settings saved' })) {
                  setSettings(null);
                  reloadSkills();
                }
              }}
            >
              Save settings
            </Button>
            <Button onClick={() => setSettings(null)}>Cancel</Button>
          </div>
        </Modal>
      ) : null}
      </DeviceOnly>
    </>
  );
}

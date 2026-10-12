'use client';

import { useEffect, useState } from 'react';
import { request } from '@/src/lib/bridge-commands';
import { NOTIFICATION_EVENTS, setChannelEnabled, toNotificationConfig, toNotificationModel, toggleRule, type NotificationModel } from '@/src/lib/ai-device-data';
import { useDeviceAction, useDeviceQuery } from './device';
import { Alert, Badge, Button, DeviceGate, Notice, PageHeading, Row, Rows, Section, Switch, DeviceOnly } from './ui';
import s from './ai.module.css';

export function NotificationsTab() {
  const loaded = useDeviceQuery(request('NOTIFICATION_GET_CONFIG'), toNotificationModel);
  const action = useDeviceAction();
  const [model, setModel] = useState<NotificationModel | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (loaded.data) setModel(loaded.data);
  }, [loaded.data]);

  const edit = (next: NotificationModel) => {
    setSaved(false);
    setModel(next);
  };

  const save = async () => {
    if (!model) return;
    if (await action.run('save', request('NOTIFICATION_SET_CONFIG', { config: toNotificationConfig(model) }))) setSaved(true);
  };

  return (
    <>
      <PageHeading lede="Where the assistant tells you about finished tasks, errors and sign-ins. Channels other than Chrome come from skills.">Notifications</PageHeading>
      <DeviceOnly>
      {action.error ? <Alert>{action.error}</Alert> : null}
      <DeviceGate query={loaded}>
        {() =>
          model ? (
            <>
              <Section title="Channels">
                <Rows label="Channels">
                  {model.channels.map((c) => (
                    <Row
                      key={c.id}
                      title={
                        <>
                          <span>{c.name}</span> {c.builtin ? <Badge>built-in</Badge> : null}
                        </>
                      }
                      actions={<Switch label={`${c.name} enabled`} checked={c.enabled} onChange={(on) => edit(setChannelEnabled(model, c.id, on))} />}
                    />
                  ))}
                </Rows>
                <Rows label="Sound">
                  <Row title="Play a sound" actions={<Switch label="Play a sound" checked={model.soundEnabled} onChange={(on) => edit({ ...model, soundEnabled: on })} />} />
                </Rows>
              </Section>
              <Section title="Rules">
                <div className={s.tableWrap}>
                  <table className={`${s.table} ${s.stack}`}>
                    <caption className="visually-hidden">Which channels each event goes to</caption>
                    <thead>
                      <tr>
                        <th scope="col">Event</th>
                        {model.channels.map((c) => (
                          <th key={c.id} scope="col" className={s.checkCell}>
                            {c.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {NOTIFICATION_EVENTS.map((e) => (
                        <tr key={e.id}>
                          <th scope="row">{e.label}</th>
                          {model.channels.map((c) => (
                            <td key={c.id} data-label={c.name} className={s.checkCell}>
                              <input
                                type="checkbox"
                                className={s.checkbox}
                                aria-label={`${e.label} via ${c.name}`}
                                checked={model.rules[e.id].includes(c.id)}
                                onChange={() => edit(toggleRule(model, e.id, c.id))}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
              <div className={s.formActions}>
                <Button variant="primary" onClick={save} busy={action.busy === 'save'}>
                  Save notification settings
                </Button>
                {saved ? <Notice>Saved</Notice> : null}
              </div>
            </>
          ) : null
        }
      </DeviceGate>
      </DeviceOnly>
    </>
  );
}

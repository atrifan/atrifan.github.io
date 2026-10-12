'use client';

import { request } from '@/src/lib/bridge-commands';
import { isVersionOutdated, normalizeProviders, normalizeVersion } from '@/src/lib/ai-device-data';
import { useDeviceQuery } from './device';
import { useControlPanelData } from './useControlPanelData';
import { Badge, DeviceGate, Muted, PageHeading, Row, Rows, Section, Stat, Stats, DeviceOnly } from './ui';

export function ProvidersTab() {
  const { latestVersion } = useControlPanelData();
  const providers = useDeviceQuery(request('GET_PROVIDERS'), normalizeProviders);
  const version = useDeviceQuery(request('GET_VERSION'), (raw) => ({ info: normalizeVersion(raw) }));

  return (
    <>
      <PageHeading lede="The model providers configured on this device and the assistant version it runs. Change providers in the extension's settings.">Providers</PageHeading>
      <DeviceOnly>
      <Section title="Model providers">
        <DeviceGate query={providers}>
          {(p) =>
            p.providers.length === 0 ? (
              <Muted>No providers configured on this device.</Muted>
            ) : (
              <Rows label="Model providers">
                {p.providers.map((pr) => (
                  <Row
                    key={pr.name}
                    title={
                      <>
                        <span>{pr.name}</span> {pr.active ? <Badge tone="success">Active</Badge> : null}
                      </>
                    }
                    meta={pr.models.length ? pr.models.map((m) => <span key={m}>{m}</span>) : <span>No models listed</span>}
                  />
                ))}
              </Rows>
            )
          }
        </DeviceGate>
      </Section>
      <Section title="Assistant">
        <DeviceGate query={version}>
          {({ info }) =>
            info ? (
              <>
                <Stats>
                  <Stat label="Version" value={`Version ${info.version}`} />
                  <Stat label="Platform" value={[info.platform, info.arch].filter(Boolean).join(' · ') || '—'} />
                  <Stat label="Node" value={info.nodeVersion || '—'} />
                  <Stat label="Commit" value={info.gitCommit ? info.gitCommit.slice(0, 8) : '—'} />
                </Stats>
                {isVersionOutdated(info.version, latestVersion) ? <Muted>Version {latestVersion} is available.</Muted> : null}
              </>
            ) : (
              <Muted>The device did not report its version.</Muted>
            )
          }
        </DeviceGate>
      </Section>
      </DeviceOnly>
    </>
  );
}

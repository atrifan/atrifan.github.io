'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AI_TABS, tabFromPathname, tabHref } from '@/src/lib/ai-tabs';
import { ControlPanelDataProvider, useControlPanelData } from './useControlPanelData';
import s from './ai.module.css';

/**
 * Frame of every ai. section: the section nav (one URL per section), the extension status, and the shared
 * control-panel data. Mounted by app/(ai)/ai/layout.tsx so it stays put while moving between sections.
 * Signed-in only, so no ads here (see src/lib/ads-policy.ts).
 */
export function AiShell({ base, showDownloads, children }: { base: string; showDownloads: boolean; children: React.ReactNode }) {
  return (
    <ControlPanelDataProvider base={base} showDownloads={showDownloads}>
      <div className={s.shell}>
        <Side />
        <div className={s.main}>{children}</div>
      </div>
    </ControlPanelDataProvider>
  );
}

function Side() {
  const { base, connected, deviceName } = useControlPanelData();
  const current = tabFromPathname(usePathname() || '/', base);
  return (
    <div className={s.side}>
      <span className={s.eyebrow}>AI control panel</span>
      <p className={s.status}>
        <span className={`${s.dot} ${connected ? s.dotOn : ''}`} aria-hidden="true" />
        {connected ? `Extension connected${deviceName ? ` · ${deviceName}` : ''}` : 'Extension not connected'}
      </p>
      <nav aria-label="AI sections" className={s.nav}>
        <ul>
          {AI_TABS.map((t) => (
            <li key={t.slug || 'overview'}>
              <Link href={tabHref(t, base)} className={s.navLink} aria-current={current?.slug === t.slug ? 'page' : undefined}>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

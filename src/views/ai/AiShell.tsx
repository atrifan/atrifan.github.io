'use client';

import { useEffect, useRef } from 'react';
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
  const navRef = useRef<HTMLElement>(null);
  // On narrow screens the section list is a sideways-scrolling strip: keep the current section in view.
  useEffect(() => {
    const link = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!link) return;
    for (let el = link.parentElement; el && el !== navRef.current?.parentElement; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth) {
        const box = el.getBoundingClientRect();
        const target = link.getBoundingClientRect();
        el.scrollLeft += target.left - box.left - (box.width - target.width) / 2;
        break;
      }
    }
  }, [current?.slug]);
  return (
    <div className={s.side}>
      <span className={s.eyebrow}>AI control panel</span>
      <p className={s.status}>
        <span className={`${s.dot} ${connected ? s.dotOn : ''}`} aria-hidden="true" />
        {connected ? `Extension connected${deviceName ? ` · ${deviceName}` : ''}` : 'Extension not connected'}
      </p>
      <nav ref={navRef} aria-label="AI sections" className={s.nav}>
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

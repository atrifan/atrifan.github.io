'use client';

import { useEffect, useRef, useState } from 'react';
import { ADS_CONFIG } from '../config/ads.config';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * The single footer ad slot. Small (max 100px tall), reserved space so it
 * never shifts the layout, and lazy: the AdSense <ins> is only created once
 * the slot scrolls into view. The AppShell decides whether to render it.
 */
export function AdBanner({ slot = ADS_CONFIG.footerSlot }: { slot?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px 0px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Blocked or not loaded: the slot stays empty.
    }
  }, [inView]);

  if (!ADS_CONFIG.enabled) return null;

  return (
    <aside ref={ref} className="ad-slot" data-ad-slot={slot} aria-label="Advertisement">
      {inView && (
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', height: '100%' }}
          data-ad-client={ADS_CONFIG.publisherId}
          data-ad-slot={slot}
          data-ad-format="horizontal"
          data-full-width-responsive="false"
        />
      )}
    </aside>
  );
}

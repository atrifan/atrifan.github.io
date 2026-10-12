'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Script from 'next/script';
import { consentFromPreference, type ConsentState } from '@/src/lib/consent';
import { ADS_CONFIG } from '@/src/config/ads.config';

/**
 * Loads Google Analytics and AdSense only after the visitor consents in the iubenda
 * banner (measurement → GA, marketing → ads). The iubenda callback in app/layout.tsx
 * stores the preference on `window.__tulzoConsent` and fires `tulzo:consent`; iubenda
 * calls it on every page view once a preference exists.
 */

declare global {
  interface Window {
    __tulzoConsent?: unknown;
  }
}

export const CONSENT_EVENT = 'tulzo:consent';
const GA_ID = 'G-QSNTL3PGRJ';
const NONE: ConsentState = { analytics: false, ads: false };

let current: ConsentState = NONE;
const read = (): ConsentState => {
  const next = consentFromPreference(typeof window === 'undefined' ? undefined : window.__tulzoConsent);
  if (next.analytics !== current.analytics || next.ads !== current.ads) current = next;
  return current;
};

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_EVENT, onChange);
}

/** The visitor's consent; both false until they choose (and on the server). */
export function useConsent(): ConsentState {
  return useSyncExternalStore(subscribe, read, () => NONE);
}

export function ConsentScripts() {
  const { analytics, ads } = useConsent();

  useEffect(() => {
    if (!analytics) return;
    window.dataLayer = window.dataLayer || [];
    // gtag.js only reads `arguments` objects from the dataLayer, not arrays.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }, [analytics]);

  return (
    <>
      {analytics && <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />}
      {ads && ADS_CONFIG.enabled && (
        <Script
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS_CONFIG.publisherId}`}
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />
      )}
    </>
  );
}

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

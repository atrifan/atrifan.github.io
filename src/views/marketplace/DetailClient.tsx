'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { formatInstalls } from '@/src/lib/marketplace/format';
import type { InstallTarget } from '@/src/lib/marketplace/install-plan';
import { surfaceUrl } from '@/src/lib/surface-url';
import { MarketplaceBridgeProvider } from './MarketplaceBridge';
import { InstallButton, InstallFeedback } from './InstallControls';

/** Install button + live install count + feedback for the detail page header. */
export function DetailInstall({ pkg, installs }: { pkg: InstallTarget; installs: number }) {
  const [count, setCount] = useState(installs);
  return (
    <MarketplaceBridgeProvider>
      <div className="mp-detail-install">
        <span className="mp-meta">{formatInstalls(count)}</span>
        <InstallButton pkg={pkg} size="md" onCounted={() => setCount((n) => n + 1)} />
      </div>
      <InstallFeedback />
    </MarketplaceBridgeProvider>
  );
}

/** 1–5 star rating for signed-in users (POST /api/packages/[id]/ratings). */
export function RatePackage({ packageId, packagePath }: { packageId: string; packagePath: string }) {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [mine, setMine] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!isLoaded) return null;
  if (!isSignedIn) {
    return (
      <p>
        <a href={`${surfaceUrl('hub', '/sign-in')}?redirect_url=${encodeURIComponent(packagePath)}`}>Sign in to rate</a>
      </p>
    );
  }

  const rate = async (stars: number) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/packages/${encodeURIComponent(packageId)}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: stars }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMine(stars);
      setMessage({ ok: true, text: `Thanks! You rated this ${stars} ${stars === 1 ? 'star' : 'stars'}.` });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: 'Your rating was not saved. Try again.' });
    }
    setBusy(false);
  };

  return (
    <div className="mp-rate">
      <div role="group" aria-labelledby="mp-rate-label" className="mp-rate-stars">
        <span id="mp-rate-label" className="mp-rate-label">
          Your rating
        </span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="mp-star"
            aria-label={`Rate ${n} ${n === 1 ? 'star' : 'stars'}`}
            aria-pressed={mine === n}
            data-filled={mine !== null && n <= mine ? 'true' : undefined}
            disabled={busy}
            onClick={() => void rate(n)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
              <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
            </svg>
          </button>
        ))}
      </div>
      <div role="status" aria-live="polite" className="mp-notice-slot">
        {message?.ok && <p className="mp-notice mp-notice-ok">{message.text}</p>}
      </div>
      <div role="alert" className="mp-notice-slot">{message && !message.ok && <p className="mp-notice mp-notice-error">{message.text}</p>}</div>
    </div>
  );
}

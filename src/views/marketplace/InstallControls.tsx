'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import type { InstallTarget } from '@/src/lib/marketplace/install-plan';
import { surfaceUrl } from '@/src/lib/surface-url';
import { useMarketplaceBridge } from './MarketplaceBridge';

/** Install / Installed button for one package. `onCounted` runs once the install was counted. */
export function InstallButton({ pkg, onCounted, size = 'sm' }: { pkg: InstallTarget; onCounted?: () => void; size?: 'sm' | 'md' }) {
  const { installed, busyId, install } = useMarketplaceBridge();
  const { isLoaded } = useAuth();
  // Disabled until hydrated and Clerk knows who is signed in, so an early click isn't lost.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const cls = `btn btn-primary${size === 'sm' ? ' btn-sm' : ''} mp-install`;
  if (installed?.has(pkg.id)) {
    return (
      <button type="button" className={`${cls} mp-install-done`} disabled>
        Installed
      </button>
    );
  }
  const busy = busyId === pkg.id;
  return (
    <button
      type="button"
      className={cls}
      aria-label={`Install ${pkg.name}`}
      aria-busy={busy || undefined}
      disabled={busy || !hydrated || !isLoaded}
      onClick={() => void install(pkg, onCounted)}
    >
      {busy ? 'Installing…' : 'Install'}
    </button>
  );
}

/** The live region for install results, and the "Get the assistant" dialog. Render once per page. */
export function InstallFeedback() {
  const { notice, needsAssistant, closeNeedsAssistant } = useMarketplaceBridge();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (needsAssistant && !d.open) d.showModal();
    if (!needsAssistant && d.open) d.close();
  }, [needsAssistant]);

  return (
    <>
      <div role="status" aria-live="polite" className="mp-notice-slot">
        {notice?.kind === 'status' && <p className="mp-notice mp-notice-ok">{notice.text}</p>}
      </div>
      <div role="alert" className="mp-notice-slot">
        {notice?.kind === 'error' && <p className="mp-notice mp-notice-error">{notice.text}</p>}
      </div>
      <dialog
        ref={dialogRef}
        className="mp-dialog"
        aria-labelledby="mp-get-assistant-title"
        onClose={closeNeedsAssistant}
        onClick={(e) => {
          if (e.target === dialogRef.current) closeNeedsAssistant();
        }}
      >
        <div className="mp-dialog-body">
          <h2 id="mp-get-assistant-title" className="mp-dialog-title">
            Install needs the Tulzo assistant
          </h2>
          <p className="muted">
            Packages install into the Tulzo assistant in your browser. Add the extension, sign it in, then come back
            and press Install again.
          </p>
          <div className="mp-dialog-actions">
            <a className="btn btn-primary" href={surfaceUrl('ai', '/')}>
              Get the assistant
            </a>
            <button type="button" className="btn btn-secondary" onClick={closeNeedsAssistant}>
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

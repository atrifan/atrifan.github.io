'use client';

/**
 * The right-of-withdrawal waiver in front of Clerk's PricingTable (signed-in /pricing).
 *
 * Clerk runs the subscription checkout inside its own component, so we can't add a field to it
 * or refuse it server-side. Instead the table only renders after the box is ticked and the
 * consent is recorded (POST /api/legal/consent, purchase 'subscription'). Limitation: the record
 * says the user agreed before seeing the plans, not which plan they then bought; Clerk's
 * subscription webhook has that.
 */
import { useState, type ReactNode } from 'react';
import { CONSENT_TEXT } from '@/src/lib/legal/consent';
import { surfaceUrl } from '@/src/lib/surface-url';

export function SubscribeConsent({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'unticked' | 'saving' | 'recorded'>('unticked');
  const [problem, setProblem] = useState('');

  const tick = async (checked: boolean) => {
    setProblem('');
    if (!checked) {
      setState('unticked');
      return;
    }
    setState('saving');
    try {
      const res = await fetch('/api/legal/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchase: 'subscription', withdrawal_consent: true }),
      });
      if (res.status !== 201) throw new Error(String(res.status));
      setState('recorded');
    } catch {
      setState('unticked');
      setProblem("We couldn't save your confirmation. Try again.");
    }
  };

  return (
    <>
      <div className="consent-box">
        <div className="checkbox-row">
          <input
            id="subscribe-consent"
            type="checkbox"
            checked={state !== 'unticked'}
            disabled={state === 'saving'}
            onChange={(e) => void tick(e.target.checked)}
            aria-describedby="subscribe-consent-terms"
          />
          <label htmlFor="subscribe-consent">{CONSENT_TEXT.subscription}</label>
        </div>
        <p id="subscribe-consent-terms" className="muted field-help">
          Plans renew until you cancel; cancelling stops the next renewal. Read about the right of withdrawal in our{' '}
          <a href={surfaceUrl('hub', '/legal/terms#withdrawal')}>terms</a>.
        </p>
        <p className="field-error" role="alert">
          {problem}
        </p>
      </div>
      {state === 'recorded' ? (
        <div role="region" aria-label="Subscription checkout" className="pricing-table-wrapper">
          {children}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 'var(--space-3)', textAlign: 'center' }}>
          Tick the box above to choose a plan.
        </p>
      )}
    </>
  );
}

/**
 * Small building blocks shared by the gigs views: form fields with label, hint and error
 * wired up for screen readers, badges and labels. No hooks, so server and client views
 * can both use them.
 */
import type { ReactNode } from 'react';
import { categoryLabel } from '@/src/lib/jobs/client/format';

export function fieldIds(id: string) {
  return { hint: `${id}-hint`, error: `${id}-error` };
}

/** aria props for an input with an optional hint and error. */
export function describedBy(id: string, hint?: ReactNode, error?: string) {
  const ids = fieldIds(id);
  const by = [hint ? ids.hint : null, error ? ids.error : null].filter(Boolean).join(' ');
  return { 'aria-describedby': by || undefined, 'aria-invalid': error ? (true as const) : undefined };
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  const ids = fieldIds(id);
  return (
    <div className="gigs-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <p id={ids.hint} className="gigs-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={ids.error} className="gigs-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The poster's / provider's trust badge. Reviews and trust scores arrive in Phase 5. */
export function TrustBadge() {
  return (
    <span className="gig-badge" title="Reviews and trust scores are coming soon">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      </svg>
      New on Tulzo
    </span>
  );
}

export function StripeBadge() {
  return (
    <span className="gig-badge gig-badge-success">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      Stripe linked
    </span>
  );
}

export function CategoryLabel({ category }: { category: string | null }) {
  return <span className="gig-label gig-label-accent">{categoryLabel(category)}</span>;
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span className="gig-avatar" aria-hidden="true">
      {initials || '?'}
    </span>
  );
}

/** "Link Stripe" card shown when a provider action needs Stripe Connect payouts. */
export function StripeLinkCard({ title, profileUrl, children }: { title: string; profileUrl: string; children?: ReactNode }) {
  return (
    <section className="gigs-panel" aria-labelledby="stripe-link-title">
      <h2 id="stripe-link-title" className="gigs-panel-title">
        {title}
      </h2>
      <p className="gigs-hint">
        {children ??
          'Tulzo pays providers through Stripe. Link your Stripe account once on your profile (it takes a few minutes), then come back here.'}
      </p>
      <div className="gigs-form-actions">
        <a className="btn btn-primary" href={profileUrl}>
          Link Stripe on your profile
        </a>
      </div>
    </section>
  );
}

'use client';

/**
 * Hub /profile "Reviews about you" and "Trust score" sections, from GET /api/profile/reputation
 * (src/lib/reviews/review-service.ts reviewsAbout + src/lib/trust/trust-service.ts trustForUser).
 */
import { useEffect, useState } from 'react';
import { formatDate } from '@/src/lib/format';

interface Review {
  id: string;
  reviewer_role: 'customer' | 'provider';
  reviewer_name: string;
  overall: number;
  quality: number;
  communication: number;
  timeliness: number;
  body: string | null;
  job_title: string | null;
  agent_version: string | null;
  created_at: string;
}

interface Trust {
  score: number;
  level: 'new' | 'building' | 'established';
  review_count: number;
  counted: number;
  breakdown: Array<{ key: string; label: string; value: number; weight: number; evidence: number }>;
  computed_at: string;
}

interface Reputation {
  reviews: Review[];
  summary: { count: number; average: number | null };
  trust: { provider: Trust | null; agents: Array<Trust & { agent_version: string }> };
}

const LEVEL: Record<Trust['level'], string> = { new: 'New', building: 'Building', established: 'Established' };

export function ProfileReputation() {
  const [data, setData] = useState<Reputation | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/profile/reputation', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Reputation;
        if (alive) setData(body);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loading = !data && !failed;
  const trust = data?.trust.provider ?? null;

  return (
    <>
      <section className="panel" aria-labelledby="reviews-title" id="reviews" aria-busy={loading}>
        <h2 id="reviews-title">Reviews about you</h2>
        {failed ? <p className="field-error">We couldn&apos;t load your reviews. Refresh to try again.</p> : null}
        {loading ? <p className="muted">Loading…</p> : null}
        {data && data.reviews.length === 0 ? (
          <p className="empty-state">No reviews yet. Reviews from customers and providers you work with on Gigs show up here.</p>
        ) : null}
        {data && data.reviews.length > 0 ? (
          <>
            <p>
              <strong>{`${data.summary.average ?? 0} out of 5 from ${data.summary.count} ${data.summary.count === 1 ? 'review' : 'reviews'}`}</strong>
            </p>
            <ul className="link-list">
              {data.reviews.map((r) => (
                <li key={r.id} className="link-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <p>
                    <strong>{`${r.overall}/5`}</strong>
                    {` · ${r.reviewer_name} · `}
                    <span className="status-pill">{r.reviewer_role === 'customer' ? 'As provider' : 'As customer'}</span>
                  </p>
                  {r.job_title ? <p className="muted">{r.agent_version ? `${r.job_title} · agent ${r.agent_version}` : r.job_title}</p> : null}
                  {r.body ? <p>{r.body}</p> : null}
                  <p className="muted">{`Quality ${r.quality}/5 · Communication ${r.communication}/5 · Timeliness ${r.timeliness}/5 · ${formatDate(r.created_at)}`}</p>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="trust-title" id="trust" aria-busy={loading}>
        <h2 id="trust-title">Trust score</h2>
        {loading ? <p className="muted">Loading…</p> : null}
        {data && !trust ? <p className="empty-state">No trust score yet. It builds up from finished gigs, QA results and reviews.</p> : null}
        {trust ? (
          <>
            <div className="balance">
              <span className="balance-value" aria-hidden="true">
                {trust.score}
              </span>
              <span className="muted" aria-hidden="true">
                out of 100
              </span>
              <span className="visually-hidden">{`Trust score ${trust.score} out of 100`}</span>
              <span className="status-pill">{LEVEL[trust.level]}</span>
            </div>
            <p className="muted">
              Built from paid, accepted gigs: QA first-pass rate and failure severity, disputes, deadlines and price accuracy weigh the most, then reviews (weighted by how much the reviewer has spent). Older results count less.
            </p>
            <ul className="link-list">
              {trust.breakdown.map((c) => (
                <li key={c.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <span>{c.label}</span>
                  <strong>{`${Math.round(c.value * 100)}%`}</strong>
                </li>
              ))}
            </ul>
            {data && data.trust.agents.length > 0 ? (
              <>
                <h3>By agent version</h3>
                <ul className="link-list">
                  {data.trust.agents.map((a) => (
                    <li key={a.agent_version}>{`${a.agent_version}: ${a.score}`}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : null}
      </section>
    </>
  );
}

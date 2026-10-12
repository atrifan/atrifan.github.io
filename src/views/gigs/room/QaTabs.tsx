'use client';

/** Artifacts (submissions and their QA status) and QA (state and verdict reasons). */
import { qaStateLabel, toReviewItems, toSubmissionItems, type RoomQa } from '@/src/lib/jobs/client/room';
import { Empty, When } from './parts';

export function ArtifactsTab({ qa }: { qa: RoomQa | null }) {
  if (!qa) return <Empty>Loading submissions…</Empty>;
  const subs = toSubmissionItems(qa.submissions);
  if (!subs.length) return <Empty>Nothing submitted yet. The provider submits the work as a private repo at a pinned commit.</Empty>;
  return (
    <ul className="room-list" aria-label="Submissions">
      {subs.map((s) => (
        <li key={s.id} className="room-card room-artifact">
          <div className="room-steering-head">
            <h3 className="room-h">{s.attemptLabel}</h3> <span className="room-badge">{s.statusLabel}</span>{' '}
          </div>
          <dl className="room-facts room-facts-tight">
            <div>
              <dt>Repository</dt>
              <dd>{s.repo}</dd>
            </div>
            <div>
              <dt>Commit</dt>
              <dd>
                <code>{s.commit}</code>
              </dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>
                <When iso={s.at} />
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function QaTab({ qa }: { qa: RoomQa | null }) {
  if (!qa) return <Empty>Loading QA…</Empty>;
  const reviews = toReviewItems(qa.reviews);
  return (
    <div className="room-stack">
      <p className="room-qa-state">
        <span className="room-label">QA status</span> <strong>{qaStateLabel(qa.submissions)}</strong>
      </p>
      <p className="gigs-hint">
        An independent reviewer checks each submitted attempt against the acceptance criteria and gives a reason for any changes.
      </p>
      {reviews.length ? (
        <ol className="room-list" aria-label="QA verdicts">
          {reviews.map((r) => (
            <li key={r.id} className="room-card">
              <h3 className="room-h">{r.title}</h3>
              <p className="room-meta">
                <When iso={r.at} />
              </p>
              {r.reason ? <p className="gigs-prose">{r.reason}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

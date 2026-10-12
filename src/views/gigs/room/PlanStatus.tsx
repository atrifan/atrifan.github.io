'use client';

/** Plan (terms, version history with diffs) and Status (progress steps, deadline) tabs. */
import { contractStatusLabel, formatDate, formatEuros } from '@/src/lib/jobs/client/format';
import { contractSteps, creditsText, deadlineCountdown, toVersionItems, type RoomContractDetail } from '@/src/lib/jobs/client/room';
import type { ContractStatus } from '@/src/lib/jobs/job-state';
import { Empty, When } from './parts';

export function PlanTab({ plan, detail }: { plan: string | null; detail: RoomContractDetail | null }) {
  const v = detail?.current_version ?? null;
  const versions = detail ? toVersionItems(detail.versions, detail.specs) : [];
  return (
    <div className="room-stack">
      <section className="room-block" aria-labelledby="room-plan-title">
        <h3 id="room-plan-title" className="room-h">
          {"Provider's plan"}
        </h3>
        {plan ? <p className="gigs-prose">{plan}</p> : <Empty>The provider did not write a plan with the bid.</Empty>}
      </section>

      <section className="room-block" aria-labelledby="room-terms-title">
        <h3 id="room-terms-title" className="room-h">
          Current terms
        </h3>
        {v ? (
          <dl className="room-facts">
            <div>
              <dt>Price</dt>
              <dd>{formatEuros(v.price_cents)}</dd>
            </div>
            <div>
              <dt>Total with fee</dt>
              <dd>{formatEuros(v.customer_total_cents)}</dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>{v.deadline ? formatDate(v.deadline) : 'No deadline'}</dd>
            </div>
            <div>
              <dt>Contract</dt>
              <dd>{`Version ${v.version}`}</dd>
            </div>
            {detail ? (
              <div>
                <dt>Steering</dt>
                <dd>{creditsText(detail.steering_credits).replace('Steering credits: ', '')}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <Empty>Loading the contract terms…</Empty>
        )}
        {detail?.spec?.deliverables.length ? (
          <>
            <h4 className="room-h4">Deliverables</h4>
            <ul className="gigs-list">
              {detail.spec.deliverables.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="room-block" aria-labelledby="room-versions-title">
        <h3 id="room-versions-title" className="room-h">
          Version history
        </h3>
        {versions.length ? (
          <ol className="room-versions" aria-labelledby="room-versions-title">
            {versions.map((item) => (
              <li key={item.id} className="room-version">
                <p className="room-version-head">
                  <span className="room-version-name">{item.label}</span>{' '}
                  <span className={`room-badge room-badge-${item.state}`}>{item.stateLabel}</span>{' '}
                  <span className="room-meta">
                    <When iso={item.at} />
                  </span>
                </p>
                {item.changes.length ? (
                  <ul className="room-diff">
                    {item.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="gigs-hint">The terms both parties signed with the accepted bid.</p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <Empty>Loading the version history…</Empty>
        )}
      </section>
    </div>
  );
}

export function StatusTab({
  status,
  hint,
  deadline,
  paused,
}: {
  status: ContractStatus;
  hint: string;
  deadline: string | null;
  paused: string | null;
}) {
  const steps = contractSteps(status);
  return (
    <div className="room-stack">
      <p>
        <span className="gig-status">{contractStatusLabel(status)}</span>
      </p>
      <p className="gigs-hint">{hint}</p>
      {paused ? <p className="gigs-notice gigs-notice-warning">{paused}</p> : null}
      {steps ? (
        <ol className="room-steps" aria-label="Contract progress">
          {steps.map((s) => (
            <li key={s.label} className={`room-step room-step-${s.state}`} aria-current={s.state === 'current' ? 'step' : undefined}>
              <span className="room-step-dot" aria-hidden="true" />
              <span>{s.label}</span> {s.state === 'done' ? <span className="visually-hidden"> (done)</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      <dl className="room-facts">
        <div>
          <dt>Deadline</dt>
          <dd>
            {deadline ? formatDate(deadline) : 'No deadline'}
            {deadline ? (
              <span className="room-countdown" data-volatile="">
                {` · ${deadlineCountdown(deadline, new Date())}`}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
    </div>
  );
}

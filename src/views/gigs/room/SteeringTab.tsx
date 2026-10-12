'use client';

/**
 * Steering: the customer asks for a clarification, revision or scope change; the platform's
 * classification is shown plainly; the provider answers or re-estimates; the customer approves
 * (a price increase goes to the top-up Checkout, a decrease is refunded) or rejects.
 */
import { useState, type FormEvent } from 'react';
import { formatDate, formatEuros, parseEurosToCents } from '@/src/lib/jobs/client/format';
import {
  creditsText,
  estimateView,
  refundNotice,
  steeringKindText,
  toSteeringItems,
  topupView,
  type CreateSteeringInput,
  type PartyRole,
  type RoomClient,
  type RoomSteering,
  type RoomVersion,
  type SteeringCredits,
} from '@/src/lib/jobs/client/room';
import { Field } from '../ui';
import { ErrorText, When, lines, useAction } from './parts';

interface Ctx {
  client: RoomClient;
  contractId: string;
  viewer: PartyRole;
  versions: RoomVersion[];
  allowance: number;
  working: boolean;
  onChanged: () => Promise<void>;
}

export function SteeringTab({ steering, credits, ...ctx }: Ctx & { steering: RoomSteering[]; credits: SteeringCredits | null }) {
  const [notice, setNotice] = useState<string | null>(null);
  const items = [...steering].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return (
    <div className="room-stack">
      <p className="room-credits">{credits ? creditsText(credits) : 'Steering credits: …'}</p>
      <p className="gigs-hint">
        Clarifications are free. A revision of work inside the agreed spec uses one included steering credit. Anything that changes the
        spec, price or deadline is a scope change: work pauses until a new estimate is agreed.
      </p>
      {ctx.viewer === 'customer' && ctx.working ? <AskForm {...ctx} onCreated={setNotice} /> : null}
      {notice ? (
        <p role="status" className="gigs-notice gigs-notice-success">
          {notice}
        </p>
      ) : null}
      <ul className="room-list" aria-label="Steering requests">
        {items.map((s) => (
          <SteeringCard key={s.id} s={s} {...ctx} />
        ))}
        {items.length === 0 ? (
          <li className="gigs-hint room-empty">
            {ctx.viewer === 'customer'
              ? 'No requests yet. Ask a question or request a change above.'
              : 'No requests yet. The customer’s questions and change requests appear here.'}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function AskForm({ client, contractId, allowance, onChanged, onCreated }: Ctx & { onCreated: (text: string) => void }) {
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<'' | NonNullable<CreateSteeringInput['requested_kind']>>('');
  const [spec, setSpec] = useState('');
  const [price, setPrice] = useState('');
  const { busy, error, run, setError } = useAction();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError('Describe what you need.');
      return;
    }
    const cents = parseEurosToCents(price);
    if (Number.isNaN(cents) || cents === 0) {
      setError('Enter the new price in euros, like 350 or 350.50.');
      return;
    }
    const input: CreateSteeringInput = { message: message.trim() };
    if (kind) input.requested_kind = kind;
    const changes = lines(spec);
    if (changes.length) input.spec_changes = changes;
    if (cents != null) input.price_cents = cents;
    void run(async () => {
      const { decision } = await client.createSteering(contractId, input);
      onCreated(steeringKindText(decision.kind, { viewer: 'customer', allowance }));
      setMessage('');
      setKind('');
      setSpec('');
      setPrice('');
      await onChanged();
    });
  }

  return (
    <form className="room-card gigs-form" onSubmit={submit} aria-labelledby="room-ask-title">
      <h3 id="room-ask-title" className="room-h">
        Ask for a change
      </h3>
      <Field id="room-ask-message" label="What do you need?">
        <textarea id="room-ask-message" rows={3} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <div className="gigs-row">
        <Field id="room-ask-kind" label="Type" hint="Tulzo checks it either way.">
          <select id="room-ask-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="">Let Tulzo decide</option>
            <option value="clarification">Clarification</option>
            <option value="revision">Revision</option>
            <option value="scope_change">Scope change</option>
          </select>
        </Field>
        <Field id="room-ask-price" label="New price (€)" hint="Optional. Proposing a price makes it a scope change.">
          <input id="room-ask-price" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
      <Field
        id="room-ask-spec"
        label="Spec changes (one per line)"
        hint="Optional. New or changed requirements; any change here is a scope change."
      >
        <textarea id="room-ask-spec" rows={2} value={spec} onChange={(e) => setSpec(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <div className="gigs-form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Send request
        </button>
      </div>
    </form>
  );
}

function SteeringCard({ s, client, contractId, viewer, versions, allowance, working, onChanged }: Ctx & { s: RoomSteering }) {
  const [item] = toSteeringItems([s], viewer);
  const estimate = estimateView(s, versions);
  const topup = topupView(s);
  const act = useAction();
  const [notice, setNotice] = useState<string | null>(null);
  const isScope = s.kind === 'scope_change';
  const providerTurn = viewer === 'provider' && working;

  function approve() {
    void act.run(async () => {
      const res = await client.approveSteering(contractId, s.id);
      if (res.checkout_url) {
        window.location.assign(res.checkout_url);
        return;
      }
      if (res.refund)
        setNotice(
          res.refund.status === 'refunded'
            ? refundNotice(res.refund.amount_cents)
            : `${refundNotice(res.refund.amount_cents)} It's settled when the provider is paid.`,
        );
      await onChanged();
    });
  }

  return (
    <li className="room-card room-steering">
      <div className="room-steering-head">
        <p className="room-h">{steeringKindText(s.kind, { viewer, allowance })}</p>{' '}
        <span className="room-badge">{item.statusLabel}</span>{' '}
      </div>
      <p className="room-meta">
        {viewer === 'customer' ? 'You asked' : 'Customer asked'} · <When iso={s.created_at} />{' '}
      </p>
      <p className="gigs-prose">{s.message}</p>
      {s.proposed_price_cents != null || s.proposed_deadline ? (
        <ul className="room-diff">
          {s.proposed_price_cents != null ? <li>{`Proposed price: ${formatEuros(s.proposed_price_cents)}`}</li> : null}
          {s.proposed_deadline ? <li>{`Proposed deadline: ${formatDate(s.proposed_deadline)}`}</li> : null}
        </ul>
      ) : null}
      {s.spec_changes.length ? (
        <>
          <p className="room-label">Spec changes</p>
          <ul className="gigs-list">
            {s.spec_changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      ) : null}
      {s.response ? (
        <div className="room-answer">
          <p className="room-label">{viewer === 'provider' ? 'Your answer' : "Provider's answer"}</p>
          <p className="gigs-prose">{s.response}</p>
        </div>
      ) : null}

      {estimate && (s.status === 'awaiting_approval' || s.status === 'approved' || s.status === 'rejected') ? (
        <div className="room-estimate">
          <h4 className="room-h4">New estimate</h4>
          <ul className="room-diff">
            {estimate.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {estimate.deliverableChanges.length ? (
            <>
              <p className="room-label">Deliverable changes</p>
              <ul className="gigs-list">
                {estimate.deliverableChanges.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {viewer === 'customer' && s.status === 'awaiting_approval' ? (
        <div className="gigs-form-actions">
          <button type="button" className="btn btn-primary" disabled={act.busy} onClick={approve}>
            Approve
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={act.busy}
            onClick={() =>
              void act.run(async () => {
                await client.rejectSteering(contractId, s.id);
                await onChanged();
              })
            }
          >
            Reject
          </button>
        </div>
      ) : null}
      {viewer === 'customer' && isScope && (s.status === 'awaiting_estimate' || s.status === 'awaiting_provider') ? (
        <div className="gigs-form-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={act.busy}
            onClick={() =>
              void act.run(async () => {
                await client.rejectSteering(contractId, s.id);
                await onChanged();
              })
            }
          >
            Withdraw request
          </button>
        </div>
      ) : null}

      {topup ? <Topup s={s} topup={topup} viewer={viewer} client={client} contractId={contractId} onChanged={onChanged} /> : null}
      {s.refund_status !== 'none' && viewer === 'customer' && !notice ? (
        <p className="gigs-hint">
          {s.refund_status === 'refunded'
            ? refundNotice(s.refund_amount_cents)
            : s.refund_status === 'credit_settled'
              ? `${refundNotice(s.refund_amount_cents)} It was settled when the provider was paid.`
              : `${refundNotice(s.refund_amount_cents)} It's settled when the provider is paid.`}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="gigs-notice gigs-notice-success">
          {notice}
        </p>
      ) : null}

      {providerTurn && !isScope && s.status === 'open' ? (
        <AnswerForm s={s} client={client} contractId={contractId} onChanged={onChanged} />
      ) : null}
      {providerTurn && isScope && (s.status === 'awaiting_estimate' || s.status === 'awaiting_provider') ? (
        <EstimateForm s={s} client={client} contractId={contractId} onChanged={onChanged} />
      ) : null}
      <ErrorText error={act.error} />
    </li>
  );
}

function Topup({
  s,
  topup,
  viewer,
  client,
  contractId,
  onChanged,
}: {
  s: RoomSteering;
  topup: NonNullable<ReturnType<typeof topupView>>;
  viewer: PartyRole;
  client: RoomClient;
  contractId: string;
  onChanged: () => Promise<void>;
}) {
  const act = useAction();
  return (
    <div className={`gigs-notice ${topup.state === 'paid' ? 'gigs-notice-success' : 'gigs-notice-warning'}`}>
      <p>{topup.text}</p>
      {topup.note ? <p className="gigs-error">{topup.note}</p> : null}
      {viewer === 'customer' && topup.state !== 'paid' ? (
        <div className="gigs-form-actions">
          {topup.url ? (
            <a className="btn btn-primary" href={topup.url}>
              Pay the top-up
            </a>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={act.busy}
            onClick={() =>
              void act.run(async () => {
                const res = await client.regenerateTopup(contractId, s.id);
                window.location.assign(res.checkout_url);
              })
            }
          >
            Get a new checkout link
          </button>
        </div>
      ) : null}
      {viewer === 'provider' && topup.state !== 'paid' ? <p className="gigs-hint">Work stays paused until the customer pays it.</p> : null}
      <ErrorText error={act.error} />
      {act.error ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onChanged()}>
          Reload
        </button>
      ) : null}
    </div>
  );
}

function AnswerForm({
  s,
  client,
  contractId,
  onChanged,
}: {
  s: RoomSteering;
  client: RoomClient;
  contractId: string;
  onChanged: () => Promise<void>;
}) {
  const [answer, setAnswer] = useState('');
  const { busy, error, run, setError } = useAction();
  const id = `room-answer-${s.id}`;
  return (
    <form
      className="gigs-form room-subform"
      onSubmit={(e) => {
        e.preventDefault();
        if (!answer.trim()) {
          setError('Write your answer first.');
          return;
        }
        void run(async () => {
          await client.respondSteering(contractId, s.id, {
            response: answer.trim(),
          });
          setAnswer('');
          await onChanged();
        });
      }}
    >
      <Field id={id} label="Your answer" hint={s.kind === 'revision' ? 'Make the change, then say what you changed.' : undefined}>
        <textarea id={id} rows={3} maxLength={5000} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <div className="gigs-form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Send answer
        </button>
      </div>
    </form>
  );
}

function EstimateForm({
  s,
  client,
  contractId,
  onChanged,
}: {
  s: RoomSteering;
  client: RoomClient;
  contractId: string;
  onChanged: () => Promise<void>;
}) {
  const [delta, setDelta] = useState('');
  const [eta, setEta] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [note, setNote] = useState('');
  const { busy, error, run, setError } = useAction();
  const ids = (k: string) => `room-est-${k}-${s.id}`;

  function parseDelta(raw: string): number | null {
    const t = raw.trim();
    if (!t) return null;
    const neg = t.startsWith('-') || t.startsWith('−');
    const cents = parseEurosToCents(neg ? t.slice(1) : t);
    if (cents == null || Number.isNaN(cents)) return Number.NaN;
    return neg ? -cents : cents;
  }

  function send(e: FormEvent) {
    e.preventDefault();
    const cents = parseDelta(delta);
    const days = eta.trim() ? Number(eta) : null;
    if (Number.isNaN(cents)) return setError('Enter the price change in euros, like 50 or -50.');
    if (days != null && (!Number.isInteger(days) || days < 1 || days > 365)) return setError('ETA is a whole number of days, 1 to 365.');
    const changes = lines(deliverables);
    if (cents == null && days == null && changes.length === 0) return setError('Give a price change, an ETA or deliverable changes.');
    if (!note.trim()) return setError('Add a short note for the customer.');
    void run(async () => {
      await client.respondSteering(contractId, s.id, {
        response: note.trim(),
        ...(cents != null ? { estimate_delta_cents: cents } : {}),
        ...(days != null ? { eta_days: days } : {}),
        ...(changes.length ? { deliverable_changes: changes } : {}),
      });
      await onChanged();
    });
  }

  function decline() {
    if (!note.trim()) return setError('Say briefly why you decline.');
    void run(async () => {
      await client.respondSteering(contractId, s.id, {
        response: note.trim(),
        decline: true,
      });
      await onChanged();
    });
  }

  function acceptTerms() {
    void run(async () => {
      await client.acceptVersion(contractId, s.new_contract_version_id!);
      await onChanged();
    });
  }

  return (
    <form className="gigs-form room-subform" onSubmit={send} aria-label="Re-estimate the scope change">
      <p className="gigs-hint">
        Work is paused. Send a new estimate for the customer to approve, or decline and continue on the current terms.
      </p>
      {s.status === 'awaiting_provider' && s.new_contract_version_id ? (
        <div className="gigs-form-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={acceptTerms}>
            Accept the proposed terms
          </button>
        </div>
      ) : null}
      <div className="gigs-row">
        <Field id={ids('delta')} label="Price change (€)" hint="Negative lowers the price.">
          <input id={ids('delta')} type="text" inputMode="decimal" value={delta} onChange={(e) => setDelta(e.target.value)} />
        </Field>
        <Field id={ids('eta')} label="ETA (days)" hint="From today.">
          <input id={ids('eta')} type="number" min={1} max={365} value={eta} onChange={(e) => setEta(e.target.value)} />
        </Field>
      </div>
      <Field id={ids('deliv')} label="Deliverable changes (one per line)">
        <textarea id={ids('deliv')} rows={2} value={deliverables} onChange={(e) => setDeliverables(e.target.value)} />
      </Field>
      <Field id={ids('note')} label="Note to the customer">
        <textarea id={ids('note')} rows={2} maxLength={5000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <div className="gigs-form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Send estimate
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={decline}>
          Decline
        </button>
      </div>
    </form>
  );
}

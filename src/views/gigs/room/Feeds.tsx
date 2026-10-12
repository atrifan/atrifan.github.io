'use client';

/** Activity (timeline + provider progress form), Messages (chat, optimistic send) and Milestones. */
import { useRef, useState, type FormEvent } from 'react';
import {
  MILESTONE_LABELS,
  activityTimeline,
  chatItems,
  milestoneSummary,
  toMilestoneItems,
  type MilestoneStatus,
  type PartyRole,
  type PendingMessage,
  type RoomActivityEvent,
  type RoomClient,
  type RoomMessage,
  type RoomMilestone,
} from '@/src/lib/jobs/client/room';
import { withGlyphIcons } from '@/src/components/brand/UiIcons';
import { Field } from '../ui';
import { Empty, ErrorText, When, useAction } from './parts';

// ---------- Activity ----------

export function ActivityTab({
  events,
  viewer,
  canPost,
  client,
  contractId,
  onChanged,
}: {
  events: RoomActivityEvent[];
  viewer: PartyRole;
  canPost: boolean;
  client: RoomClient;
  contractId: string;
  onChanged: () => Promise<void>;
}) {
  const items = activityTimeline(events, viewer);
  return (
    <div className="room-stack">
      {canPost ? <ProgressForm client={client} contractId={contractId} onPosted={onChanged} /> : null}
      <ol className="room-timeline" aria-label="Activity">
        {items.map((a) => (
          <li key={a.id} className="room-timeline-item">
            <p className="room-meta">
              {a.actor} · <When iso={a.at} />{' '}
            </p>
            <p>{withGlyphIcons(a.summary)}</p>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="room-timeline-item room-timeline-empty gigs-hint">
            Nothing here yet. Payments, progress updates, milestones, steering and QA results show up here as they happen.
          </li>
        ) : null}
      </ol>
    </div>
  );
}

function ProgressForm({ client, contractId, onPosted }: { client: RoomClient; contractId: string; onPosted: () => Promise<void> }) {
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, run, setError } = useAction();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!summary.trim()) {
      setError('Write a short summary of what changed.');
      return;
    }
    void run(async () => {
      await client.postProgress(contractId, {
        summary: summary.trim(),
        ...(details.trim() ? { details: details.trim() } : {}),
      });
      setSummary('');
      setDetails('');
      setDone(true);
      await onPosted();
    });
  }

  return (
    <form className="room-card gigs-form" onSubmit={submit} aria-labelledby="room-progress-title">
      <h3 id="room-progress-title" className="room-h">
        Post a progress update
      </h3>
      <Field
        id="room-progress-summary"
        label="Progress update"
        hint="What changed and what's next, in a sentence or two. The customer sees this."
      >
        <textarea
          id="room-progress-summary"
          rows={2}
          maxLength={2000}
          value={summary}
          onChange={(e) => {
            setSummary(e.target.value);
            setDone(false);
          }}
        />
      </Field>
      <Field id="room-progress-details" label="Details" hint="Optional. Shown in Messages, not in the timeline. No logs or secrets.">
        <textarea id="room-progress-details" rows={3} maxLength={10000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <div className="gigs-form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Post update
        </button>
        <p role="status" className="gigs-hint">
          {done ? 'Update posted.' : ''}
        </p>
      </div>
    </form>
  );
}

// ---------- Messages ----------

let clientSeq = 0;

export function MessagesTab({
  messages,
  viewer,
  client,
  contractId,
  onSent,
}: {
  messages: RoomMessage[];
  viewer: PartyRole;
  client: RoomClient;
  contractId: string;
  onSent: (m: RoomMessage) => void;
}) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const items = chatItems(messages, pending, viewer);

  async function send(clientId: string, body: string) {
    setPending((p) => p.map((x) => (x.clientId === clientId ? { ...x, state: 'sending' } : x)));
    try {
      const { message } = await client.postMessage(contractId, body);
      onSent(message);
      setPending((p) => p.filter((x) => x.clientId !== clientId));
    } catch {
      setPending((p) => p.map((x) => (x.clientId === clientId ? { ...x, state: 'failed' } : x)));
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) {
      setError('Write a message first.');
      input.current?.focus();
      return;
    }
    setError(null);
    clientSeq += 1;
    const clientId = `pending-${Date.now()}-${clientSeq}`;
    setPending((p) => [...p, { clientId, body, at: new Date().toISOString(), state: 'sending' }]);
    setDraft('');
    void send(clientId, body);
  }

  return (
    <div className="room-stack">
      {items.length ? (
        <div role="log" aria-label="Messages" aria-live="polite">
          <ol className="room-chat">
            {items.map((m) => (
              <li key={m.key} className={`room-msg${m.mine ? ' room-msg-mine' : ''}${m.label ? ' room-msg-progress' : ''}`}>
                <p className="room-meta">
                  <span className="room-msg-author">{m.author}</span> {m.label ? <span className="room-badge">{m.label}</span> : null}{' '}
                  {m.state === 'sent' ? <When iso={m.at} /> : null}{' '}
                </p>
                <p className="gigs-prose">{m.body}</p>
                {m.state === 'sending' ? <p className="room-meta">Sending…</p> : null}
                {m.state === 'failed' ? (
                  <p className="room-msg-failed">
                    <span className="gigs-error">Not sent</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void send(m.key, m.body)}>
                      Retry
                    </button>
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div role="log" aria-label="Messages">
          <Empty>No messages yet. Questions and progress updates between you and the other party appear here.</Empty>
        </div>
      )}
      <form className="room-composer" onSubmit={submit}>
        <Field id="room-message" label="Message" error={error ?? undefined}>
          <textarea
            id="room-message"
            ref={input}
            rows={3}
            maxLength={10000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
            }}
          />
        </Field>
        <div className="gigs-form-actions">
          <button type="submit" className="btn btn-primary">
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- Milestones ----------

const STATUS_OPTIONS = Object.entries(MILESTONE_LABELS) as Array<[MilestoneStatus, string]>;

export function MilestonesTab({
  milestones,
  canEdit,
  client,
  contractId,
  onChanged,
}: {
  milestones: RoomMilestone[];
  canEdit: boolean;
  client: RoomClient;
  contractId: string;
  onChanged: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const add = useAction();
  const update = useAction();
  const sum = milestoneSummary(milestones);
  const items = toMilestoneItems(milestones);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      add.setError('Give the milestone a title.');
      return;
    }
    void add.run(async () => {
      await client.saveMilestone(contractId, {
        title: title.trim(),
        status: 'pending',
      });
      setTitle('');
      await onChanged();
    });
  }

  return (
    <div className="room-stack">
      {items.length ? (
        <>
          <p className="room-progress-line">
            <span>{`${sum.done} of ${sum.total} done`}</span>
            <progress className="room-progress" max={100} value={sum.percent} aria-label="Milestones done">
              {`${sum.percent}%`}
            </progress>
          </p>
          <ul className="room-list" aria-label="Milestones">
            {items.map((m) => (
              <li key={m.id} className={`room-card room-milestone room-milestone-${m.status}`}>
                <div className="room-milestone-body">
                  <p className="room-milestone-title">{m.title} </p>
                  {m.description ? <p className="gigs-hint">{m.description}</p> : null}
                </div>
                {canEdit ? (
                  <div className="gigs-field room-milestone-status">
                    <label htmlFor={`room-ms-${m.id}`}>{`Status of ${m.title}`}</label>
                    <select
                      id={`room-ms-${m.id}`}
                      value={m.status}
                      disabled={update.busy}
                      onChange={(e) => {
                        const status = e.target.value as MilestoneStatus;
                        void update.run(async () => {
                          await client.saveMilestone(contractId, {
                            milestone_id: m.id,
                            status,
                          });
                          await onChanged();
                        });
                      }}
                    >
                      {STATUS_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className={`room-badge room-badge-ms-${m.status}`}>{m.statusLabel}</span>
                )}
              </li>
            ))}
          </ul>
          <ErrorText error={update.error} />
        </>
      ) : (
        <Empty>
          {canEdit
            ? 'No milestones yet. Add a few checkable steps that match the deliverables.'
            : 'No milestones yet. The provider adds them once work starts.'}
        </Empty>
      )}
      {canEdit ? (
        <form className="room-inline-form" onSubmit={submit} aria-label="Add a milestone">
          <Field id="room-ms-title" label="Milestone title" error={add.error ?? undefined}>
            <input id="room-ms-title" type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <button type="submit" className="btn btn-secondary" disabled={add.busy}>
            Add milestone
          </button>
        </form>
      ) : null}
    </div>
  );
}

'use client';

/**
 * Hub /admin/inbox: complaint-form submissions and email to the support address in one list
 * (filter: All / Complaints / Emails) → a thread with its messages, status, notes and a reply
 * form. A thin client over app/api/admin/inbox/*, which wrap src/lib/support/support-service.ts.
 * Message HTML is sanitised by the server (no scripts, handlers or remote images).
 */
import { useCallback, useEffect, useState } from 'react';
import { formatDate } from '@/src/lib/format';

type Source = 'complaint' | 'email';
type Status = 'open' | 'answered' | 'closed';

interface Thread {
  id: string;
  reference: string;
  source: Source;
  category: string | null;
  subject: string;
  contact_name: string | null;
  contact_email: string;
  related?: string | null;
  status: Status;
  notes: string;
  created_at: string;
  last_message_at: string;
  message_count?: number;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<Status, string> = { open: 'Open', answered: 'Answered', closed: 'Closed' };
const SHOW: { value: '' | Source; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'complaint', label: 'Complaints' },
  { value: 'email', label: 'Emails' },
];

export function AdminInboxView({ initialSource, initialThread }: { initialSource: '' | Source; initialThread: string | null }) {
  const [source, setSource] = useState<'' | Source>(initialSource);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(initialThread);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/admin/inbox${source ? `?source=${source}` : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setThreads(((await res.json()) as { threads: Thread[] }).threads);
    } catch {
      setError("We couldn't load the inbox. Refresh to try again.");
      setThreads([]);
    }
  }, [source]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page">
      <header className="account-header">
        <h1>Inbox</h1>
        <p className="muted">Complaints from the form and email to the support address. Replies go out from the support address.</p>
      </header>

      <div className="field" style={{ maxWidth: '16rem', marginBottom: 'var(--space-4)' }}>
        <label htmlFor="inbox-show">Show</label>
        <select
          id="inbox-show"
          className="input"
          value={source}
          onChange={(e) => {
            setSource(e.target.value as '' | Source);
            setSelected(null);
          }}
        >
          {SHOW.map((s) => (
            <option key={s.label} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <p className="field-error" role="alert">
        {error}
      </p>
      {threads === null ? <p className="muted">Loading…</p> : null}
      {threads && threads.length === 0 && !error ? <p className="empty-state">Nothing here yet.</p> : null}
      {threads && threads.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table stack-sm">
            <caption className="visually-hidden">Support threads</caption>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">From</th>
                <th scope="col">Subject</th>
                <th scope="col">Status</th>
                <th scope="col">Received</th>
              </tr>
            </thead>
            <tbody>
              {threads.map((t) => (
                <tr key={t.id}>
                  <td data-label="Reference">
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      aria-label={`Open ${t.reference}`}
                      aria-pressed={selected === t.id}
                      onClick={() => setSelected(t.id)}
                    >
                      {t.reference}
                    </button>
                  </td>
                  <td data-label="From">{t.contact_name ? `${t.contact_name} <${t.contact_email}>` : t.contact_email}</td>
                  <td data-label="Subject">{`${t.source === 'complaint' ? 'Complaint · ' : ''}${t.subject}`}</td>
                  <td data-label="Status">{STATUS_LABELS[t.status]}</td>
                  <td data-label="Received">{formatDate(t.last_message_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? <ThreadDetail key={selected} id={selected} onChanged={() => void load()} /> : null}
    </div>
  );
}

function ThreadDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState<Status>('open');
  const [notes, setNotes] = useState('');
  const [reply, setReply] = useState('');
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/inbox/${id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { thread: Thread; messages: Message[] };
      setThread(body.thread);
      setMessages(body.messages);
      setStatus(body.thread.status);
      setNotes(body.thread.notes);
    } catch {
      setLoadError("We couldn't load this thread.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) return <p className="field-error">{loadError}</p>;
  if (!thread) return <p className="muted">Loading…</p>;

  const save = async () => {
    setBusy(true);
    setNotice('');
    setProblem('');
    try {
      const res = await fetch(`/api/admin/inbox/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setNotice('Saved.');
      onChanged();
    } catch {
      setProblem("We couldn't save the changes.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!reply.trim()) {
      setProblem('Write a reply first.');
      return;
    }
    setBusy(true);
    setNotice('');
    setProblem('');
    try {
      const res = await fetch(`/api/admin/inbox/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reply }),
      });
      if (res.status !== 201) throw new Error(String(res.status));
      setReply('');
      setNotice('Reply sent.');
      await load();
      onChanged();
    } catch {
      setProblem("The reply couldn't be sent. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="thread-title" style={{ marginTop: 'var(--space-5)' }}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">{`${thread.reference} · ${thread.source === 'complaint' ? 'Complaint' : 'Email'}`}</p>
          <h2 id="thread-title">{thread.subject}</h2>
        </div>
      </div>
      <dl className="kv">
        <div>
          <dt>From</dt>
          <dd>{thread.contact_name ? `${thread.contact_name} <${thread.contact_email}>` : thread.contact_email}</dd>
        </div>
        {thread.related ? (
          <div>
            <dt>Related</dt>
            <dd>{thread.related}</dd>
          </div>
        ) : null}
      </dl>

      <ol className="inbox-messages" aria-label="Messages">
        {messages.map((m) => (
          <li key={m.id} className={`inbox-message inbox-message-${m.direction}`}>
            <p className="inbox-message-meta muted">
              {`${m.direction === 'inbound' ? 'From' : 'Reply from'} ${m.from} · ${formatDate(m.created_at)}`}
            </p>
            {m.html ? (
              // Sanitised server-side (src/lib/support/sanitize-html.ts).
              <div className="inbox-message-body" dangerouslySetInnerHTML={{ __html: m.html }} />
            ) : (
              <div className="inbox-message-body inbox-message-text">{m.text}</div>
            )}
          </li>
        ))}
      </ol>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="thread-status">Status</label>
          <select id="thread-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="thread-notes">Notes</label>
        <textarea id="thread-notes" className="input" rows={3} maxLength={10000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={() => void save()} disabled={busy}>
          Save
        </button>
      </div>

      <div className="field">
        <label htmlFor="thread-reply">Reply</label>
        <textarea id="thread-reply" className="input" rows={6} maxLength={20000} value={reply} onChange={(e) => setReply(e.target.value)} />
      </div>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={busy}>
          Send reply
        </button>
      </div>
      <p className="notice" role="status">
        {notice}
      </p>
      <p className="field-error" role="alert">
        {problem}
      </p>
    </section>
  );
}

'use client';

/**
 * The complaints and reports form on hub /legal/complaints → POST /api/legal/complaints.
 * Same field rules as the server (src/lib/support/complaint.ts). Signed in, name and email are
 * prefilled from Clerk. `website` is a honeypot: hidden from people and assistive tech.
 */
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import {
  CATEGORY_LABELS,
  COMPLAINT_CATEGORIES,
  LIMITS,
  validateComplaint,
  type ComplaintCategory,
  type ComplaintField,
} from '@/src/lib/support/complaint';

type Errors = Partial<Record<ComplaintField, string>>;

const FIELD_IDS: Record<ComplaintField, string> = {
  category: 'complaint-category',
  name: 'complaint-name',
  email: 'complaint-email',
  related: 'complaint-related',
  message: 'complaint-message',
  good_faith: 'complaint-good-faith',
};

function FieldError({ field, errors }: { field: ComplaintField; errors: Errors }) {
  return (
    <p id={`${FIELD_IDS[field]}-error`} className="field-error">
      {errors[field] ?? ''}
    </p>
  );
}

export function ComplaintForm({ responseDays }: { responseDays: number }) {
  const { user, isLoaded } = useUser();
  const [category, setCategory] = useState<ComplaintCategory>('payment_refund');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [related, setRelated] = useState('');
  const [message, setMessage] = useState('');
  const [goodFaith, setGoodFaith] = useState(false);
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoaded || !user) return;
    setName((v) => v || user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ') || '');
    setEmail((v) => v || user.primaryEmailAddress?.emailAddress || '');
  }, [isLoaded, user]);

  const illegal = category === 'illegal_content';
  const describedBy = (f: ComplaintField, extra?: string) => [extra, errors[f] ? `${FIELD_IDS[f]}-error` : null].filter(Boolean).join(' ') || undefined;

  const submit = async () => {
    setProblem('');
    setDone('');
    const body = { category, name, email, related, message, good_faith: illegal ? goodFaith : undefined, website };
    const checked = validateComplaint(body);
    if (!checked.ok) {
      setErrors(checked.fields);
      const first = (Object.keys(FIELD_IDS) as ComplaintField[]).find((f) => checked.fields[f]);
      if (first) document.getElementById(FIELD_IDS[first])?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch('/api/legal/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { reference?: string; fields?: Errors; error?: string };
      if (res.status === 201 && json.reference) {
        setDone(`Thanks. We received your message. Your reference is ${json.reference}. We aim to reply within ${responseDays} days, and we sent a copy to your email.`);
        setMessage('');
        setRelated('');
        setGoodFaith(false);
      } else if (res.status === 400 && json.fields) {
        setErrors(json.fields);
      } else if (res.status === 429) {
        setProblem('Too many messages from this connection. Try again in an hour, or email us.');
      } else {
        setProblem('Your message could not be sent. Try again, or email us.');
      }
    } catch {
      setProblem('Your message could not be sent. Try again, or email us.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="legal-section legal-form-section">
      <div className="legal-section-head">
        <h2 id="form">Send a complaint or report</h2>
        <a href="#form" className="legal-anchor" aria-label="Link to this section: Send a complaint or report">
          #
        </a>
      </div>
      <form
        className="panel complaint-form"
        noValidate
        aria-labelledby="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="field">
          <label htmlFor={FIELD_IDS.category}>Category</label>
          <select
            id={FIELD_IDS.category}
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
            aria-describedby={describedBy('category')}
            aria-invalid={errors.category ? true : undefined}
          >
            {COMPLAINT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <FieldError field="category" errors={errors} />
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor={FIELD_IDS.name}>Your name</label>
            <input
              id={FIELD_IDS.name}
              className="input"
              autoComplete="name"
              maxLength={LIMITS.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-describedby={describedBy('name')}
              aria-invalid={errors.name ? true : undefined}
            />
            <FieldError field="name" errors={errors} />
          </div>
          <div className="field">
            <label htmlFor={FIELD_IDS.email}>Email</label>
            <input
              id={FIELD_IDS.email}
              className="input"
              type="email"
              autoComplete="email"
              maxLength={LIMITS.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={describedBy('email')}
              aria-invalid={errors.email ? true : undefined}
            />
            <FieldError field="email" errors={errors} />
          </div>
        </div>

        <div className="field">
          <label htmlFor={FIELD_IDS.related}>Related URL or contract ID{illegal ? '' : ' (optional)'}</label>
          <input
            id={FIELD_IDS.related}
            className="input"
            maxLength={LIMITS.related}
            value={related}
            onChange={(e) => setRelated(e.target.value)}
            aria-describedby={describedBy('related', 'complaint-related-help')}
            aria-invalid={errors.related ? true : undefined}
          />
          <p id="complaint-related-help" className="muted field-help">
            {illegal ? 'The exact URL of the content you are reporting.' : 'A page, package, job or contract this is about.'}
          </p>
          <FieldError field="related" errors={errors} />
        </div>

        <div className="field">
          <label htmlFor={FIELD_IDS.message}>Message</label>
          <textarea
            id={FIELD_IDS.message}
            className="input"
            rows={6}
            maxLength={LIMITS.messageMax}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-describedby={describedBy('message', 'complaint-message-help')}
            aria-invalid={errors.message ? true : undefined}
          />
          <p id="complaint-message-help" className="muted field-help">
            {illegal ? 'Explain why you believe the content is illegal.' : 'What happened, and what you would like us to do.'}
          </p>
          <FieldError field="message" errors={errors} />
        </div>

        {illegal ? (
          <div className="field">
            <div className="checkbox-row">
              <input
                id={FIELD_IDS.good_faith}
                type="checkbox"
                checked={goodFaith}
                onChange={(e) => setGoodFaith(e.target.checked)}
                aria-describedby={describedBy('good_faith')}
                aria-invalid={errors.good_faith ? true : undefined}
              />
              <label htmlFor={FIELD_IDS.good_faith}>
                I believe in good faith that the information in this notice is accurate and complete.
              </label>
            </div>
            <FieldError field="good_faith" errors={errors} />
          </div>
        ) : null}

        <div className="honeypot" aria-hidden="true">
          <label htmlFor="complaint-website">Leave this field empty</label>
          <input id="complaint-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>

        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
        <p className="notice" role="status">
          {done}
        </p>
        <p className="field-error" role="alert">
          {problem}
        </p>
      </form>
    </section>
  );
}

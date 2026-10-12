'use client';

/**
 * Post a job: describe the outcome → draft the spec (AI or by hand) → edit → review and
 * publish. The step and the job id live in the URL (?job=…&step=…), so a reload resumes.
 * The QA check choice is kept in sessionStorage per job and sent when a bid is accepted.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiJson } from '@/src/lib/jobs/client/api';
import { GIG_CATEGORIES, deadlineLabel, formatBudget } from '@/src/lib/jobs/client/format';
import { normalizeQaChecks, parseStoredQaChecks, qaOptions, qaReserveCredits, qaStorageKey } from '@/src/lib/jobs/client/qa-checks';
import {
  emptySpecForm,
  isoToDateInput,
  specToForm,
  validateDescribe,
  validateSpec,
  type DescribeForm,
  type SpecForm,
} from '@/src/lib/jobs/client/validation';
import type { QaCheck } from '@/src/config/qa.config';
import type { JobSpec } from '@/src/lib/jobs/schemas';
import { Field, describedBy } from './ui';
import { QaChecksFieldset } from './QaChecksFieldset';

export type WizardStep = 'describe' | 'draft' | 'edit' | 'publish';

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'describe', label: 'Describe' },
  { id: 'draft', label: 'Draft' },
  { id: 'edit', label: 'Edit' },
  { id: 'publish', label: 'Publish' },
];

export interface WizardJob {
  id: string;
  title: string;
  description: string;
  category: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  deadline: string | null;
}

interface Props {
  base: string;
  creditsUrl: string;
  qaCosts: Record<QaCheck, number>;
  initialStep: WizardStep;
  initialJob: WizardJob | null;
  initialSpec: (JobSpec & { id?: string }) | null;
}

function describeFrom(job: WizardJob | null): DescribeForm {
  return {
    title: job?.title ?? '',
    description: job?.description ?? '',
    category: job?.category ?? '',
    minBudget: job?.budget_min_cents != null ? String(job.budget_min_cents / 100) : '',
    maxBudget: job?.budget_max_cents != null ? String(job.budget_max_cents / 100) : '',
    deadline: isoToDateInput(job?.deadline),
  };
}

function Alert({ children, tone = 'danger' }: { children: ReactNode; tone?: 'danger' | 'warning' }) {
  return (
    <div role="alert" className={`gigs-notice gigs-notice-${tone}`}>
      {children}
    </div>
  );
}

export function PostJobWizard({ base, creditsUrl, qaCosts, initialStep, initialJob, initialSpec }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(initialJob ? initialStep : 'describe');
  const [job, setJob] = useState<WizardJob | null>(initialJob);
  const [describe, setDescribe] = useState<DescribeForm>(() => describeFrom(initialJob));
  const [describeErrors, setDescribeErrors] = useState<Partial<Record<keyof DescribeForm, string>>>({});
  const [instructions, setInstructions] = useState('');
  const [spec, setSpec] = useState<SpecForm>(() => (initialSpec ? specToForm(initialSpec) : emptySpecForm(initialJob)));
  const [specErrors, setSpecErrors] = useState<Partial<Record<keyof SpecForm, string>>>({});
  const [savedSpec, setSavedSpec] = useState<(JobSpec & { id?: string }) | null>(initialSpec);
  const [qa, setQa] = useState<QaCheck[]>(['basic']);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ReactNode>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (job) setQa(parseStoredQaChecks(window.sessionStorage.getItem(qaStorageKey(job.id))));
  }, [job]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const go = useCallback(
    (next: WizardStep, jobId: string | undefined = job?.id) => {
      setProblem(null);
      setSaved(null);
      setStep(next);
      const qs = jobId ? `?job=${encodeURIComponent(jobId)}&step=${next}` : '';
      router.replace(`${base}/post${qs}`, { scroll: true });
    },
    [base, job?.id, router],
  );

  const chooseQa = (id: QaCheck, on: boolean) => {
    const next = normalizeQaChecks(on ? [...qa, id] : qa.filter((c) => c !== id));
    setQa(next);
    if (job) window.sessionStorage.setItem(qaStorageKey(job.id), JSON.stringify(next));
  };

  // ---------- step 1 ----------
  async function submitDescribe(e: FormEvent) {
    e.preventDefault();
    const r = validateDescribe(describe);
    if (!r.ok) {
      setDescribeErrors(r.errors);
      return;
    }
    setDescribeErrors({});
    setBusy('describe');
    const res = job
      ? await apiJson<{ job: WizardJob }>(`/api/jobs/${job.id}`, { method: 'PATCH', body: r.value })
      : await apiJson<{ job: WizardJob }>('/api/jobs', { method: 'POST', body: r.value });
    setBusy(null);
    if (!res.ok || !res.data) {
      setProblem(<p>{res.message}</p>);
      return;
    }
    const created = res.data.job;
    setJob(created);
    if (!savedSpec) setSpec(emptySpecForm(created));
    go('draft', created.id);
  }

  // ---------- step 2 ----------
  async function draftWithAi() {
    if (!job) return;
    setBusy('ai');
    setProblem(null);
    const res = await apiJson<{ spec: JobSpec & { id: string } }>(`/api/jobs/${job.id}/spec/draft`, {
      method: 'POST',
      body: instructions.trim() ? { instructions: instructions.trim() } : {},
    });
    setBusy(null);
    if (res.ok && res.data) {
      setSavedSpec(res.data.spec);
      setSpec(specToForm(res.data.spec));
      go('edit');
      return;
    }
    if (res.status === 402 || res.error === 'insufficient_balance') {
      setProblem(
        <>
          <p>
            <strong>You&apos;re out of credits.</strong> Drafting with AI uses a few credits. Top up, or write the spec yourself for free.
          </p>
          <p>
            <a href={creditsUrl}>Top up credits</a>
          </p>
        </>,
      );
      return;
    }
    setProblem(<p>{res.message ?? 'The AI could not draft a spec. Try again or write it yourself.'}</p>);
  }

  function writeManually() {
    if (!savedSpec) setSpec(emptySpecForm(job));
    go('edit');
  }

  // ---------- step 3 ----------
  async function saveSpec(next: 'publish' | null) {
    if (!job) return;
    const r = validateSpec(spec);
    if (!r.ok) {
      setSpecErrors(r.errors);
      setSaved(null);
      return;
    }
    setSpecErrors({});
    setBusy(next ? 'review' : 'save');
    const res = await apiJson<{ spec: JobSpec & { id: string } }>(`/api/jobs/${job.id}/spec/draft`, { method: 'POST', body: { spec: r.value } });
    setBusy(null);
    if (!res.ok || !res.data) {
      setProblem(<p>{res.message}</p>);
      return;
    }
    setSavedSpec(res.data.spec);
    if (next) go(next);
    else setSaved('Draft saved.');
  }

  // ---------- step 4 ----------
  async function publish() {
    if (!job) return;
    setBusy('publish');
    setProblem(null);
    const res = await apiJson(`/api/jobs/${job.id}/spec/approve`, { method: 'POST', body: savedSpec?.id ? { spec_version_id: savedSpec.id } : {} });
    if (!res.ok) {
      setBusy(null);
      setProblem(<p>{res.message}</p>);
      return;
    }
    window.sessionStorage.setItem(qaStorageKey(job.id), JSON.stringify(qa));
    router.push(`${base}/jobs/${job.id}?published=1`);
  }

  const index = STEPS.findIndex((s) => s.id === step);
  const setD = (k: keyof DescribeForm) => (e: { target: { value: string } }) => setDescribe({ ...describe, [k]: e.target.value });
  const setS = (k: keyof SpecForm) => (e: { target: { value: string } }) => setSpec({ ...spec, [k]: e.target.value });
  const options = qaOptions(qaCosts);
  const reserve = qaReserveCredits(qa, qaCosts);

  return (
    <div className="page gigs-page">
      <div className="gigs-narrow gigs-page">
        <header className="gigs-head">
          <a className="gigs-back" href={base || '/'}>
            ← All gigs
          </a>
          <h1 className="gigs-title">Post a job</h1>
          <p className="gigs-lede">Describe the outcome, let AI help with a precise spec, then publish it for agents to bid on.</p>
        </header>

        <nav aria-label="Progress">
          <ol className="gigs-steps">
            {STEPS.map((s, i) => (
              <li key={s.id} className="gigs-step" aria-current={s.id === step ? 'step' : undefined} data-done={i < index ? 'true' : undefined}>
                {s.label}
              </li>
            ))}
          </ol>
        </nav>

        {problem ? <Alert>{problem}</Alert> : null}

        {step === 'describe' ? (
          <form className="gigs-panel gigs-form" onSubmit={submitDescribe} noValidate>
            <h2 ref={headingRef} tabIndex={-1} className="gigs-panel-title">
              Describe the outcome
            </h2>
            <Field id="job-title" label="Title" error={describeErrors.title}>
              <input id="job-title" value={describe.title} onChange={setD('title')} maxLength={200} autoComplete="off" {...describedBy('job-title', undefined, describeErrors.title)} />
            </Field>
            <Field
              id="job-description"
              label="What do you need done?"
              hint="The result you want, who it is for, and anything the agent must know."
              error={describeErrors.description}
            >
              <textarea
                id="job-description"
                rows={6}
                value={describe.description}
                onChange={setD('description')}
                {...describedBy('job-description', true, describeErrors.description)}
              />
            </Field>
            <Field id="job-category" label="Category">
              <select id="job-category" value={describe.category} onChange={setD('category')}>
                <option value="">Choose a category</option>
                {GIG_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="gigs-row">
              <Field id="job-min" label="Min budget (€)" error={describeErrors.minBudget}>
                <input id="job-min" type="number" inputMode="decimal" min={0} step="0.01" value={describe.minBudget} onChange={setD('minBudget')} {...describedBy('job-min', undefined, describeErrors.minBudget)} />
              </Field>
              <Field id="job-max" label="Max budget (€)" error={describeErrors.maxBudget}>
                <input id="job-max" type="number" inputMode="decimal" min={0} step="0.01" value={describe.maxBudget} onChange={setD('maxBudget')} {...describedBy('job-max', undefined, describeErrors.maxBudget)} />
              </Field>
            </div>
            <Field id="job-deadline" label="Deadline" hint="Optional. Agents plan their delivery around it." error={describeErrors.deadline}>
              <input id="job-deadline" type="date" value={describe.deadline} onChange={setD('deadline')} {...describedBy('job-deadline', true, describeErrors.deadline)} />
            </Field>
            <div className="gigs-form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy !== null}>
                {busy === 'describe' ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </form>
        ) : null}

        {step === 'draft' ? (
          <section className="gigs-panel gigs-form" aria-labelledby="draft-title">
            <h2 id="draft-title" ref={headingRef} tabIndex={-1} className="gigs-panel-title">
              Draft the spec
            </h2>
            <p className="gigs-hint">
              A good spec lists clear requirements, deliverables and the acceptance criteria QA will check. AI can write a first draft from your description
              (it uses a few credits), or you can write it yourself.
            </p>
            <Field id="ai-instructions" label="Instructions for the AI (optional)" hint="For example: prefer TypeScript, include tests, keep it under a week.">
              <textarea id="ai-instructions" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={4000} {...describedBy('ai-instructions', true)} />
            </Field>
            <div className="gigs-form-actions">
              <button type="button" className="btn btn-primary" onClick={draftWithAi} disabled={busy !== null}>
                {busy === 'ai' ? 'Drafting…' : 'Draft with AI'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={writeManually} disabled={busy !== null}>
                Write it myself
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go('describe')} disabled={busy !== null}>
                Back
              </button>
            </div>
          </section>
        ) : null}

        {step === 'edit' ? (
          <form
            className="gigs-panel gigs-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveSpec('publish');
            }}
            noValidate
            aria-labelledby="edit-title"
          >
            <h2 id="edit-title" ref={headingRef} tabIndex={-1} className="gigs-panel-title">
              Edit the spec
            </h2>
            <p className="gigs-hint">One item per line. Agents bid on exactly this, and QA checks the acceptance criteria.</p>
            {(
              [
                ['requirements', 'Requirements (one per line)', 5],
                ['deliverables', 'Deliverables (one per line)', 3],
                ['acceptanceCriteria', 'Acceptance criteria (one per line)', 4],
                ['constraints', 'Constraints (one per line)', 3],
                ['permittedTools', 'Permitted tools (one per line)', 3],
              ] as const
            ).map(([key, label, rows]) => (
              <Field key={key} id={`spec-${key}`} label={label} error={specErrors[key]}>
                <textarea id={`spec-${key}`} rows={rows} value={spec[key]} onChange={setS(key)} {...describedBy(`spec-${key}`, undefined, specErrors[key])} />
              </Field>
            ))}
            <div className="gigs-row gigs-row-3">
              <Field id="spec-deadline" label="Deadline" error={specErrors.deadline}>
                <input id="spec-deadline" type="date" value={spec.deadline} onChange={setS('deadline')} {...describedBy('spec-deadline', undefined, specErrors.deadline)} />
              </Field>
              <Field id="spec-min" label="Min budget (€)" error={specErrors.minBudget}>
                <input id="spec-min" type="number" inputMode="decimal" min={0} step="0.01" value={spec.minBudget} onChange={setS('minBudget')} {...describedBy('spec-min', undefined, specErrors.minBudget)} />
              </Field>
              <Field id="spec-max" label="Max budget (€)" error={specErrors.maxBudget}>
                <input id="spec-max" type="number" inputMode="decimal" min={0} step="0.01" value={spec.maxBudget} onChange={setS('maxBudget')} {...describedBy('spec-max', undefined, specErrors.maxBudget)} />
              </Field>
            </div>
            <fieldset className="gigs-fieldset">
              <legend>Security</legend>
              <Field id="spec-sensitivity" label="Data sensitivity" error={specErrors.dataSensitivity}>
                <select id="spec-sensitivity" value={spec.dataSensitivity} onChange={setS('dataSensitivity')} {...describedBy('spec-sensitivity', undefined, specErrors.dataSensitivity)}>
                  <option value="public">Public</option>
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                </select>
              </Field>
              <label className="gigs-check">
                <input type="checkbox" checked={spec.secretsAllowed} onChange={(e) => setSpec({ ...spec, secretsAllowed: e.target.checked })} />
                <span className="gigs-check-label">The work needs real secrets or credentials</span>
              </label>
              <Field id="spec-notes" label="Security notes" error={specErrors.securityNotes}>
                <textarea id="spec-notes" rows={2} value={spec.securityNotes} onChange={setS('securityNotes')} {...describedBy('spec-notes', undefined, specErrors.securityNotes)} />
              </Field>
            </fieldset>
            <QaChecksFieldset options={options} chosen={qa} onChange={chooseQa} reserve={reserve} />
            {saved ? (
              <p role="status" className="gigs-notice gigs-notice-success">
                {saved}
              </p>
            ) : null}
            <div className="gigs-form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy !== null}>
                {busy === 'review' ? 'Saving…' : 'Review and publish'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => void saveSpec(null)} disabled={busy !== null}>
                {busy === 'save' ? 'Saving…' : 'Save draft'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go('draft')} disabled={busy !== null}>
                Back
              </button>
            </div>
          </form>
        ) : null}

        {step === 'publish' ? (
          <section className="gigs-panel gigs-form" aria-labelledby="publish-title">
            <h2 id="publish-title" ref={headingRef} tabIndex={-1} className="gigs-panel-title">
              Review and publish
            </h2>
            {job ? (
              <div className="stack">
                <h3 className="gigs-section-title">{job.title}</h3>
                <p className="gigs-hint">
                  {formatBudget(savedSpec?.budget_min_cents ?? job.budget_min_cents, savedSpec?.budget_max_cents ?? job.budget_max_cents)} ·{' '}
                  {deadlineLabel(savedSpec?.deadline ?? job.deadline)}
                </p>
              </div>
            ) : null}
            {savedSpec ? (
              <>
                <SpecList title="Requirements" items={savedSpec.requirements} />
                <SpecList title="Deliverables" items={savedSpec.deliverables} />
                <SpecList title="Acceptance criteria" items={savedSpec.acceptance_criteria} />
                {savedSpec.constraints.length ? <SpecList title="Constraints" items={savedSpec.constraints} /> : null}
              </>
            ) : (
              <p>There is no saved spec yet. Go back and write one.</p>
            )}
            <div className="gigs-section">
              <h3 className="gigs-section-title">QA checks</h3>
              <ul className="gigs-list">
                {qa.map((id) => (
                  <li key={id}>{options.find((o) => o.id === id)?.label}</li>
                ))}
              </ul>
              <p className="gigs-hint">
                {reserve > 0
                  ? `Up to ${reserve.toLocaleString('en-GB')} credits are reserved when work is submitted; you pay only what QA uses.`
                  : 'Basic QA is included in the platform fee.'}
              </p>
            </div>
            <p className="gigs-hint">Publishing opens the job for bids. You can compare bids and accept one; you pay only when you accept.</p>
            <div className="gigs-form-actions">
              <button type="button" className="btn btn-primary" onClick={publish} disabled={busy !== null || !savedSpec}>
                {busy === 'publish' ? 'Publishing…' : 'Approve and publish'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => go('edit')} disabled={busy !== null}>
                Back to edit
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function SpecList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="gigs-section">
      <h3 className="gigs-section-title">{title}</h3>
      <ul className="gigs-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

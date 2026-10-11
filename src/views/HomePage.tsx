'use client';

import Link from 'next/link';
import { SignedIn, SignedOut } from '@clerk/nextjs';
import { TulzoMark } from '../components/brand/TulzoMark';
import { surfaceUrl } from '../lib/surface-url';

const FEATURES = [
  {
    title: 'Sandboxed execution',
    desc: 'Runs isolated on your machine. Your data stays local, and the agent works inside clear boundaries.',
  },
  {
    title: 'Harness skills',
    desc: 'Domain-specific practitioners with learned knowledge. Teach it your workflows and it repeats them.',
  },
  {
    title: 'Chrome extension',
    desc: 'A side-panel assistant that sees and works with any page: forms, scraping and navigation.',
  },
  {
    title: 'Telegram and more',
    desc: 'Send tasks from Telegram, get notified on Slack, or run everything from your terminal.',
  },
  {
    title: 'Headless browser',
    desc: 'In-process Playwright for background automation, scheduled or on demand.',
  },
  {
    title: 'Plan-based guardrails',
    desc: 'Rate limits, quotas and custom rules decide what the agent may do on your plan.',
  },
];

const STEPS = [
  { title: 'Create an account', desc: 'Sign up and pick the plan that fits.' },
  { title: 'Generate an API key', desc: 'Get a key from the control panel to connect the assistant.' },
  { title: 'Install the assistant', desc: 'Load the Chrome extension or run the native host from your terminal.' },
  { title: 'Automate', desc: 'Tell it what to do. It handles the browser, forms, scraping and more.' },
];

export const HomePage: React.FC = () => {
  return (
    <div className="page">
      <section className="hero">
        <TulzoMark size={72} className="hero-mark" />
        <h1 className="hero-title">Tex by Tulzo</h1>
        <p className="hero-lede">
          A sandboxed AI agent with browser automation, domain skills and multi-channel access. It runs isolated on
          your machine; talk to it from the Chrome extension, the CLI or Telegram.
        </p>
        <div className="actions">
          <SignedIn>
            <Link href={surfaceUrl('ai', '/')} className="btn btn-primary">
              Go to the control panel
            </Link>
          </SignedIn>
          <SignedOut>
            <Link href={surfaceUrl('hub', '/sign-up')} className="btn btn-primary">
              Get started
            </Link>
          </SignedOut>
          <Link href={surfaceUrl('hub', '/pricing')} className="btn btn-secondary">
            View pricing
          </Link>
        </div>
      </section>

      <section aria-labelledby="features-title" className="section">
        <h2 id="features-title" className="section-title">
          What it does
        </h2>
        <ul className="card-grid" role="list">
          {FEATURES.map((f) => (
            <li key={f.title} className="card">
              <h3 className="card-title">{f.title}</h3>
              <p className="muted">{f.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-title" className="section">
        <h2 id="how-title" className="section-title">
          How it works
        </h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-number" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 className="card-title">{s.title}</h3>
                <p className="muted">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
};

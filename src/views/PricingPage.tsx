'use client';

import Link from 'next/link';
import { SignedIn, SignedOut, PricingTable } from '@clerk/nextjs';
import { surfaceUrl } from '../lib/surface-url';

interface PricingPageProps {
  preferenced?: boolean;
}

const FAQ = [
  {
    q: 'What does the assistant actually do?',
    a: "It's a sandboxed AI agent running on your machine. It can browse the web, fill forms, scrape data, run scheduled tasks and learn domain-specific workflows, all from the Chrome extension, the CLI or Telegram.",
  },
  {
    q: 'Is my data safe?',
    a: 'The agent runs locally in your sandbox. Your credentials, browsing data and learned skills stay on your machine. The platform only stores your API key and usage stats.',
  },
  {
    q: 'What do I need a subscription for?',
    a: "A subscription unlocks the agent's full capabilities: higher request quotas, more concurrent sessions, scheduled tasks and the vector store for custom guardrails and knowledge.",
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from your control panel or the Stripe portal. You keep access until the end of the billing period.',
  },
  {
    q: 'How do I talk to the assistant?',
    a: 'Three ways: the Chrome extension side panel for in-browser tasks, the CLI for terminal automation, or the Telegram bot for remote tasks and notifications.',
  },
];

export const PricingPage: React.FC<PricingPageProps> = ({ preferenced }) => {
  return (
    <div className="page">
      <section className="hero hero-compact">
        <h1 className="hero-title">Simple, transparent pricing</h1>
        <p className="hero-lede">Free tools for everyone. Upgrade for AI workflow automation and MCP access.</p>
      </section>

      <section className="section" aria-label="Plans">
        <SignedIn>
          <div className={`pricing-table-wrapper${!preferenced ? ' hide-preferenced-plan' : ''}`}>
            <PricingTable />
          </div>
        </SignedIn>
        <SignedOut>
          <div className="card card-center">
            <h2 className="section-title">See the plans</h2>
            <p className="muted">Sign in to see pricing details and subscribe to Pro for AI tools and MCP access.</p>
            <div className="actions">
              <Link href={`${surfaceUrl('hub', '/sign-in')}?redirect_url=${encodeURIComponent('/pricing')}`} className="btn btn-primary">
                Sign in to get started
              </Link>
            </div>
          </div>
        </SignedOut>
      </section>

      <section className="section narrow" aria-labelledby="faq-title">
        <h2 id="faq-title" className="section-title">
          Frequently asked questions
        </h2>
        <div className="stack">
          {FAQ.map((f) => (
            <details key={f.q} className="card faq">
              <summary>{f.q}</summary>
              <p className="muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
};

'use client';

import { SignedIn, SignedOut } from '@clerk/nextjs';
import { TulzoMark } from '@/src/components/brand/TulzoMark';
import { ArrowRightIcon } from '@/src/components/brand/UiIcons';
import { SURFACE_ICON } from '@/src/components/brand/SurfaceIcons';
import { surfaceUrl, type Surface } from '@/src/lib/surface-url';
import { PLAN_CATALOG } from '@/src/lib/plan-catalog';
import { formatCredits } from '@/src/lib/format';

const SURFACES: { surface: Exclude<Surface, 'hub'>; title: string; desc: string; more: string }[] = [
  {
    surface: 'ai',
    title: 'AI',
    desc: 'Your assistant, keys and usage. Connect Tex, manage devices and see what each call cost.',
    more: 'Open AI',
  },
  {
    surface: 'marketplace',
    title: 'Marketplace',
    desc: 'Skills, MCP servers, A2A agents and plugins. Install them into your assistant in one click.',
    more: 'Browse the marketplace',
  },
  {
    surface: 'gigs',
    title: 'Gigs',
    desc: "Hire AI agents for software work, or offer your agent's services. Independent QA checks every delivery.",
    more: 'See gigs',
  },
  {
    surface: 'chat',
    title: 'Chat',
    desc: 'Talk to your assistant from anywhere: your phone, another laptop, any browser.',
    more: 'Open chat',
  },
];

const STEPS = [
  { title: 'Create your account', desc: 'One sign-in works on every Tulzo surface. Free to start.' },
  {
    title: 'Connect Tex, your assistant',
    desc: 'Install the Chrome extension or the CLI, then add a key from AI. Tex runs sandboxed on your machine.',
  },
  {
    title: 'Give it skills',
    desc: 'Add skills and MCP servers from the Marketplace so it can work with the tools you already use.',
  },
  {
    title: 'Put agents to work',
    desc: 'Post a job on Gigs, or link Stripe and let your agent bid. Payment goes out after QA approves the work.',
  },
];

export function HubHome() {
  return (
    <div className="page">
      <section className="hero">
        <TulzoMark size={72} className="hero-mark" />
        <h1 className="hero-title">Your AI assistant, its tools and its work, in one place</h1>
        <p className="hero-lede">
          Tulzo is home to Tex, a sandboxed AI agent that runs on your machine and works in your browser, your terminal
          or Telegram. Here you manage it, extend it and put it to work.
        </p>
        <div className="actions">
          <SignedOut>
            <a href={surfaceUrl('hub', '/sign-up')} className="btn btn-primary">
              Get started
            </a>
          </SignedOut>
          <SignedIn>
            <a href={surfaceUrl('ai', '/')} className="btn btn-primary">
              Open AI
            </a>
          </SignedIn>
          <a href={surfaceUrl('hub', '/pricing')} className="btn btn-secondary">
            See plans
          </a>
        </div>
      </section>

      <section aria-labelledby="surfaces-title" className="section">
        <h2 id="surfaces-title" className="section-title">
          Everything in one place
        </h2>
        <ul className="hub-surfaces" role="list">
          {SURFACES.map(({ surface, title, desc, more }) => {
            const Icon = SURFACE_ICON[surface];
            return (
              <li key={surface}>
                <a href={surfaceUrl(surface, '/')} className="surface-card">
                  <span className="surface-card-icon">
                    <Icon size={40} />
                  </span>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                  <span className="surface-card-more" aria-hidden="true">
                    {more} <ArrowRightIcon title="" />
                  </span>
                </a>
              </li>
            );
          })}
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

      <section aria-labelledby="plans-title" className="section">
        <h2 id="plans-title" className="section-title">
          Plans
        </h2>
        <div className="card card-center">
          <p>
            Start free and pay as you go. Paid plans add monthly credits for AI usage and QA, which you spend across
            every surface.
          </p>
          <ul className="plan-teaser" role="list">
            {PLAN_CATALOG.map((p) => (
              <li key={p.key}>
                <strong>{p.name}</strong> {p.monthlyUsd === 0 ? 'pay as you go' : `$${p.monthlyUsd}/mo · ${formatCredits(p.monthlyCredits)}`}
              </li>
            ))}
          </ul>
          <div className="actions">
            <a href={surfaceUrl('hub', '/pricing')} className="btn btn-secondary">
              See pricing
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

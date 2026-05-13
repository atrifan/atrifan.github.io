'use client';

import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { ADS_CONFIG } from '../config/ads.config';

export const HomePage: React.FC = () => {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    }}>
      <SideAds
        leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
        leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
        leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
        rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
        rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
        rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
      />

      <main style={{ maxWidth: '64rem', margin: '0 auto', padding: '0 1.5rem' }}>
        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '6rem 1rem 4rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <img
              src="/tulzo-logo.png"
              alt="Tulzo"
              width={80}
              height={80}
              style={{ borderRadius: '16px', filter: 'drop-shadow(0 8px 24px rgba(102, 126, 234, 0.5))' }}
            />
          </div>
          <h1 style={{
            fontSize: 'clamp(2.5rem, 6vw, 3.5rem)',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f472b6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: '0 0 1rem',
            lineHeight: 1.1,
          }}>
            Tex by Tulzo
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: 'clamp(1.1rem, 2.5vw, 1.35rem)',
            maxWidth: '38rem',
            margin: '0 auto 2.5rem',
            lineHeight: 1.6,
          }}>
            A sandboxed AI agent with browser automation, domain skills, and multi-channel access.
            Runs isolated on your machine — interact via Chrome extension, CLI, or Telegram.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <SignedIn>
              <Link href="/dashboard" style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '12px',
                padding: '0.875rem 2rem',
                color: '#fff',
                fontWeight: 600,
                fontSize: '1.05rem',
                textDecoration: 'none',
                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
              }}>
                Go to Control Panel
              </Link>
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '0.875rem 2rem',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '1.05rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                }}>
                  Get Started
                </button>
              </SignInButton>
            </SignedOut>
            <Link href="/pricing" style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '12px',
              padding: '0.875rem 2rem',
              color: '#fff',
              fontWeight: 600,
              fontSize: '1.05rem',
              textDecoration: 'none',
            }}>
              View Pricing
            </Link>
          </div>
        </section>

        <AdBanner slot={ADS_CONFIG.slots.pricingTop} style={{ marginBottom: '3rem' }} />

        {/* Features */}
        <section style={{ padding: '2rem 0 4rem' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))',
            gap: '1.5rem',
          }}>
            {[
              {
                title: 'Sandboxed Execution',
                desc: 'Runs isolated on your machine. Your data stays local. The AI operates within your sandbox with clear boundaries.',
                icon: '🔒',
              },
              {
                title: 'Harness Skills',
                desc: 'Domain-specific practitioners with learned knowledge. Teach the AI your workflows — it remembers and repeats them.',
                icon: '🧠',
              },
              {
                title: 'Chrome Extension',
                desc: 'Side panel assistant that sees and interacts with any page. Automate forms, scraping, and navigation in real-time.',
                icon: '🧩',
              },
              {
                title: 'Telegram & Multi-Channel',
                desc: 'Dispatch tasks via Telegram, get notified on Slack, or run everything from your terminal. Your choice.',
                icon: '💬',
              },
              {
                title: 'Headless Browser',
                desc: 'In-process Playwright for background automation. Runs tasks while you sleep — scheduled or on-demand.',
                icon: '🌐',
              },
              {
                title: 'Plan-Based Guardrails',
                desc: 'Rate limits, quotas, and custom rules. The platform controls what the agent can do based on your subscription.',
                icon: '📊',
              },
            ].map((feature, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{feature.icon}</div>
                <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
                  {feature.title}
                </h3>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section style={{ padding: '2rem 0 4rem' }}>
          <h2 style={{
            textAlign: 'center',
            color: '#fff',
            fontSize: 'clamp(1.5rem, 3vw, 2rem)',
            fontWeight: 700,
            marginBottom: '2.5rem',
          }}>
            How It Works
          </h2>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            maxWidth: '40rem',
            margin: '0 auto',
          }}>
            {[
              { step: '1', title: 'Create an account', desc: 'Sign up and choose a plan that fits your needs.' },
              { step: '2', title: 'Generate your API key', desc: 'Get a secure key from your control panel to authenticate the plugin.' },
              { step: '3', title: 'Install the plugin', desc: 'Load the Chrome extension or run the native host from your terminal.' },
              { step: '4', title: 'Automate', desc: 'Tell the AI what to do — it handles the browser, forms, scraping, and more.' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '1rem',
                  flexShrink: 0,
                }}>
                  {item.step}
                </div>
                <div>
                  <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 600, margin: '0 0 0.25rem' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: 0 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <AdBanner slot={ADS_CONFIG.slots.pricingFooter} style={{ marginBottom: '2rem' }} />
      </main>

      <Footer />
    </div>
  );
};

'use client';

import { View } from '@adobe/react-spectrum';
import { SignedIn, SignedOut, SignInButton, PricingTable } from '@clerk/nextjs';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { ADS_CONFIG } from '../config/ads.config';

interface PricingPageProps {
  preferenced?: boolean;
}

export const PricingPage: React.FC<PricingPageProps> = ({ preferenced }) => {
  return (
    <View UNSAFE_style={{
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

      <main style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '2rem 1rem 3rem', maxWidth: '50rem', margin: '0 auto' }}>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3rem)',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f472b6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0,
          }}>
            Simple, Transparent Pricing
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 'clamp(1rem, 2.5vw, 1.25rem)', marginTop: '1rem' }}>
            Free tools for everyone. Upgrade for AI workflow automation & MCP integration.
          </p>
        </section>

        {/* Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.pricingTop} style={{ marginBottom: '2rem' }} />

        {/* Clerk PricingTable */}
        <section style={{
          padding: '0 1rem',
          maxWidth: '56rem',
          margin: '0 auto',
        }}>
          <SignedIn>
            <div className={`pricing-table-wrapper${!preferenced ? ' hide-preferenced-plan' : ''}`}>
              <PricingTable />
            </div>
          </SignedIn>
          <SignedOut>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
            }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '24px',
                padding: 'clamp(2rem, 5vw, 3rem)',
                textAlign: 'center',
                maxWidth: '31rem',
                width: '100%',
              }}>
                <h2 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 1rem' }}>
                  View Our Plans
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', margin: '0 0 2rem' }}>
                  Sign in to see pricing details and subscribe to Pro for AI-powered tools and MCP access.
                </p>
                <SignInButton mode="modal">
                  <button style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '1rem 2.5rem',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                  }}>
                    Sign In to Get Started
                  </button>
                </SignInButton>
              </div>
            </div>
          </SignedOut>
        </section>

        {/* CSS to make Clerk PricingTable horizontal */}
        <style>{`
          .pricing-table-wrapper {
            width: 100%;
          }
          .pricing-table-wrapper .cl-pricingTable-root,
          .pricing-table-wrapper .cl-pricingTableContainer,
          .pricing-table-wrapper > div > div {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: wrap !important;
            justify-content: center !important;
            gap: 1rem !important;
            align-items: stretch !important;
          }
          .pricing-table-wrapper .cl-pricingTableCard,
          .pricing-table-wrapper > div > div > div {
            flex: 0 1 17rem !important;
            max-width: 17rem !important;
            min-width: 15rem !important;
          }
          .hide-preferenced-plan .cl-pricingTableCard:nth-child(2),
          .hide-preferenced-plan > div > div > div:nth-child(2) {
            display: none !important;
          }
          @media (max-width: 44rem) {
            .pricing-table-wrapper .cl-pricingTable-root,
            .pricing-table-wrapper .cl-pricingTableContainer,
            .pricing-table-wrapper > div > div {
              flex-direction: column !important;
              align-items: center !important;
            }
            .pricing-table-wrapper .cl-pricingTableCard,
            .pricing-table-wrapper > div > div > div {
              max-width: 100% !important;
              width: 100% !important;
            }
          }
        `}</style>

        {/* FAQ Section */}
        <section style={{ maxWidth: '44rem', margin: '4rem auto 0', padding: '0 1rem' }}>
          <h2 style={{ textAlign: 'center', color: '#fff', fontSize: 'clamp(1.5rem, 3vw, 2rem)', marginBottom: '2rem' }}>
            Frequently Asked Questions
          </h2>

          {[
            { q: 'What does the assistant actually do?', a: 'It\'s a sandboxed AI agent running on your machine. It can browse the web, fill forms, scrape data, run scheduled tasks, and learn domain-specific workflows — all controlled via Chrome extension, CLI, or Telegram.' },
            { q: 'Is my data safe?', a: 'The agent runs locally in your sandbox. Your credentials, browsing data, and learned skills stay on your machine. The platform only stores your API key and usage stats.' },
            { q: 'What do I need a subscription for?', a: 'The subscription unlocks the agent\'s full capabilities: higher request quotas, more concurrent sessions, scheduled tasks, and access to the vector store for custom guardrails and knowledge.' },
            { q: 'Can I cancel anytime?', a: 'Yes. Cancel from your control panel or Stripe portal. You keep access until the end of your billing period.' },
            { q: 'How do I interact with the assistant?', a: 'Three ways: Chrome extension side panel for in-browser tasks, CLI for terminal-based automation, or Telegram bot for remote task dispatch and notifications.' },
          ].map((faq, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '16px',
              padding: '1.25rem 1.5rem',
              marginBottom: '1rem',
            }}>
              <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 600, margin: 0 }}>{faq.q}</h3>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: '0.5rem 0 0' }}>{faq.a}</p>
            </div>
          ))}
        </section>

        {/* Bottom Ad */}
        <AdBanner slot={ADS_CONFIG.slots.pricingFooter} style={{ marginTop: '3rem' }} />
      </main>

      <Footer />
    </View>
  );
};


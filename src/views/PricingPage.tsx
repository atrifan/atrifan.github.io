'use client';

import { View } from '@adobe/react-spectrum';
import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';
import Link from 'next/link';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { ADS_CONFIG } from '../config/ads.config';

const CheckIcon = () => (
  <span style={{ color: '#10b981', marginRight: '0.5rem' }}>✓</span>
);

const XIcon = () => (
  <span style={{ color: '#ef4444', marginRight: '0.5rem' }}>✗</span>
);

interface PlanFeature {
  text: string;
  included: boolean;
}

interface PlanCardProps {
  name: string;
  price: string;
  period: string;
  description: string;
  features: PlanFeature[];
  highlighted?: boolean;
  buttonText: string;
  buttonAction: 'signin' | 'dashboard' | 'none';
}

const PlanCard: React.FC<PlanCardProps> = ({ name, price, period, description, features, highlighted, buttonText, buttonAction }) => (
  <div style={{
    background: highlighted 
      ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)'
      : 'rgba(255, 255, 255, 0.05)',
    border: highlighted ? '2px solid #667eea' : '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '24px',
    padding: 'clamp(1.5rem, 4vw, 2.5rem)',
    flex: '1 1 300px',
    maxWidth: '400px',
    position: 'relative',
    overflow: 'hidden',
  }}>
    {highlighted && (
      <div style={{
        position: 'absolute',
        top: '1rem',
        right: '-2rem',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#fff',
        padding: '0.25rem 2.5rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        transform: 'rotate(45deg)',
      }}>
        POPULAR
      </div>
    )}
    
    <h3 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', fontWeight: 700, color: '#fff', margin: 0 }}>{name}</h3>
    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: '0.5rem 0 1.5rem' }}>{description}</p>
    
    <div style={{ marginBottom: '1.5rem' }}>
      <span style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, color: '#fff' }}>{price}</span>
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1rem' }}>{period}</span>
    </div>
    
    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem' }}>
      {features.map((feature, i) => (
        <li key={i} style={{ 
          padding: '0.5rem 0', 
          color: feature.included ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
          fontSize: '0.95rem',
          display: 'flex',
          alignItems: 'center',
        }}>
          {feature.included ? <CheckIcon /> : <XIcon />}
          {feature.text}
        </li>
      ))}
    </ul>
    
    {buttonAction === 'signin' ? (
      <SignedOut>
        <SignInButton mode="modal">
          <button style={{
            width: '100%',
            padding: '0.875rem',
            borderRadius: '12px',
            border: 'none',
            background: highlighted 
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : 'rgba(255,255,255,0.1)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}>
            {buttonText}
          </button>
        </SignInButton>
      </SignedOut>
    ) : buttonAction === 'dashboard' ? (
      <SignedIn>
        <Link href="/dashboard" style={{ textDecoration: 'none', display: 'block' }}>
          <button style={{
            width: '100%',
            padding: '0.875rem',
            borderRadius: '12px',
            border: 'none',
            background: highlighted 
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : 'rgba(255,255,255,0.1)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
          }}>
            {buttonText}
          </button>
        </Link>
      </SignedIn>
    ) : null}
    
    <SignedIn>
      {buttonAction === 'signin' && (
        <Link href="/dashboard" style={{ textDecoration: 'none', display: 'block' }}>
          <button style={{
            width: '100%',
            padding: '0.875rem',
            borderRadius: '12px',
            border: 'none',
            background: 'rgba(255,255,255,0.1)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
          }}>
            Go to Dashboard
          </button>
        </Link>
      )}
    </SignedIn>
    <SignedOut>
      {buttonAction === 'dashboard' && (
        <SignInButton mode="modal">
          <button style={{
            width: '100%',
            padding: '0.875rem',
            borderRadius: '12px',
            border: 'none',
            background: highlighted 
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : 'rgba(255,255,255,0.1)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
          }}>
            Sign In to Upgrade
          </button>
        </SignInButton>
      )}
    </SignedOut>
  </div>
);

export const PricingPage: React.FC = () => {
  const freePlan: PlanCardProps = {
    name: 'Free',
    price: '$0',
    period: '/forever',
    description: 'All basic tools, no account needed',
    features: [
      { text: 'All calculator tools', included: true },
      { text: 'Random generators', included: true },
      { text: 'Date & time tools', included: true },
      { text: 'Unit converters', included: true },
      { text: 'AI-powered tools', included: false },
      { text: 'MCP Server access', included: false },
      { text: 'API key for integrations', included: false },
    ],
    buttonText: 'Get Started Free',
    buttonAction: 'signin',
  };

  const proPlan: PlanCardProps = {
    name: 'Pro',
    price: '$7',
    period: '/month',
    description: 'Unlock AI tools & MCP integration',
    features: [
      { text: 'Everything in Free', included: true },
      { text: 'AI-powered tools', included: true },
      { text: 'MCP Server access', included: true },
      { text: 'Personal API key', included: true },
      { text: 'Use with ChatGPT, Claude, etc.', included: true },
      { text: 'Priority support', included: true },
      { text: 'Early access to new tools', included: true },
    ],
    highlighted: true,
    buttonText: 'Upgrade to Pro',
    buttonAction: 'dashboard',
  };

  return (
    <View UNSAFE_style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    }}>
      <Header />
      
      <main style={{ paddingTop: '5rem', paddingBottom: '3rem' }}>
        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '2rem 1rem 3rem', maxWidth: '800px', margin: '0 auto' }}>
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
            Free tools for everyone. Upgrade for AI superpowers.
          </p>
        </section>

        {/* Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.pricingTop} style={{ marginBottom: '2rem' }} />

        {/* Pricing Cards */}
        <section style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '2rem',
          justifyContent: 'center',
          padding: '0 1rem',
          maxWidth: '900px',
          margin: '0 auto',
        }}>
          <PlanCard {...freePlan} />
          <PlanCard {...proPlan} />
        </section>

        {/* FAQ Section */}
        <section style={{ maxWidth: '700px', margin: '4rem auto 0', padding: '0 1rem' }}>
          <h2 style={{ textAlign: 'center', color: '#fff', fontSize: 'clamp(1.5rem, 3vw, 2rem)', marginBottom: '2rem' }}>
            Frequently Asked Questions
          </h2>
          
          {[
            { q: 'What is MCP Server access?', a: 'MCP (Model Context Protocol) lets you use Tulzo tools directly in ChatGPT, Claude, Cursor, and other AI assistants. Your AI can calculate, convert, and generate data using our tools.' },
            { q: 'Can I cancel anytime?', a: 'Yes! Cancel your subscription anytime from your dashboard. You\'ll keep Pro access until the end of your billing period.' },
            { q: 'What payment methods do you accept?', a: 'We accept all major credit cards, debit cards, and PayPal through our secure payment processor.' },
            { q: 'Is my API key secure?', a: 'Yes. Your API key is encrypted and only visible to you. You can regenerate it anytime from your dashboard.' },
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


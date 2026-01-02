import type { Metadata } from 'next';
import { PricingPage } from '@/src/views/PricingPage';

export const metadata: Metadata = {
  title: 'Pricing - Tulzo',
  description: 'Choose your Tulzo plan. Free tools for everyone, Pro plan with AI-powered tools and MCP server access for just $7/month.',
  openGraph: {
    title: 'Pricing - Tulzo',
    description: 'Free tools for everyone. Upgrade to Pro for AI tools and MCP server access.',
    url: 'https://tulzo.vercel.app/pricing',
  },
  twitter: {
    title: 'Pricing - Tulzo',
    description: 'Free tools for everyone. Upgrade to Pro for AI tools and MCP server access.',
  },
};

export default function Pricing() {
  return <PricingPage />;
}


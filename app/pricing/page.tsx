import type { Metadata } from 'next';
import { PricingPage } from '@/src/views/PricingPage';

export const metadata: Metadata = {
  title: 'Pricing - Tulzo',
  description: 'Choose your Tulzo plan. Free tools for everyone. Pro ($7/mo) for AI workflow automation & MCP access. Plus ($14/mo) for all AI models & advanced features.',
  openGraph: {
    title: 'Pricing - Tulzo',
    description: 'Free tools for everyone. Pro for AI workflow automation & MCP. Plus for all AI models.',
    url: 'https://tulzo.vercel.app/pricing',
  },
  twitter: {
    title: 'Pricing - Tulzo',
    description: 'Free tools for everyone. Pro for AI workflow automation & MCP. Plus for all AI models.',
  },
};

export default function Pricing() {
  return <PricingPage />;
}


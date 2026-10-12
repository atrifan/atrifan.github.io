import type { Metadata } from 'next';
import { PricingView } from '@/src/views/hub/PricingView';

const TITLE = 'Pricing';
const DESCRIPTION =
  'Free, Pro ($10), Plus ($25) and Super ($60) plans with monthly credits for your AI assistant and QA. 1 credit = $0.01, top-ups from $5 with no processing fee.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/pricing' },
  openGraph: { title: `${TITLE} | Tulzo`, description: DESCRIPTION, url: '/pricing' },
  twitter: { title: `${TITLE} | Tulzo`, description: DESCRIPTION },
};

export default function Pricing() {
  return <PricingView />;
}

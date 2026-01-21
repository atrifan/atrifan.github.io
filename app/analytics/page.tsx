import { auth } from '@clerk/nextjs/server';
import { AnalyticsPage } from '../../src/views/AnalyticsPage';

export const metadata = {
  title: 'AI Usage Analytics – Track Costs & Tokens | Tulzo',
  description: 'View detailed analytics of your AI usage including costs, tokens, model breakdown, and context usage patterns.',
};

export default async function Analytics() {
  const { userId, has } = await auth();

  // Check subscription status
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  return <AnalyticsPage isLoggedIn={!!userId} isPro={isPro} isPlus={isPlus} />;
}


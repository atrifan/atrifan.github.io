import { auth } from '@clerk/nextjs/server';
import { AutomationPage } from '../../src/views/AutomationPage';

export const metadata = {
  title: 'AI Workflow Automation – No-Code Automation | Tulzo',
  description: 'Build powerful automations using natural language. Connect your tools and MCP servers to create custom workflows.',
};

export default async function Automation() {
  const { userId, has } = await auth();

  // Check subscription status
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  return <AutomationPage isLoggedIn={!!userId} isPro={isPro} isPlus={isPlus} />;
}


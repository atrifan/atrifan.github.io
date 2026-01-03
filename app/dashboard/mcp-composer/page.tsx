import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { MCPComposerPage } from '@/src/views/MCPComposerPage';

export const metadata: Metadata = {
  title: 'Create Custom MCP Server - Tulzo',
  description: 'Create a custom MCP server with your selected tools for focused AI assistant integration.',
  robots: { index: false, follow: false },
};

export default async function MCPComposer() {
  const { userId, has } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Check if user has Pro or Plus plan using Clerk's has() helper
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  // Redirect free users to dashboard
  if (!isPro) {
    redirect('/dashboard');
  }

  return <MCPComposerPage />;
}


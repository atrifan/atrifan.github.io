import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { A2AAgentEditPage } from '@/src/views/A2AAgentEditPage';

export const metadata: Metadata = {
  title: 'Edit A2A Agent - Tulzo',
  description: 'Edit your imported A2A agent configuration and tool schema.',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditA2AAgent({ params }: PageProps) {
  const { userId, has } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Check if user has Pro or Plus plan using Clerk's has() helper
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  const { id } = await params;

  return <A2AAgentEditPage agentId={id} isPro={isPro} isPlus={isPlus} />;
}


import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { CustomMCPServerDocsPage } from '@/src/views/CustomMCPServerDocsPage';

export const metadata: Metadata = {
  title: 'MCP Server Docs - Tulzo',
  description: 'View the tools available in your custom MCP server.',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomMCPServerDocs({ params }: PageProps) {
  const { userId, has } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Check if user has Pro or Plus plan using Clerk's has() helper
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  const { id } = await params;

  return <CustomMCPServerDocsPage serverId={id} isPro={isPro} isPlus={isPlus} />;
}


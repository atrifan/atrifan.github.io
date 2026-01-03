import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { CustomMCPServerDocsPage } from '@/src/views/CustomMCPServerDocsPage';

export const metadata: Metadata = {
  title: 'Custom MCP Server - Tulzo',
  description: 'View the tools available in your custom MCP server.',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomMCPServerDocs({ params }: PageProps) {
  const { userId } = await auth();
  
  if (!userId) {
    redirect('/sign-in');
  }

  const { id } = await params;

  return <CustomMCPServerDocsPage serverId={id} />;
}


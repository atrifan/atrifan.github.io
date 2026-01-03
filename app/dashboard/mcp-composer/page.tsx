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
  const { userId } = await auth();
  
  if (!userId) {
    redirect('/sign-in');
  }

  return <MCPComposerPage />;
}


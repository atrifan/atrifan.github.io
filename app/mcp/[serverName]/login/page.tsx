import type { Metadata } from 'next';
import { MCPOAuthLoginPage } from '@/src/views/MCPOAuthLoginPage';

interface PageProps {
  params: Promise<{ serverName: string }>;
  searchParams: Promise<{ tool_id?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { serverName } = await params;
  return {
    title: `Authenticate ${decodeURIComponent(serverName)} - Tulzo MCP`,
    description: `Authorize OAuth access for ${decodeURIComponent(serverName)} MCP tools on Tulzo.`,
    robots: { index: false, follow: false },
  };
}

export default async function MCPLoginPage({ params, searchParams }: PageProps) {
  const { serverName } = await params;
  const { tool_id: toolId } = await searchParams;

  return (
    <MCPOAuthLoginPage
      serverName={decodeURIComponent(serverName)}
      toolId={toolId}
    />
  );
}


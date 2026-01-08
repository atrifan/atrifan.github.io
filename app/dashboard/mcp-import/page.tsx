import { Metadata } from 'next';
import { MCPServerImportPage } from '@/src/views/MCPServerImportPage';
import { SEO_DATA } from '@/src/utils/seo';

export const metadata: Metadata = {
  title: SEO_DATA.mcpImport?.title || 'Import MCP Server | Tulzo',
  description: SEO_DATA.mcpImport?.description || 'Connect to external MCP servers and import their tools. Your AI assistant will proxy requests to the external server.',
  keywords: SEO_DATA.mcpImport?.keywords || ['MCP', 'Model Context Protocol', 'AI tools', 'import', 'proxy', 'external server'],
  openGraph: {
    title: SEO_DATA.mcpImport?.title || 'Import MCP Server | Tulzo',
    description: SEO_DATA.mcpImport?.description || 'Connect to external MCP servers and import their tools.',
    type: 'website',
    siteName: 'Tulzo',
  },
  twitter: {
    card: 'summary_large_image',
    title: SEO_DATA.mcpImport?.title || 'Import MCP Server | Tulzo',
    description: SEO_DATA.mcpImport?.description || 'Connect to external MCP servers and import their tools.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function MCPImportPage() {
  return <MCPServerImportPage />;
}


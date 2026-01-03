import { Metadata } from 'next';
import ToolsDocumentation from '@/src/views/ToolsDocumentation';

export const metadata: Metadata = {
  title: 'MCP Tools Documentation | Tulzo',
  description: 'Complete documentation for all Tulzo MCP tools. Learn about input schemas, output schemas, and how to use each tool with AI assistants.',
  keywords: ['MCP tools', 'Model Context Protocol', 'AI tools', 'API documentation', 'Tulzo tools'],
  openGraph: {
    title: 'MCP Tools Documentation | Tulzo',
    description: 'Complete documentation for all Tulzo MCP tools. Learn about input schemas, output schemas, and how to use each tool.',
    type: 'website',
    url: 'https://tulzo.com/docs/tools',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MCP Tools Documentation | Tulzo',
    description: 'Complete documentation for all Tulzo MCP tools.',
  },
  alternates: {
    canonical: 'https://tulzo.com/docs/tools',
  },
};

export default function ToolsDocumentationPage() {
  return <ToolsDocumentation />;
}


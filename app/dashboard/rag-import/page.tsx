import { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { RAGImportPage } from '@/src/views/RAGImportPage';
import { SEO_DATA } from '@/src/utils/seo';

export const metadata: Metadata = {
  title: SEO_DATA.ragImport?.title || 'Create RAG Knowledge Base | Tulzo',
  description: SEO_DATA.ragImport?.description || 'Create a RAG knowledge base to enhance your AI assistant with custom data.',
  keywords: SEO_DATA.ragImport?.keywords || ['RAG', 'knowledge base', 'AI', 'embeddings', 'retrieval'],
  openGraph: {
    title: SEO_DATA.ragImport?.title || 'Create RAG Knowledge Base | Tulzo',
    description: SEO_DATA.ragImport?.description || 'Create a RAG knowledge base to enhance your AI assistant.',
    type: 'website',
    siteName: 'Tulzo',
  },
  twitter: {
    card: 'summary_large_image',
    title: SEO_DATA.ragImport?.title || 'Create RAG Knowledge Base | Tulzo',
    description: SEO_DATA.ragImport?.description || 'Create a RAG knowledge base to enhance your AI assistant.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RAGImportPageRoute() {
  const { userId, has } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Check if user has Pro or Plus plan
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  return <RAGImportPage isPro={isPro} isPlus={isPlus} />;
}


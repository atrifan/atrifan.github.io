import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { RAGExplorerPage } from '../../src/views/RAGExplorerPage';

export const metadata = {
  title: 'RAG Explorer – AI Knowledge Base Search | Tulzo',
  description: 'Explore your knowledge bases using AI-powered semantic search. Navigate through documents and find relevant content instantly.',
};

export default async function RAGExplorer() {
  const { userId, has } = await auth();

  // Check subscription status
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  // RAG Explorer requires Pro+ (needs API key for RAG access)
  if (!isPro) {
    redirect('/pricing?upgrade=rag-explorer');
  }

  return <RAGExplorerPage isLoggedIn={!!userId} isPro={isPro} isPlus={isPlus} />;
}


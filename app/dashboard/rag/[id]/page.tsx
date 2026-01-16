import { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { RAGDetailPage } from '@/src/views/RAGDetailPage';

export const metadata: Metadata = {
  title: 'RAG Knowledge Base | Tulzo',
  description: 'Manage your RAG knowledge base and documents.',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RAGDetailPageRoute({ params }: PageProps) {
  const { userId, has } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const { id } = await params;

  // Check if user has Pro or Plus plan
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  // RAG requires Pro+ (needs API key)
  if (!isPro) {
    redirect('/dashboard?upgrade=rag');
  }

  return <RAGDetailPage ragId={id} isPro={isPro} isPlus={isPlus} />;
}


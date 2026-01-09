import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { RestApiEditPage } from '@/src/views/RestApiEditPage';

export const metadata: Metadata = {
  title: 'Edit REST API | Tulzo',
  description: 'Edit REST API specification, environments, and tools',
};

interface PageProps {
  params: Promise<{ specId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { userId, has } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Check if user has Pro or Plus plan
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  // Redirect free users to dashboard
  if (!isPro) {
    redirect('/dashboard');
  }

  const { specId } = await params;

  return <RestApiEditPage specId={specId} />;
}


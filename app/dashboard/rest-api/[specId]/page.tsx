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
  const { userId } = await auth();
  
  if (!userId) {
    redirect('/sign-in');
  }

  const { specId } = await params;
  
  return <RestApiEditPage specId={specId} />;
}


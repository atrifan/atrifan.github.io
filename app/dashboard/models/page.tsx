import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ModelsPage } from '@/src/views/ModelsPage';

export const metadata: Metadata = {
  title: 'AI Models & Costs | Tulzo',
  description: 'Explore available AI models, their capabilities, context windows, and pricing',
  robots: { index: false, follow: false },
};

export default async function Models() {
  const { userId, has } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  return <ModelsPage isPro={isPro} isPlus={isPlus} />;
}


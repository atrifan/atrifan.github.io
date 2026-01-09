import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { MCPComposerPage } from '@/src/views/MCPComposerPage';
import { SEO_DATA } from '@/src/utils/seo';

const seo = SEO_DATA.mcpComposer;

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  robots: { index: false, follow: false },
  openGraph: {
    title: seo.ogTitle || seo.title,
    description: seo.ogDescription || seo.description,
    type: 'website',
  },
};

export default async function MCPComposer() {
  const { userId, has } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Check if user has Pro or Plus plan using Clerk's has() helper
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  return <MCPComposerPage isPro={isPro} isPlus={isPlus} />;
}


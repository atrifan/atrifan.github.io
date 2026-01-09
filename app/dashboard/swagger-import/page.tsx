import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { SwaggerImportPage } from '@/src/views/SwaggerImportPage';
import { SEO_DATA } from '@/src/utils/seo';

const seo = SEO_DATA.swaggerImport;

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.ogTitle || seo.title,
    description: seo.ogDescription || seo.description,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: seo.ogTitle || seo.title,
    description: seo.ogDescription || seo.description,
  },
};

export default async function Page() {
  const { userId, has } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Check if user has Pro or Plus plan
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  return <SwaggerImportPage isPro={isPro} isPlus={isPlus} />;
}


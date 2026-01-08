import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { GraphQLImportPage } from '@/src/views/GraphQLImportPage';
import { SEO_DATA } from '@/src/utils/seo';

const seo = SEO_DATA.graphqlImport;

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
  const { userId } = await auth();
  
  if (!userId) {
    redirect('/sign-in');
  }
  
  return <GraphQLImportPage />;
}


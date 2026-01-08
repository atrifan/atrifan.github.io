import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { GraphQLEditPage } from '@/src/views/GraphQLEditPage';
import { SEO_DATA } from '@/src/utils/seo';

const seo = SEO_DATA.graphqlEdit;

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

interface PageProps {
  params: Promise<{ specId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { userId } = await auth();
  
  if (!userId) {
    redirect('/sign-in');
  }

  const { specId } = await params;
  
  return <GraphQLEditPage specId={specId} />;
}


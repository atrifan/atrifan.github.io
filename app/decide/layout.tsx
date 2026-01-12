import type { Metadata } from 'next';
import { SEO_DATA } from '@/src/utils/seo';

const seo = SEO_DATA.decide;

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: 'https://tulzo.vercel.app/decide',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: seo.title,
    description: seo.description,
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}


import type { Metadata } from 'next';
import { SEO_DATA } from '@/src/utils/seo';

const seo = SEO_DATA.analytics;

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  robots: { index: false, follow: false }, // Pro feature, don't index
  openGraph: {
    title: seo.ogTitle || seo.title,
    description: seo.ogDescription || seo.description,
    url: 'https://tulzo.vercel.app/analytics',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: seo.ogTitle || seo.title,
    description: seo.ogDescription || seo.description,
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}


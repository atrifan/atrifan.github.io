import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { kindLabel } from '@/src/lib/marketplace/kinds';
import { getPackageDetail } from '@/src/lib/marketplace-service';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';
import { PackageDetail } from '@/src/views/marketplace/PackageDetail';

export const dynamic = 'force-dynamic';

type Props = { params: { slug: string } };

// One lookup per request, shared by generateMetadata and the page.
const load = cache((slug: string) => getPackageDetail(decodeURIComponent(slug)));

const canonicalFor = (id: string) => absoluteSurfaceUrl('marketplace', `/${encodeURIComponent(id)}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const detail = await load(params.slug);
  if (!detail) return { title: 'Package not found', robots: { index: false } };
  const { item } = detail;
  const title = `${item.name} · ${kindLabel(item.type)}`;
  const canonical = canonicalFor(item.id);
  return {
    title,
    description: item.description,
    alternates: { canonical },
    openGraph: { title, description: item.description, url: canonical, type: 'website' },
    twitter: { card: 'summary', title, description: item.description },
  };
}

/** A public package page, by id or by the slug of its name. Pending/private packages are 404. */
export default async function PackagePage({ params }: Props) {
  const detail = await load(params.slug);
  if (!detail) notFound();
  return <PackageDetail detail={detail} canonicalUrl={canonicalFor(detail.item.id)} />;
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentMarketplaceUser } from '@/src/lib/marketplace/web-auth';
import { surfaceUrl } from '@/src/lib/surface-url';
import { PublisherActivity } from '@/src/views/marketplace/PublisherActivity';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Install activity', robots: { index: false, follow: false } };

/** Installs of your packages over time (sign-in required: PROTECTED_PREFIXES in src/lib/surface-routing.ts). */
export default async function PublisherActivityPage() {
  const user = await currentMarketplaceUser();
  if (!user) redirect(surfaceUrl('hub', '/sign-in'));
  return <PublisherActivity />;
}

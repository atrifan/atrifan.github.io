import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getPublisherStats } from '@/src/lib/marketplace-service';
import { currentMarketplaceUser } from '@/src/lib/marketplace/web-auth';
import { surfaceUrl } from '@/src/lib/surface-url';
import { Publisher } from '@/src/views/marketplace/Publisher';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Publish a package',
  robots: { index: false, follow: false },
};

/** Publisher page (sign-in required: PROTECTED_PREFIXES in src/lib/surface-routing.ts). */
export default async function PublishPage() {
  const user = await currentMarketplaceUser();
  if (!user) redirect(surfaceUrl('hub', '/sign-in'));
  let packages: Awaited<ReturnType<typeof getPublisherStats>> = [];
  try {
    packages = await getPublisherStats(user.userId);
  } catch (e) {
    console.error('[marketplace] publisher stats failed', e);
  }
  return <Publisher canPublish={user.canPublish} initial={packages} />;
}

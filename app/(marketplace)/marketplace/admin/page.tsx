import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isVisibility, listModerationQueue } from '@/src/lib/marketplace-service';
import { currentMarketplaceUser } from '@/src/lib/marketplace/web-auth';
import { surfaceUrl } from '@/src/lib/surface-url';
import { AdminModeration } from '@/src/views/marketplace/AdminModeration';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Moderation',
  robots: { index: false, follow: false },
};

type Props = { searchParams: Record<string, string | string[] | undefined> };

/** Marketplace moderation, admins only (sign-in required by PROTECTED_PREFIXES). */
export default async function AdminPage({ searchParams }: Props) {
  const user = await currentMarketplaceUser();
  if (!user) redirect(surfaceUrl('hub', '/sign-in'));
  if (!user.isAdmin) {
    return (
      <div className="page mp-page">
        <div className="mp-empty">
          <h1 className="mp-empty-title">Admins only</h1>
          <p className="muted">Moderation is for Tulzo marketplace admins.</p>
          <a className="btn btn-secondary" href={surfaceUrl('marketplace', '/')}>
            Back to the catalog
          </a>
        </div>
      </div>
    );
  }
  const raw = Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status;
  const visibility = isVisibility(raw) ? raw : 'pending';
  const { items, counts } = await listModerationQueue(visibility);
  return <AdminModeration key={visibility} visibility={visibility} initial={items} counts={counts} />;
}

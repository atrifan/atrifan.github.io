import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminHomeView } from '@/src/views/hub/AdminHomeView';
import { NOINDEX } from '@/src/lib/hub-seo';
import { currentUserId, isAdminUser } from '@/src/lib/jobs/ui/session';
import { adminHomeCards } from '@/src/lib/admin-home/cards';
import { loadAdminHomeNumbers } from '@/src/lib/admin-home/admin-home-service';
import { adminQaMcpUrl } from '@/src/lib/jobs/client/seo';
import { surfaceUrl } from '@/src/lib/surface-url';

export const metadata: Metadata = { title: 'Admin', robots: NOINDEX };
export const dynamic = 'force-dynamic';

/**
 * Admin home: every admin area with its key number. Non-admins get the 404 page (signed-out
 * visitors are sent to sign-in by middleware). Admin by the src/lib/admin.ts rule.
 */
export default async function AdminHome() {
  const userId = await currentUserId();
  if (!userId || !(await isAdminUser(userId))) notFound();
  const cards = adminHomeCards(await loadAdminHomeNumbers(), {
    qa: surfaceUrl('hub', '/admin/qa'),
    disputes: surfaceUrl('hub', '/admin/disputes'),
    inbox: surfaceUrl('hub', '/admin/inbox'),
    moderation: surfaceUrl('marketplace', '/admin'),
    activity: surfaceUrl('hub', '/admin/activity'),
  });
  return <AdminHomeView cards={cards} mcpUrl={adminQaMcpUrl()} mcpDocsUrl={surfaceUrl('gigs', '/docs/admin-qa')} />;
}

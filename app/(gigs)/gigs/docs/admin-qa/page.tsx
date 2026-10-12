import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminQaDocs } from '@/src/views/gigs/AdminQaDocs';
import { adminQaMcpUrl } from '@/src/lib/jobs/client/seo';
import { currentUserId, isAdminUser } from '@/src/lib/jobs/ui/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin QA MCP',
  robots: { index: false, follow: false },
};

/** Admins only; everyone else gets the 404 page, so the page's existence isn't advertised. */
export default async function Page() {
  const userId = await currentUserId();
  if (!userId || !(await isAdminUser(userId))) notFound();
  return <AdminQaDocs mcpUrl={adminQaMcpUrl()} />;
}

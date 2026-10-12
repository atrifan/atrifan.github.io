import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminInboxView } from '@/src/views/hub/AdminInboxView';
import { NOINDEX } from '@/src/lib/hub-seo';
import { currentUserId, isAdminUser } from '@/src/lib/jobs/ui/session';

export const metadata: Metadata = { title: 'Inbox', robots: NOINDEX };
export const dynamic = 'force-dynamic';

type Props = { searchParams: { source?: string | string[]; thread?: string | string[] } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Admin support inbox: complaints and support email (src/lib/support). Non-admins get the 404 page.
 * Admin by the src/lib/admin.ts rule, for the same identity the inbox API uses (the e2e header in tests).
 */
export default async function AdminInbox({ searchParams }: Props) {
  const userId = await currentUserId();
  if (!userId || !(await isAdminUser(userId))) notFound();
  const source = one(searchParams.source);
  return (
    <AdminInboxView
      initialSource={source === 'complaint' || source === 'email' ? source : ''}
      initialThread={one(searchParams.thread) ?? null}
    />
  );
}

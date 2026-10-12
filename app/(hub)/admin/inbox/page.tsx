import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { clerkAdmin } from '@/src/lib/qa/admin-auth';
import { AdminInboxView } from '@/src/views/hub/AdminInboxView';
import { NOINDEX } from '@/src/lib/hub-seo';
import { currentUserId } from '@/src/lib/jobs/ui/session';

export const metadata: Metadata = { title: 'Inbox', robots: NOINDEX };
export const dynamic = 'force-dynamic';

type Props = { searchParams: { source?: string | string[]; thread?: string | string[] } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Admin support inbox: complaints and support email (src/lib/support). Non-admins get the 404 page. */
export default async function AdminInbox({ searchParams }: Props) {
  const userId = await currentUserId();
  if (!userId || !(await clerkAdmin(userId))) notFound();
  const source = one(searchParams.source);
  return (
    <AdminInboxView
      initialSource={source === 'complaint' || source === 'email' ? source : ''}
      initialThread={one(searchParams.thread) ?? null}
    />
  );
}

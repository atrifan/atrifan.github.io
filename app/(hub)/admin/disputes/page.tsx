import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { clerkAdmin } from '@/src/lib/qa/admin-auth';
import { AdminDisputesView } from '@/src/views/hub/AdminDisputesView';
import { NOINDEX } from '@/src/lib/hub-seo';

export const metadata: Metadata = { title: 'Disputes', robots: NOINDEX };
export const dynamic = 'force-dynamic';

/** Admin dispute resolution (release, partial refund, full refund). Non-admins get the 404 page. */
export default async function AdminDisputes() {
  const { userId } = await auth();
  if (!userId || !(await clerkAdmin(userId))) notFound();
  return <AdminDisputesView />;
}

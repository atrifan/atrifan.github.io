import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { clerkAdmin } from '@/src/lib/qa/admin-auth';
import { AdminActivityView } from '@/src/views/hub/AdminActivityView';
import { NOINDEX } from '@/src/lib/hub-seo';

export const metadata: Metadata = { title: 'Activity', robots: NOINDEX };
export const dynamic = 'force-dynamic';

/** Admin overview of installs, publishes and gigs money. Non-admins get the 404 page. */
export default async function AdminActivity() {
  const { userId } = await auth();
  if (!userId || !(await clerkAdmin(userId))) notFound();
  return <AdminActivityView />;
}

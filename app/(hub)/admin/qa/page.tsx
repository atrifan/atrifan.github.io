import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { clerkAdmin } from '@/src/lib/qa/admin-auth';
import { AdminQaView } from '@/src/views/hub/AdminQaView';
import { NOINDEX } from '@/src/lib/hub-seo';

export const metadata: Metadata = { title: 'QA review', robots: NOINDEX };
export const dynamic = 'force-dynamic';

/** Admin QA (the web mirror of the Admin QA MCP). Non-admins get the 404 page. */
export default async function AdminQa() {
  const { userId } = await auth();
  if (!userId || !(await clerkAdmin(userId))) notFound();
  return <AdminQaView />;
}

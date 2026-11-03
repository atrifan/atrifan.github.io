import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { clerkAdmin } from '@/src/lib/qa/admin-auth';
import { relayStatus } from '@/src/lib/chat-v2/relay-settings';
import { configuredViewerOrigins } from '@/src/lib/chat-v2/http';
import { AdminRelayView } from '@/src/views/hub/AdminRelayView';
import { NOINDEX } from '@/src/lib/hub-seo';

export const metadata: Metadata = { title: 'Chat relay', robots: NOINDEX };
export const dynamic = 'force-dynamic';

/** Admin view of the chat relay secrets and the origins they allow. Non-admins get the 404 page. */
export default async function AdminRelay() {
  const { userId } = await auth();
  if (!userId || !(await clerkAdmin(userId))) notFound();
  return <AdminRelayView initial={await relayStatus(configuredViewerOrigins())} />;
}

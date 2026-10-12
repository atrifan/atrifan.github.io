import type { Metadata } from 'next';
import { NotificationsView } from '@/src/views/hub/NotificationsView';
import { NOINDEX } from '@/src/lib/hub-seo';

export const metadata: Metadata = { title: 'Notifications', robots: NOINDEX };
export const dynamic = 'force-dynamic';

/** Signed-in only (PROTECTED_PREFIXES in src/lib/surface-routing.ts); the feed loads client-side. */
export default function Notifications() {
  return <NotificationsView />;
}

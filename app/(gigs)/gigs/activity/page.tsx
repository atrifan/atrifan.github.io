import type { Metadata } from 'next';
import { GigsActivity } from '@/src/views/gigs/GigsActivity';
import { requireUserId } from '@/src/lib/jobs/ui/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'My activity', robots: { index: false, follow: false } };

/** Gigs My activity: what you bought and sold, and when. Signed out → the hub sign-in. */
export default async function Page() {
  await requireUserId('/activity');
  return <GigsActivity />;
}

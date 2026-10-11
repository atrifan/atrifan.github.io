import type { Metadata } from 'next';
import { ProfileView } from '@/src/views/hub/ProfileView';
import { connectReturnParam } from '@/src/lib/connect-view';
import { NOINDEX } from '@/src/lib/hub-seo';

export const metadata: Metadata = {
  title: 'Profile',
  description: 'Your Tulzo account, Stripe payouts and email notifications.',
  robots: NOINDEX,
};

export default function Profile({ searchParams }: { searchParams: { connect?: string | string[] } }) {
  const raw = Array.isArray(searchParams.connect) ? searchParams.connect[0] : searchParams.connect;
  return <ProfileView connectParam={connectReturnParam(raw)} />;
}

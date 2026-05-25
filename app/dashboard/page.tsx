import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ControlPanelPage } from '@/src/views/ControlPanelPage';
import { isPreferenced } from '@/src/lib/preferenced';

export const metadata: Metadata = {
  title: 'Control Panel - Tulzo',
  description: 'Manage your Tulzo subscription, API keys, and monitor plugin usage.',
  robots: { index: false, follow: false },
};

function getPlanFromClaims(sessionClaims: Record<string, unknown> | null): string {
  if (!sessionClaims) return 'free';
  const pla = sessionClaims.pla as string | undefined;
  if (!pla) return 'free';
  if (pla.includes(':')) {
    const plan = pla.split(':')[1];
    if (plan === 'pro' || plan === 'plus' || plan === 'free') return plan;
  }
  if (pla === 'pro' || pla === 'plus' || pla === 'free') return pla;
  return 'free';
}

export default async function Dashboard() {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const preferenced = await isPreferenced();
  const plan = getPlanFromClaims(sessionClaims as Record<string, unknown> | null);
  const showDownloads = preferenced || plan !== 'free';
  return <ControlPanelPage showDownloads={showDownloads} />;
}

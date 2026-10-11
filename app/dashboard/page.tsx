import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ControlPanelPage } from '@/src/views/ControlPanelPage';
import { isPreferenced } from '@/src/lib/preferenced';
import { planFromClaims, type PlanKey } from '@/src/lib/plans';

export const metadata: Metadata = {
  title: 'Control Panel - Tulzo',
  description: 'Manage your Tulzo subscription, API keys, and monitor plugin usage.',
  robots: { index: false, follow: false },
};

function getPlanFromClaims(sessionClaims: Record<string, unknown> | null): PlanKey {
  return planFromClaims(sessionClaims);
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

import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ControlPanelPage } from '@/src/views/ControlPanelPage';

export const metadata: Metadata = {
  title: 'Control Panel - Tulzo',
  description: 'Manage your Tulzo subscription, API keys, and monitor plugin usage.',
  robots: { index: false, follow: false },
};

export default async function Dashboard() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  return <ControlPanelPage />;
}

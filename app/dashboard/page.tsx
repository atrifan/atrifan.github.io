import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { DashboardPage } from '@/src/views/DashboardPage';

export const metadata: Metadata = {
  title: 'Dashboard - Tulzo',
  description: 'Manage your Tulzo account, API keys, and subscription.',
  robots: { index: false, follow: false },
};

export default async function Dashboard() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect('/sign-in');
  }

  return <DashboardPage />;
}


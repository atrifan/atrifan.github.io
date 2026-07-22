import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { RemoteChatPage } from '@/src/views/RemoteChatPage';

export const metadata: Metadata = {
  title: 'Chat - Tulzo',
  description: 'Chat with a connected device and drive its browser remotely.',
  robots: { index: false, follow: false },
};

export default async function Chat() {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }
  return <RemoteChatPage />;
}

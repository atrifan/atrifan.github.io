import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ChatApp } from '@/src/views/remote-chat/ChatApp';

// The chat is signed-in only: never indexed, and no ads on chat. (src/lib/ads-policy.ts).
export const metadata: Metadata = {
  title: 'Chat',
  description: 'Chat with your Tex assistant from any device and watch it work in your browser.',
  robots: { index: false, follow: false },
};

export default async function Chat() {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }
  return <ChatApp />;
}

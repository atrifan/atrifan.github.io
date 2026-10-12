import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { ChatApp } from '@/src/views/remote-chat/ChatApp';
import { ChatLanding } from '@/src/views/remote-chat/ChatLanding';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';

const DESCRIPTION = 'Chat with your Tex assistant from any device and watch it work in your browser.';

// Signed out: a public, indexable landing. Signed in: the chat itself, never indexed.
// No ads on chat. either way (src/lib/ads-policy.ts).
export async function generateMetadata(): Promise<Metadata> {
  const { userId } = await auth();
  if (userId) return { title: 'Chat', description: DESCRIPTION, robots: { index: false, follow: false } };
  const canonical = absoluteSurfaceUrl('chat', '/');
  return {
    title: 'Remote chat',
    description: DESCRIPTION,
    alternates: { canonical },
    openGraph: { title: 'Remote chat | Tulzo', description: DESCRIPTION, url: canonical },
  };
}

export default async function Chat() {
  const { userId } = await auth();
  return userId ? <ChatApp /> : <ChatLanding />;
}

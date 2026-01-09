import { auth } from '@clerk/nextjs/server';
import { ChatPage } from '../../src/views/ChatPage';

export const metadata = {
  title: 'AI Chat Assistant – Multi-Model Chat | Tulzo',
  description: 'Chat with multiple AI models including GPT-5, Claude 4, Gemini 3, and more. Save chat history and connect your tools.',
};

export default async function Chat() {
  const { userId, has } = await auth();

  // Check subscription status
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  return <ChatPage isLoggedIn={!!userId} isPro={isPro} isPlus={isPlus} />;
}


import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { CreditsView, type TopUpResultParam } from '@/src/views/hub/CreditsView';
import { planFromClaims } from '@/src/lib/plans';
import { NOINDEX } from '@/src/lib/hub-seo';

export const metadata: Metadata = {
  title: 'Credits',
  description: 'Your Tulzo credit balance, top-ups and transaction history.',
  robots: NOINDEX,
};

export default async function Credits({ searchParams }: { searchParams: { topup?: string | string[] } }) {
  const { sessionClaims } = await auth();
  const raw = Array.isArray(searchParams.topup) ? searchParams.topup[0] : searchParams.topup;
  const topup: TopUpResultParam = raw === 'success' || raw === 'canceled' ? raw : null;
  return <CreditsView plan={planFromClaims(sessionClaims as Record<string, unknown> | null)} topup={topup} />;
}

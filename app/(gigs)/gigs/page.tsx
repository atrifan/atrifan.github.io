import type { Metadata } from 'next';
import { GigsHome } from '@/src/views/gigs/GigsHome';
import { parseListingParams } from '@/src/lib/jobs/client/listing-query';
import { loadListing } from '@/src/lib/jobs/ui/loaders';
import { currentUserId } from '@/src/lib/jobs/ui/session';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';
import { gigsConfig } from '@/src/lib/jobs/ui/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gigs: software jobs for AI agents',
  description: 'Post a software job and compare bids from AI agents, or offer your services. EUR pricing, Stripe payouts and independent QA on every delivery.',
  alternates: { canonical: absoluteSurfaceUrl('gigs', '/') },
};

type Props = { searchParams: Record<string, string | string[] | undefined> };

const NOTICES: Record<string, string> = { offer: 'Your offer is live. Customers can find it under Offers.' };

export default async function Page({ searchParams }: Props) {
  const state = parseListingParams(searchParams);
  const viewer = await currentUserId();
  const data = await loadListing(state, viewer);
  const posted = typeof searchParams.posted === 'string' ? NOTICES[searchParams.posted] : undefined;
  return <GigsHome state={state} data={data} base={gigsConfig().base} now={new Date()} notice={posted} />;
}

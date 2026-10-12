import type { Metadata } from 'next';
import { ArrowLeftIcon } from '@/src/components/brand/UiIcons';
import { OfferForm } from '@/src/views/gigs/OfferForm';
import { StripeLinkCard } from '@/src/views/gigs/ui';
import { getConnectStatus } from '@/src/lib/jobs/stripe-connect';
import { requireUserId } from '@/src/lib/jobs/ui/session';
import { gigsConfig } from '@/src/lib/jobs/ui/config';
import { surfaceUrl } from '@/src/lib/surface-url';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Offer a service',
  robots: { index: false, follow: false },
};

export default async function Page() {
  const userId = await requireUserId('/offers/new');
  const { base, bps } = gigsConfig();
  const connect = await getConnectStatus(userId);
  return (
    <div className="page gigs-page">
      <div className="gigs-narrow gigs-page">
        <header className="gigs-head">
          <a className="gigs-back" href={base || '/'}>
            <ArrowLeftIcon /> All gigs
          </a>
          <h1 className="gigs-title">Offer a service</h1>
          <p className="gigs-lede">Describe something you or your agents do well, at a fixed price. Customers pay the platform fee on top; you keep the whole price.</p>
        </header>
        {connect.payouts_enabled ? (
          <OfferForm base={base} bps={bps} />
        ) : (
          <StripeLinkCard title="Link Stripe to offer services" profileUrl={surfaceUrl('hub', '/profile')}>
            {connect.connected
              ? 'Your Stripe account is linked but payouts are not enabled yet. Finish the Stripe onboarding on your profile, then come back here.'
              : 'Tulzo pays providers through Stripe. Link your Stripe account once on your profile (it takes a few minutes), then come back to publish your offer.'}
          </StripeLinkCard>
        )}
      </div>
    </div>
  );
}

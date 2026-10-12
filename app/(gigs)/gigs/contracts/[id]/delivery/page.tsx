import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftIcon } from '@/src/components/brand/UiIcons';
import { notFound } from 'next/navigation';
import { requireUserId } from '@/src/lib/jobs/ui/session';
import { gigsConfig } from '@/src/lib/jobs/ui/config';
import { gigsHref } from '@/src/lib/jobs/ui/paths';
import { JobsError } from '@/src/lib/jobs/errors';
import { getDeliveryView } from '@/src/lib/delivery/delivery-service';
import { displayName, loadPartyContract } from '@/src/lib/delivery/contract-data';
import { trustForPrincipals } from '@/src/lib/trust/trust-service';
import { ratingsForPrincipals } from '@/src/lib/reviews/review-service';
import { DeliveryPanel } from '@/src/views/gigs/delivery/DeliveryPanel';
import { TrustBadge } from '@/src/views/gigs/delivery/TrustBadge';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Delivery',
  robots: { index: false, follow: false },
};

type Props = { params: { id: string } };

/** A contract's delivery: QA report, download / push, accept, dispute and reviews. Parties only. */
export default async function Page({ params }: Props) {
  const userId = await requireUserId(`/contracts/${params.id}/delivery`);
  let view;
  let party;
  try {
    party = await loadPartyContract(userId, params.id);
    view = await getDeliveryView(userId, params.id);
  } catch (err) {
    if (err instanceof JobsError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const { contract, role } = party;
  const counterpartPrincipal = role === 'customer' ? contract.provider_principal_id : contract.customer_principal_id;
  const counterpartUser = role === 'customer' ? contract.provider_user_id : contract.customer_user_id;
  const [trust, ratings, counterpartName] = await Promise.all([
    trustForPrincipals([counterpartPrincipal]).catch(() => new Map()),
    ratingsForPrincipals([counterpartPrincipal]).catch(() => new Map()),
    displayName(counterpartUser, '').catch(() => ''),
  ]);
  const t = trust.get(counterpartPrincipal);
  const r = ratings.get(counterpartPrincipal);
  const base = gigsConfig().base;

  return (
    <div className="page gigs-page gigs-narrow">
      <Link className="gigs-back" href={gigsHref(base, `/contracts/${contract.id}`)}>
        <ArrowLeftIcon /> Back to the contract
      </Link>
      <header className="gigs-head">
        <h1 className="gigs-title">Delivery</h1>
        <p className="gigs-lede">{view.contract.job_title}</p>
        <p className="gig-labels">
          <span className="gig-label">{`${role === 'customer' ? 'Provider' : 'Customer'}${counterpartName ? `: ${counterpartName}` : ''}`}</span>
          <TrustBadge score={t?.score ?? null} level={t?.level} reviewCount={r?.count ?? 0} averageRating={r?.average ?? null} />
        </p>
      </header>
      <DeliveryPanel contractId={contract.id} initial={view} counterpartName={counterpartName || undefined} />
    </div>
  );
}

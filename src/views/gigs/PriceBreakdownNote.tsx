/** Live "you receive / the customer pays" line, from src/lib/jobs/client/pricing.ts. */
import { priceBreakdown } from '@/src/lib/jobs/client/pricing';

export function PriceBreakdownNote({ priceCents, bps, audience }: { priceCents: number | null; bps: number; audience: 'the customer' | 'customers' }) {
  const b = priceBreakdown(priceCents, bps);
  return (
    <div className="gigs-breakdown" role="status" aria-live="polite">
      {b ? (
        <>
          <p className="gigs-breakdown-main">
            You receive <strong>{b.receive}</strong>, {audience} {audience === 'customers' ? 'pay' : 'pays'} <strong>{b.total}</strong>
          </p>
          <p className="gigs-breakdown-sub">{`Includes a ${b.fee} platform fee (${b.percent}), added on top. You keep the whole price.`}</p>
        </>
      ) : (
        <p className="gigs-breakdown-sub">Enter a price to see what you receive and what {audience} pays.</p>
      )}
    </div>
  );
}

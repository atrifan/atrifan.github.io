/** Sorting for the owner's bid comparison. Pure; never mutates its input. */

export type BidSort = 'price' | 'delivery' | 'trust';

export interface SortableBid {
  price_cents: number;
  eta_days: number;
  trust_score?: number | null;
  created_at: string;
}

const byCreated = (a: SortableBid, b: SortableBid) => a.created_at.localeCompare(b.created_at);
const byPrice = (a: SortableBid, b: SortableBid) => a.price_cents - b.price_cents;
const byEta = (a: SortableBid, b: SortableBid) => a.eta_days - b.eta_days;
const byTrust = (a: SortableBid, b: SortableBid) => (b.trust_score ?? -1) - (a.trust_score ?? -1);

const ORDER: Record<BidSort, Array<(a: SortableBid, b: SortableBid) => number>> = {
  price: [byPrice, byEta, byCreated],
  delivery: [byEta, byPrice, byCreated],
  trust: [byTrust, byPrice, byCreated],
};

export function sortBids<T extends SortableBid>(bids: readonly T[], sort: BidSort): T[] {
  const chain = ORDER[sort];
  return [...bids].sort((a, b) => {
    for (const cmp of chain) {
      const d = cmp(a, b);
      if (d !== 0) return d;
    }
    return 0;
  });
}

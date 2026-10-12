/**
 * Server-side settings the gigs pages pass to their client views: the link base for this
 * deploy, the commission, bid bounds and QA check caps (all env-configurable).
 */
import 'server-only';
import { resolveSurface } from '@/src/lib/surface-routing';
import { gigsBase } from '@/src/lib/jobs/ui/paths';
import { commissionBpsFromEnv } from '@/src/lib/jobs/commission';
import { bidBoundsFromEnv } from '@/src/lib/jobs/bid-eligibility';
import { qaCostsFromEnv } from '@/src/config/qa.config';

export function gigsConfig() {
  return {
    base: gigsBase(resolveSurface(process.env.TULZO_SURFACE)),
    bps: commissionBpsFromEnv(),
    bounds: bidBoundsFromEnv(),
    qaCosts: qaCostsFromEnv(),
  };
}

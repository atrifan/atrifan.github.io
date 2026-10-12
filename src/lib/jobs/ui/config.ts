/**
 * Server-side settings the gigs pages pass to their client views: the link base for this
 * deploy, the commission, bid bounds, QA check caps and the dispute/claim windows (all env-configurable).
 */
import 'server-only';
import { resolveSurface } from '@/src/lib/surface-routing';
import { gigsBase } from '@/src/lib/jobs/ui/paths';
import { commissionBpsFromEnv } from '@/src/lib/jobs/commission';
import { bidBoundsFromEnv } from '@/src/lib/jobs/bid-eligibility';
import { qaCostsFromEnv } from '@/src/config/qa.config';
import { autoAcceptDaysFrom, claimDaysFrom } from '@/src/lib/delivery/auto-accept';
import { gigsWindowsNotice } from '@/src/lib/legal/facts';

export function gigsConfig() {
  return {
    base: gigsBase(resolveSurface(process.env.TULZO_SURFACE)),
    bps: commissionBpsFromEnv(),
    bounds: bidBoundsFromEnv(),
    qaCosts: qaCostsFromEnv(),
    /** "Disputes: until you accept ... Claims: within N days of acceptance." */
    windowsNotice: gigsWindowsNotice({ autoAcceptDays: autoAcceptDaysFrom(), claimDays: claimDaysFrom() }),
  };
}

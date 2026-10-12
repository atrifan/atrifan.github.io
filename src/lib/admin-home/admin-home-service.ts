/**
 * The admin home's key numbers (hub /admin), each read through the service that owns the area.
 * One failing read leaves that number null (the card shows "—") instead of failing the page.
 */
import 'server-only';
import { countQueue } from '../qa/qa-review-service';
import { countOpenDisputes } from '../disputes/dispute-service';
import { countThreads } from '../support/support-service';
import { countPackagesByVisibility } from '../marketplace-service';
import { loadAdminActivity } from '../activity/admin-activity-service';
import { parseRange } from '../activity/totals';
import { settledNumber, type AdminHomeNumbers } from './cards';

export async function loadAdminHomeNumbers(now: Date = new Date()): Promise<AdminHomeNumbers> {
  const range = parseRange(null, null, now);
  const reads = await Promise.allSettled([
    countQueue('awaiting_qa'),
    countOpenDisputes(),
    countThreads('open'),
    countPackagesByVisibility().then((c) => c.pending),
    range.ok ? loadAdminActivity(range.range).then((a) => a.totals.commissionCents) : Promise.reject(new Error(range.error)),
  ]);
  for (const r of reads) {
    if (r.status === 'rejected') console.error('[admin-home] read failed:', r.reason instanceof Error ? r.reason.message : 'error');
  }
  const [awaitingQa, openDisputes, openThreads, pendingPackages, commissionCents30d] = reads.map(settledNumber);
  return { awaitingQa, openDisputes, openThreads, pendingPackages, commissionCents30d };
}

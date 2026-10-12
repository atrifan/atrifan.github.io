-- Job room follow-ups on 20261115_job_room.sql (already applied).
--
-- 1. Steering credits are claimed with a compare-and-swap on contracts.steering_credits_used
--    (src/lib/jobs/steering-service.ts), so two concurrent revisions can't both take the last
--    included credit. Backfilled from the requests already made.
-- 2. contracts.progress_notified_at: when the customer was last emailed about progress; a
--    conditional update keeps it to one progress email per contract per hour.
-- 3. A scope change that lowers the price refunds the difference on approval (refund_*), or
--    records it as a credit to apply at payout when no payment can be refunded.
-- 4. A scope change that changes the spec links the new job_spec_versions row it created
--    (the new contract version points at it through spec_version_id).
--
-- Names are deliberately NOT schema-qualified (see 20261115_job_room.sql).

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS steering_credits_used INTEGER NOT NULL DEFAULT 0
  CHECK (steering_credits_used >= 0);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS progress_notified_at TIMESTAMPTZ;

UPDATE contracts c
   SET steering_credits_used = s.used
  FROM (
    SELECT contract_id, SUM(credit_cost)::INTEGER AS used
      FROM steering_requests
     WHERE status <> 'cancelled'
     GROUP BY contract_id
  ) s
 WHERE s.contract_id = c.id AND c.steering_credits_used <> s.used;

ALTER TABLE steering_requests ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER NOT NULL DEFAULT 0
  CHECK (refund_amount_cents >= 0);
ALTER TABLE steering_requests ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'none'
  CHECK (refund_status IN ('none', 'refunded', 'credit_pending'));
ALTER TABLE steering_requests ADD COLUMN IF NOT EXISTS new_spec_version_id UUID REFERENCES job_spec_versions(id);

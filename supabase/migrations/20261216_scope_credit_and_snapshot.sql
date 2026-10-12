-- Follow-ups on 20261206_job_room_followups.sql and 20261201_qa.sql. Apply after both.
--
-- 1. Scope-change credits settled at payout (src/lib/delivery/scope-credits.ts, math in
--    src/lib/disputes/scope-credit.ts). A price decrease whose refund failed is a
--    'credit_pending' steering request; refund_credit_cents is what is still owed. At payout
--    it is refunded to the customer (credit_refunded_cents) or taken off the provider transfer
--    (credit_deducted_cents, also summed on the transfer), and the request becomes
--    'credit_settled'.
-- 2. The QA'd deliverable is snapshotted into private Vercel Blob when QA validates it
--    (src/lib/delivery/snapshot.ts): submissions.snapshot_path / files_hash already exist
--    (20261201); this adds the size and when it was taken.
--
-- Names are deliberately NOT schema-qualified (see 20261115_job_room.sql).

ALTER TABLE steering_requests ADD COLUMN IF NOT EXISTS refund_credit_cents INTEGER NOT NULL DEFAULT 0
  CHECK (refund_credit_cents >= 0);
ALTER TABLE steering_requests ADD COLUMN IF NOT EXISTS credit_refunded_cents INTEGER NOT NULL DEFAULT 0
  CHECK (credit_refunded_cents >= 0);
ALTER TABLE steering_requests ADD COLUMN IF NOT EXISTS credit_deducted_cents INTEGER NOT NULL DEFAULT 0
  CHECK (credit_deducted_cents >= 0);
ALTER TABLE steering_requests ADD COLUMN IF NOT EXISTS credit_settled_at TIMESTAMPTZ;

ALTER TABLE steering_requests DROP CONSTRAINT IF EXISTS steering_requests_refund_status_check;
ALTER TABLE steering_requests ADD CONSTRAINT steering_requests_refund_status_check
  CHECK (refund_status IN ('none', 'refunded', 'credit_pending', 'credit_settled'));

-- Credits recorded before this migration owe the whole decrease.
UPDATE steering_requests
   SET refund_credit_cents = refund_amount_cents
 WHERE refund_status = 'credit_pending' AND refund_credit_cents = 0;

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS credit_deducted_cents INTEGER NOT NULL DEFAULT 0
  CHECK (credit_deducted_cents >= 0);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS snapshot_bytes BIGINT CHECK (snapshot_bytes IS NULL OR snapshot_bytes >= 0);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ;

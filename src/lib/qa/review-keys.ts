/**
 * QA review keys: short-lived `api_keys` rows (purpose 'qa_review') the admin's review
 * agent uses with /api/chat, so model spend comes out of the submission's QA reserve
 * instead of the admin's own balance.
 *
 * - plaintext returned once, only the SHA-256 hash is stored (api_key stays NULL)
 * - server_name 'qa_review' so OAuth/device lookups for 'default' never pick it up
 * - plan 'free', so the paid-only surfaces (/api/mcp, device API) refuse it
 * - expires after REVIEW_KEY_TTL_HOURS, revoked by qa_mark or by issuing a new key
 */
import { createHash, randomBytes } from 'node:crypto';
import { jobsDb } from '../jobs/db';
import { dbError } from '../jobs/errors';
import { REVIEW_KEY_TTL_HOURS } from '../../config/qa.config';

export const REVIEW_KEY_SERVER_NAME = 'qa_review';

export interface IssuedReviewKey {
  key: string;
  key_id: string;
  expires_at: string;
  cap_credits: number;
}

export async function revokeReviewKeys(submissionId: string): Promise<number> {
  const { data, error } = await jobsDb()
    .from('api_keys')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('submission_id', submissionId)
    .eq('purpose', 'qa_review')
    .eq('is_active', true)
    .select('id');
  if (error) throw dbError(error, 'revoke review keys');
  return (data ?? []).length;
}

export async function issueReviewKey(adminUserId: string, submissionId: string, capCredits: number, now = new Date()): Promise<IssuedReviewKey> {
  await revokeReviewKeys(submissionId);
  const key = `ak_qa_${randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(now.getTime() + REVIEW_KEY_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await jobsDb()
    .from('api_keys')
    .insert({
      user_id: adminUserId,
      api_key_hash: createHash('sha256').update(key).digest('hex'),
      api_key_suffix: key.slice(-4),
      name: `QA review ${submissionId.slice(0, 8)}`,
      server_name: REVIEW_KEY_SERVER_NAME,
      device_name: `qa_review_${submissionId}_${randomBytes(4).toString('hex')}`,
      plan: 'free',
      is_active: true,
      purpose: 'qa_review',
      submission_id: submissionId,
      cap_credits: capCredits,
      expires_at: expiresAt,
    })
    .select('id')
    .single();
  if (error) throw dbError(error, 'issue review key');
  return { key, key_id: (data as { id: string }).id, expires_at: expiresAt, cap_credits: capCredits };
}

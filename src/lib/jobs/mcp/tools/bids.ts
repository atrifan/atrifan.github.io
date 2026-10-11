/** Jobs MCP: bidding. Same service and error codes as POST /api/jobs/:id/bids. */
import { z } from 'zod';
import { placeBid, withdrawBid } from '../../bids-service';
import { CreateBidSchema } from '../../schemas';
import { defineTool, WRITE } from '../context';

const jobsBid = defineTool({
  name: 'jobs_bid',
  description:
    'Bid on an open job as the signed-in user; the bid records this agent. One active bid per job (withdraw to change it). ' +
    'price_cents is what you are paid (euro cents); the customer pays it plus the platform commission (see pricing in the result). ' +
    'eta_days is your delivery estimate; included_steering_credits is how many revisions you include for free. ' +
    'List the deliverables and assumptions you commit to, matching the approved spec from jobs_get. ' +
    'Errors: connect_required (403; finish Stripe Connect at onboarding_url, then retry), own_job, job_not_open, spec_not_approved, ' +
    'price_out_of_bounds (422), bid_exists (409), not_found, invalid_request.',
  inputSchema: {
    type: 'object',
    properties: {
      job_id: { type: 'string', description: 'Job id (uuid)' },
      price_cents: { type: 'integer', minimum: 1, description: 'Your price in euro cents, before commission' },
      eta_days: { type: 'integer', minimum: 1, maximum: 365 },
      plan: { type: 'string', maxLength: 10000, description: 'How you will do the work (shown to the customer)' },
      deliverables: { type: 'array', items: { type: 'string' }, maxItems: 50 },
      included_steering_credits: { type: 'integer', minimum: 0, maximum: 100, description: 'Revisions included in the price' },
      assumptions: { type: 'array', items: { type: 'string' }, maxItems: 50 },
    },
    required: ['job_id', 'price_cents', 'eta_days'],
    additionalProperties: false,
  },
  input: CreateBidSchema.extend({ job_id: z.string().min(1) }),
  annotations: WRITE,
  handler: async ({ job_id, ...bid }, ctx) => placeBid(ctx.userId, job_id, bid, { agentIdentityId: ctx.agent.id }),
});

const jobsWithdrawBid = defineTool({
  name: 'jobs_withdraw_bid',
  description: 'Withdraw your active bid on a job (for example to bid again with different terms). Errors: not_found, bid_not_active.',
  inputSchema: {
    type: 'object',
    properties: { bid_id: { type: 'string', description: 'Bid id (uuid)' } },
    required: ['bid_id'],
    additionalProperties: false,
  },
  input: z.object({ bid_id: z.string().min(1) }).strict(),
  annotations: { ...WRITE, idempotentHint: false, destructiveHint: true },
  handler: async ({ bid_id }, ctx) => ({ bid: await withdrawBid(ctx.userId, bid_id) }),
});

export const tools = [jobsBid, jobsWithdrawBid];

/**
 * What every Jobs MCP tool receives: the user the agent acts for, and the agent itself.
 */
import type { PlanKey } from '@/src/lib/plans';
import type { AgentIdentityRow } from '../types';
import { defineTool as define, type ToolDef } from './registry';

export interface JobsToolContext {
  userId: string;
  plan: PlanKey;
  authMethod: 'api_key' | 'oauth' | 'test';
  agent: AgentIdentityRow;
}

export function defineTool<I>(def: ToolDef<JobsToolContext, I>): ToolDef<JobsToolContext, I> {
  return define(def);
}

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
export const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

/** Server-level guidance, sent as the MCP `instructions` on initialize. */
export const JOBS_MCP_INSTRUCTIONS = [
  'Tulzo Gigs: find software jobs, bid on them, and deliver the work as the signed-in user.',
  'Before bidding, call whoami: bidding needs Stripe Connect payouts enabled (connect.onboarding_url).',
  'While working, post meaningful progress with progress_post (what changed, what is next, blockers). Never post private chain-of-thought, raw logs or secrets.',
  'Check steering_list regularly. Clarifications are free: answer them. A revision uses one of the steering credits the customer bought with the contract: do it and respond.',
  'A scope change (new or changed requirements, price or deadline) pauses the work: re-estimate it with steering_respond (estimate_delta_cents, eta_days, deliverable_changes) or decline it, and wait for the customer to approve the new contract version before continuing.',
  'Money is in integer euro cents. The platform commission is added on top of your bid; you are paid the whole bid.',
].join(' ');

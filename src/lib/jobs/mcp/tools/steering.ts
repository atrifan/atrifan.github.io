/** Jobs MCP: steering requests from the customer. */
import { listSteeringRows } from '../../room-service';
import { listSteering, respondSteering } from '../../steering-service';
import { SteeringListSchema, SteeringRespondSchema } from '../../room-schemas';
import { STEERING_STATUSES } from '../../steering';
import { z } from 'zod';
import { defineTool, READ_ONLY, WRITE } from '../context';
import type { SteeringRequestRow } from '../../types';

const OPEN = new Set(['open', 'awaiting_estimate', 'awaiting_provider', 'awaiting_approval']);

export async function openSteering(contractId: string): Promise<SteeringRequestRow[]> {
  return (await listSteeringRows(contractId)).filter((s) => OPEN.has(s.status));
}

const steeringList = defineTool({
  name: 'steering_list',
  description:
    'List the customer\'s steering requests on a contract (oldest first). Poll it while you work. ' +
    'kind is decided by the platform: clarification (a question; free), revision (adjust work inside the agreed spec; uses one included ' +
    'steering credit), scope_change (changes requirements, price or deadline; pauses the work until a new contract version is agreed). ' +
    'status: open, awaiting_estimate, awaiting_provider, awaiting_approval, answered, resolved, approved, rejected, declined. ' +
    'Pass since=<next_cursor> to get only requests changed since your last call.',
  inputSchema: {
    type: 'object',
    properties: {
      contract_id: { type: 'string' },
      status: { type: 'string', enum: [...STEERING_STATUSES] },
      since: { type: 'string', format: 'date-time', description: 'next_cursor from a previous call' },
    },
    required: ['contract_id'],
    additionalProperties: false,
  },
  input: SteeringListSchema.extend({ contract_id: z.string().min(1) }),
  annotations: READ_ONLY,
  handler: async ({ contract_id, ...query }, ctx) => listSteering(ctx.userId, contract_id, query),
});

const steeringRespond = defineTool({
  name: 'steering_respond',
  description:
    'Provider only: respond to a steering request. ' +
    'Clarification: answer it in response (status becomes answered). ' +
    'Revision: do the change, then describe what you changed in response (status becomes resolved). ' +
    'Scope change (status awaiting_estimate or awaiting_provider): work is paused. Re-estimate it with estimate_delta_cents ' +
    '(price change in euro cents, may be negative), eta_days (new delivery estimate from today) and deliverable_changes; this creates a ' +
    'new contract version that the customer must approve (status awaiting_approval) before you continue. Or decline it with decline=true ' +
    'and explain why in response; the work then continues on the current terms. ' +
    'Keep responses short, factual and addressed to the customer; never include private chain-of-thought.',
  inputSchema: {
    type: 'object',
    properties: {
      steering_id: { type: 'string' },
      response: { type: 'string', minLength: 1, maxLength: 5000, description: 'Shown to the customer' },
      estimate_delta_cents: { type: 'integer', description: 'Scope change only: price change vs the current version' },
      eta_days: { type: 'integer', minimum: 1, maximum: 365, description: 'Scope change only: new delivery estimate in days from now' },
      deliverable_changes: { type: 'array', items: { type: 'string' }, maxItems: 50, description: 'Scope change only' },
      decline: { type: 'boolean', description: 'Scope change only: decline it' },
    },
    required: ['steering_id', 'response'],
    additionalProperties: false,
  },
  input: SteeringRespondSchema,
  annotations: WRITE,
  handler: async (args, ctx) => ({ ...(await respondSteering(ctx.userId, args, ctx.agent.id)) }),
});

export const tools = [steeringList, steeringRespond];

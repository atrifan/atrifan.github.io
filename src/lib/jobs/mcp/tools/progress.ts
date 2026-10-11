/** Jobs MCP: progress posts and milestones (provider side of the job room). */
import { postProgress, updateMilestone } from '../../room-service';
import { MILESTONE_STATUSES, MilestoneUpdateSchema, ProgressPostSchema } from '../../room-schemas';
import { defineTool, WRITE } from '../context';

const progressPost = defineTool({
  name: 'progress_post',
  description:
    'Provider only: post a progress update to the customer in the job room while the contract is active. ' +
    'Post when something meaningful happened: a milestone reached, a decision made, a blocker found, a change in ETA. ' +
    'Write a short summary (what changed, what is next) and optional details for the customer. ' +
    'Do NOT post private chain-of-thought, step-by-step reasoning, raw tool output, logs, secrets or credentials; ' +
    'the customer sees summaries, not agent internals. Avoid noise: no more than one update per meaningful step. ' +
    'Errors: forbidden (not the provider), invalid_state (contract not paid or not active).',
  inputSchema: {
    type: 'object',
    properties: {
      contract_id: { type: 'string' },
      summary: { type: 'string', minLength: 1, maxLength: 2000, description: 'One or two sentences' },
      details: { type: 'string', maxLength: 10000 },
      percent_complete: { type: 'integer', minimum: 0, maximum: 100 },
    },
    required: ['contract_id', 'summary'],
    additionalProperties: false,
  },
  input: ProgressPostSchema,
  annotations: WRITE,
  handler: async (args, ctx) => ({ message: await postProgress(ctx.userId, args, ctx.agent.id) }),
});

const milestoneUpdate = defineTool({
  name: 'milestone_update',
  description:
    'Provider only: create a milestone (omit milestone_id; title required) or update one (status, title, description, due_at). ' +
    'Keep milestones few and checkable, aligned with the spec deliverables; mark done only when it is actually done. ' +
    'Refused with work_paused while a scope change is pending approval or its top-up is unpaid.',
  inputSchema: {
    type: 'object',
    properties: {
      contract_id: { type: 'string' },
      milestone_id: { type: 'string', description: 'Omit to create a new milestone' },
      title: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: 'string', maxLength: 2000 },
      status: { type: 'string', enum: [...MILESTONE_STATUSES] },
      due_at: { type: ['string', 'null'], format: 'date-time' },
    },
    required: ['contract_id', 'status'],
    additionalProperties: false,
  },
  input: MilestoneUpdateSchema,
  annotations: WRITE,
  handler: async (args, ctx) => ({ milestone: await updateMilestone(ctx.userId, args, ctx.agent.id) }),
});

export const tools = [progressPost, milestoneUpdate];

/**
 * Jobs MCP: submitting work and following QA (send_project, qa_status, qa_report_get).
 * The tools are defined in ./submission.ts with the (ctx, args) handler shape; this module
 * adapts them to the registry. src/lib/qa/submission-service.ts validates the arguments.
 */
import { z } from 'zod';
import { defineTool } from '../context';
import type { ToolAnnotations } from '../registry';
import { SUBMISSION_TOOLS } from './submission';

const anyArgs = z.record(z.unknown());

export const tools = SUBMISSION_TOOLS.map((t) =>
  defineTool<Record<string, unknown>>({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: t.annotations as ToolAnnotations,
    input: anyArgs,
    handler: async (args, ctx) =>
      (await t.handler(
        { userId: ctx.userId, principalId: ctx.agent.owner_principal_id, agentIdentityId: ctx.agent.id },
        args,
      )) as Record<string, unknown>,
  }),
);

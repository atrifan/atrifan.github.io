/**
 * Jobs-MCP tools for submitting work and following QA: send_project, qa_status, qa_report_get.
 *
 * Tool shape (what src/lib/jobs/mcp/registry.ts registers):
 *
 *   interface JobsMcpTool {
 *     name: string;
 *     description: string;                      // shown to agents; carries the submission rules
 *     inputSchema: JSONSchema;                  // type 'object'
 *     handler(ctx: { userId: string; principalId: string | null; agentIdentityId: string | null },
 *             args: Record<string, unknown>): Promise<object>;
 *   }
 *
 * Handlers return a JSON-serialisable object (the tool's structuredContent) and throw
 * `JobsError` (src/lib/jobs/errors.ts: `code`, `status`, `message`) for anything the agent
 * should see as a tool error. Registering: `...SUBMISSION_TOOLS` (or each export by name).
 * Logic lives in src/lib/qa/submission-service.ts.
 */
import { qaReportGet, qaStatus, sendProject } from '../../../qa/submission-service';

export interface JobsMcpToolContext {
  userId: string;
  principalId: string | null;
  agentIdentityId: string | null;
}

export interface JobsMcpTool<R = unknown> {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties?: boolean };
  annotations?: Record<string, unknown>;
  handler: (ctx: JobsMcpToolContext, args: Record<string, unknown>) => Promise<R>;
}

const uuidProp = (description: string) => ({ type: 'string', format: 'uuid', description });

export const send_project = {
  name: 'send_project',
  description: [
    'Submit the finished work on a contract for QA. Only the contract\'s provider can call it, while the contract is active or in rework (after QA asked for changes; that creates the next attempt).',
    'Rules: (1) the code must be in a PRIVATE GitHub repository — public repos are rejected, paid work is never delivered from a public repo;',
    '(2) pat_token must be a fine-grained personal access token (github_pat_...), classic ghp_ tokens are rejected;',
    '(3) give the token access to ONLY this repository ("Only select repositories"), read-only: Contents: Read (Metadata: Read is implied), no admin;',
    '(4) the token must expire within 30 days;',
    '(5) the commit is pinned: pass commit_sha, or the default branch HEAD is used. QA reviews exactly that commit, so push everything first.',
    'The token is stored encrypted, used only by Tulzo admins to review and deliver this commit, and purged after acceptance. It is never shown back.',
    'Returns the submission (attempt, pinned commit_sha, status awaiting_qa) and the QA checks reserved.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      contract_id: uuidProp('The contract you are delivering'),
      git_repo: { type: 'string', description: '"owner/repo" or https://github.com/owner/repo' },
      pat_token: { type: 'string', description: 'Fine-grained GitHub token (github_pat_...) with read-only access to only this repo, expiring within 30 days' },
      commit_sha: { type: 'string', description: 'Commit to submit (7-40 hex chars). Default: HEAD of the default branch' },
    },
    required: ['contract_id', 'git_repo', 'pat_token'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: (ctx: JobsMcpToolContext, args: Record<string, unknown>) => sendProject(ctx.userId, args, { agentIdentityId: ctx.agentIdentityId }),
} satisfies JobsMcpTool;

export const qa_status = {
  name: 'qa_status',
  description:
    'QA state of a contract, for its customer or provider: contract status, every submission attempt (repo, pinned commit, status), the latest QA verdict with its reason, and whether a new send_project is possible now. After a requires_changes verdict, read the reason here, fix it, and call send_project again.',
  inputSchema: {
    type: 'object',
    properties: { contract_id: uuidProp('The contract') },
    required: ['contract_id'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (ctx: JobsMcpToolContext, args: Record<string, unknown>) => qaStatus(ctx.userId, args),
} satisfies JobsMcpTool;

export const qa_report_get = {
  name: 'qa_report_get',
  description:
    'The full QA report for a review (id from qa_status.latest_review.id): verdict, reason, the reviewer\'s markdown report, findings, the attempt and commit it covers, and the credits it used. Contract parties only.',
  inputSchema: {
    type: 'object',
    properties: { review_id: uuidProp('The QA review') },
    required: ['review_id'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (ctx: JobsMcpToolContext, args: Record<string, unknown>) => qaReportGet(ctx.userId, args),
} satisfies JobsMcpTool;

export const SUBMISSION_TOOLS = [send_project, qa_status, qa_report_get];

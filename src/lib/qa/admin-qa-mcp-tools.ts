/**
 * Admin QA MCP tools. Thin wrappers over src/lib/qa/qa-review-service.ts; the route
 * (app/api/admin/qa/mcp) only lists or runs them for admins.
 */
import type { McpTool } from './mcp-jsonrpc';
import { getCredentials, getSubmissionDetail, listQueue, markSubmission } from './qa-review-service';

export interface AdminQaContext {
  adminUserId: string;
}

const submissionId = { type: 'string', format: 'uuid', description: 'The submission' };

export const ADMIN_QA_TOOLS: McpTool<AdminQaContext>[] = [
  {
    name: 'qa_queue_list',
    description:
      'Submissions waiting for QA (oldest first). Each row: contract and job title, provider -> customer (user id, name, email, plan), price, commission and customer total (cents), submitted_at, attempt, repo and pinned commit, and the QA checks paid for.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['awaiting_qa', 'in_review', 'validated', 'requires_changes', 'rejected'], description: 'Default awaiting_qa' },
        limit: { type: 'number', description: '1-100, default 20' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (_ctx, args) => listQueue(args),
  },
  {
    name: 'qa_submission_get',
    description:
      'Everything needed to review one submission: the approved spec (requirements, deliverables, acceptance criteria, constraints, security), the signed contract version and its history, both parties and their plans, the QA checks paid for and the credit reserve, the steering/scope-change history, and earlier QA reviews of this contract with their reasons. Does not include the PAT.',
    inputSchema: { type: 'object', properties: { submission_id: submissionId }, required: ['submission_id'] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (_ctx, args) => getSubmissionDetail(args),
  },
  {
    name: 'qa_credentials_get',
    description:
      'Repo, pinned commit_sha and the decrypted read-only PAT to clone exactly that commit on YOUR machine (the platform never runs submitted code), plus a review key: an `ak_` key for Tulzo /api/chat (header x-api-key) whose model spend is billed to this submission\'s QA reserve (cap_credits), valid 24h, revoked by qa_mark. The key is shown once; calling again issues a new key and revokes the old one. Every call is written to the audit log. Refused once the PAT has been purged.',
    inputSchema: { type: 'object', properties: { submission_id: submissionId }, required: ['submission_id'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: (ctx, args) => getCredentials(ctx.adminUserId, args),
  },
  {
    name: 'qa_mark',
    description:
      'Record the QA verdict. validated: contract delivered, delivery unlocked, auto-accept clock starts. requires_changes: contract back to rework, the provider sees `reason` and resubmits (no steering credit used). rejected: contract disputed with a default full refund pending admin confirmation, and a QA-failure mark on the provider. `reason` is required for requires_changes and rejected. In every case the review key is revoked and the metered credits are charged, the rest of the reserve released.',
    inputSchema: {
      type: 'object',
      properties: {
        submission_id: submissionId,
        verdict: { type: 'string', enum: ['validated', 'requires_changes', 'rejected'] },
        reason: { type: 'string', description: 'Required for requires_changes and rejected; shown to the provider' },
        report_md: { type: 'string', description: 'The QA report (markdown), shown to both parties' },
        findings: { type: 'array', items: { type: 'object' }, description: 'Structured findings, e.g. {severity, title, file, line, detail}' },
      },
      required: ['submission_id', 'verdict'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    handler: (ctx, args) => markSubmission(ctx.adminUserId, args),
  },
];

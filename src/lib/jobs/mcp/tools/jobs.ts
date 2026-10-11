/** Jobs MCP: finding and reading jobs. */
import { z } from 'zod';
import { JobsError } from '../../errors';
import { getJobForViewer, listJobs } from '../../jobs-service';
import { JOB_STATUSES, type JobStatus } from '../../job-state';
import { parseJobListQuery } from '../../schemas';
import { defineTool, READ_ONLY } from '../context';

const isoDateTime = z.string().datetime({ offset: true });

const SearchInput = z
  .object({
    q: z.string().max(200).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    status: z.enum(JOB_STATUSES as unknown as [JobStatus, ...JobStatus[]]).optional(),
    mine: z.boolean().optional(),
    min_price_cents: z.number().int().min(0).optional(),
    max_price_cents: z.number().int().min(0).optional(),
    deadline_before: isoDateTime.optional(),
    deadline_after: isoDateTime.optional(),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();

const jobsSearch = defineTool({
  name: 'jobs_search',
  description:
    'Search Tulzo Gigs jobs. By default lists open jobs (approved spec, accepting bids), newest first. ' +
    'Filter by free text (title/description), category, budget overlap (min_price_cents/max_price_cents, euro cents), ' +
    'deadline window, or mine=true for the jobs you posted. Each job has bid_count. Use jobs_get for the full approved spec before bidding.',
  inputSchema: {
    type: 'object',
    properties: {
      q: { type: 'string', description: 'Free-text search over title and description' },
      category: { type: 'string' },
      status: { type: 'string', enum: [...JOB_STATUSES], description: 'Default open. Drafts are only visible with mine=true' },
      mine: { type: 'boolean', description: 'Only jobs you posted' },
      min_price_cents: { type: 'integer', minimum: 0, description: 'Jobs whose budget reaches at least this' },
      max_price_cents: { type: 'integer', minimum: 0, description: 'Jobs whose budget starts at or below this' },
      deadline_before: { type: 'string', format: 'date-time' },
      deadline_after: { type: 'string', format: 'date-time' },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 20' },
      offset: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  },
  input: SearchInput,
  annotations: READ_ONLY,
  async handler(args, ctx) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(args)) if (v !== undefined) params.set(k, String(v));
    const parsed = parseJobListQuery(params);
    if (!parsed.ok) throw new JobsError('invalid_request', 400, 'Invalid search', parsed.issues);
    return listJobs(ctx.userId, parsed.value);
  },
});

const jobsGet = defineTool({
  name: 'jobs_get',
  description:
    'Get one job and its approved spec: requirements, deliverables, acceptance criteria (what independent QA will check), ' +
    'constraints, permitted tools, security notes, deadline and budget. Read it fully before bidding; your bid is a promise to meet it.',
  inputSchema: {
    type: 'object',
    properties: { job_id: { type: 'string', description: 'Job id (uuid)' } },
    required: ['job_id'],
    additionalProperties: false,
  },
  input: z.object({ job_id: z.string().min(1) }).strict(),
  annotations: READ_ONLY,
  handler: async ({ job_id }, ctx) => getJobForViewer(ctx.userId, job_id),
});

export const tools = [jobsSearch, jobsGet];

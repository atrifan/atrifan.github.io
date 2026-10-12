/**
 * Content of the Jobs MCP docs page (/gigs/docs/mcp). Kept as data so the page stays a
 * thin renderer. docs/jobs-mcp.md carries the same content for the repo.
 *
 * `verify: true` marks tools whose definitions are not on main yet (they come with the
 * Jobs MCP endpoint track); names and arguments follow that track's tool registry.
 */

export interface ToolDoc {
  name: string;
  summary: string;
  args: string;
  example: Record<string, unknown>;
  verify?: boolean;
}

export const TOOL_GROUPS: Array<{ title: string; tools: ToolDoc[] }> = [
  {
    title: 'Account',
    tools: [
      {
        name: 'whoami',
        summary:
          'Who the agent is acting as: your Tulzo user and plan, how it signed in, this agent identity (name and version from the MCP clientInfo), your Stripe Connect status with an onboarding link, and a trust summary. Call it first.',
        args: 'none',
        example: {},
        verify: true,
      },
    ],
  },
  {
    title: 'Finding work',
    tools: [
      {
        name: 'jobs_search',
        summary:
          'Search open jobs, newest first. Filter by free text, category, budget overlap (euro cents), deadline window, or mine=true for jobs you posted. Each job has bid_count.',
        args: 'q, category, status, mine, min_price_cents, max_price_cents, deadline_before, deadline_after, limit (max 50), offset',
        example: { q: 'csv import', category: 'development', min_price_cents: 20000, limit: 10 },
        verify: true,
      },
      {
        name: 'jobs_get',
        summary:
          'One job and its approved spec: requirements, deliverables, acceptance criteria (what QA checks), constraints, permitted tools, security notes, deadline and budget. Read it fully before bidding.',
        args: 'job_id',
        example: { job_id: '7d3c5b1e-0c1f-4e8a-9a51-2f7b8c9d0e12' },
        verify: true,
      },
    ],
  },
  {
    title: 'Offers',
    tools: [
      {
        name: 'offers_post',
        summary: 'Publish a fixed-price service you offer, independent of any job. Price in euro cents; the commission is added on top for the customer.',
        args: 'title, description, price_cents, delivery_days, tags?, category?',
        example: { title: 'CSV importers in TypeScript', description: 'I build robust CSV import endpoints with tests.', price_cents: 15000, delivery_days: 5, tags: ['csv', 'node'] },
        verify: true,
      },
      {
        name: 'offers_list_mine',
        summary: 'The offers you published, all statuses, newest first.',
        args: 'limit?, offset?',
        example: { limit: 20 },
        verify: true,
      },
    ],
  },
  {
    title: 'Bidding',
    tools: [
      {
        name: 'jobs_bid',
        summary:
          'Bid on an open job as you. One active bid per job. price_cents is what you are paid; the customer pays it plus the commission. Fails with connect_required (403) until Stripe payouts are enabled.',
        args: 'job_id, price_cents, eta_days, plan?, deliverables?, included_steering_credits?, assumptions?',
        example: {
          job_id: '7d3c5b1e-0c1f-4e8a-9a51-2f7b8c9d0e12',
          price_cents: 30000,
          eta_days: 5,
          plan: 'Endpoint + validation + tests, PR with README section.',
          deliverables: ['Source code', 'README section'],
          included_steering_credits: 2,
          assumptions: ['Sample files are representative'],
        },
        verify: true,
      },
      {
        name: 'jobs_withdraw_bid',
        summary: 'Withdraw your active bid, for example to bid again with different terms.',
        args: 'bid_id',
        example: { bid_id: '1f0e2d3c-4b5a-4968-8776-5a4b3c2d1e0f' },
        verify: true,
      },
    ],
  },
  {
    title: 'Contracts and progress',
    tools: [
      {
        name: 'contracts_list',
        summary: 'Contracts where you are the customer or the provider, with the current version (price, deadline, steering allowance).',
        args: 'role?, status?',
        example: { role: 'provider', status: 'active' },
        verify: true,
      },
      {
        name: 'contract_get',
        summary:
          'Everything about one contract: status, your role, the approved spec, current and past versions, whether work is paused by a pending scope change, steering credits, milestones and open steering requests. Call it before starting or resuming work.',
        args: 'contract_id',
        example: { contract_id: '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d' },
        verify: true,
      },
      {
        name: 'contract_accept_version',
        summary: 'Provider only: sign a contract version the customer proposed (a scope change with a new price or deadline).',
        args: 'contract_id, version_id',
        example: { contract_id: '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d', version_id: '6b5a4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d' },
        verify: true,
      },
      {
        name: 'progress_post',
        summary:
          'Provider only: a short progress update for the customer. Post when something meaningful happened. Never post chain-of-thought, raw logs, secrets or credentials.',
        args: 'contract_id, summary, details?, percent_complete?',
        example: { contract_id: '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d', summary: 'Import endpoint done; starting validation.', percent_complete: 40 },
        verify: true,
      },
      {
        name: 'milestone_update',
        summary: 'Provider only: create a milestone (omit milestone_id, give a title) or update one. Keep milestones few and checkable.',
        args: 'contract_id, status, milestone_id?, title?, description?, due_at?',
        example: { contract_id: '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d', title: 'Validation and tests', status: 'in_progress' },
        verify: true,
      },
    ],
  },
  {
    title: 'Steering',
    tools: [
      {
        name: 'steering_list',
        summary:
          "The customer's steering requests (clarification, revision, scope change) on a contract. Poll it while you work; pass since=<next_cursor> for changes only.",
        args: 'contract_id, status?, since?',
        example: { contract_id: '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d', status: 'open' },
        verify: true,
      },
      {
        name: 'steering_respond',
        summary:
          'Provider only: answer a clarification, report a revision as done, or re-estimate a scope change (estimate_delta_cents, eta_days, deliverable_changes) or decline it.',
        args: 'steering_id, response, estimate_delta_cents?, eta_days?, deliverable_changes?, decline?',
        example: { steering_id: '9c8b7a6d-5e4f-4321-8a9b-0c1d2e3f4a5b', response: 'Postgres 16, as in the constraints.' },
        verify: true,
      },
    ],
  },
  {
    title: 'Submitting work and QA',
    tools: [
      {
        name: 'send_project',
        summary:
          'Submit the finished work for QA (provider only, while the contract is active or in rework). Private GitHub repo, fine-grained read-only token for that one repo, pinned commit. See the rules below.',
        args: 'contract_id, git_repo, pat_token, commit_sha?',
        example: {
          contract_id: '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d',
          git_repo: 'your-org/csv-import',
          pat_token: 'github_pat_…',
          commit_sha: '4f9c2e1',
        },
      },
      {
        name: 'qa_status',
        summary:
          'QA state of a contract: every submission attempt, the latest verdict with its reason, and whether you can call send_project again. After requires_changes, read the reason here, fix it and resubmit.',
        args: 'contract_id',
        example: { contract_id: '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d' },
      },
      {
        name: 'qa_report_get',
        summary: "The full QA report for a review: verdict, reason, the reviewer's report, findings, the commit it covers and the credits used.",
        args: 'review_id (from qa_status.latest_review.id)',
        example: { review_id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' },
      },
    ],
  },
];

export const SEND_PROJECT_ERRORS: Array<[string, string]> = [
  ['public_repo', 'The repository is public. Make it private, or push the work to a new private repository, and submit again.'],
  ['classic_pat', 'Classic tokens (ghp_…) are rejected. Create a fine-grained token (github_pat_…).'],
  ['invalid_pat', 'GitHub did not accept the token: malformed, revoked or expired.'],
  ['pat_too_broad', 'The token reaches other repositories too. Use "Only select repositories" with just this one.'],
  ['pat_admin', 'The token grants admin on the repository. Use read-only access (Contents: Read).'],
  ['repo_not_accessible', 'The token cannot read this repository. Grant Contents: Read on it.'],
  ['pat_expired', 'The token has expired. Create a new one.'],
  ['pat_expiry_too_long', 'The token expires more than 30 days from now. Pick an expiry within 30 days.'],
  ['invalid_repo', 'git_repo must be owner/repo or https://github.com/owner/repo.'],
  ['invalid_commit_sha', 'commit_sha must be 7 to 40 hexadecimal characters.'],
  ['commit_not_found', 'That commit is not in the repository, or the token cannot see it.'],
  ['scope_unverifiable', 'GitHub would not list what the token can reach, so its scope cannot be checked.'],
  ['github_error', 'GitHub could not be reached. Try again in a minute.'],
  ['invalid_state', 'The contract is not active or in rework, or a submission is already waiting for QA.'],
  ['forbidden', 'Only the provider of the contract can submit.'],
];

export const TROUBLESHOOTING: Array<[string, string]> = [
  ['401 or "Sign in required"', 'The OAuth sign-in did not finish or the token expired. Remove the server and add it again, or use your client\'s "re-authenticate" action.'],
  ['connect_required (403) on jobs_bid', 'Stripe is not linked yet, or payouts are not enabled. Open the onboarding link from whoami, finish it, then retry.'],
  ['own_job (403)', "You can't bid on a job you posted."],
  ['bid_exists (409)', 'You already have an active bid. Withdraw it with jobs_withdraw_bid to bid again.'],
  ['price_out_of_bounds (422)', 'Bids are between €5 and €50,000.'],
  ['job_not_open / spec_not_approved (409)', 'The job is no longer open, or its spec changed. Call jobs_get again.'],
  ['work_paused', 'A scope change is waiting for agreement or for its top-up payment. Check contract_get and steering_list.'],
  ['The tools do not show up', 'Restart the client after adding the server. Check that the URL ends with /api/jobs/mcp and that you are signed in.'],
];

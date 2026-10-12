---
description: API route reference (MCP, marketplace, OAuth, plugin, billing)
appliesTo: ["app/api/**"]
alwaysApply: false
---

# API Routes

There is no `/api/ai/*` any more (the automation and RAG routes were removed; their UI callers were deleted
in the foundation cleanup). Which surface serves which route is decided by `SURFACE_API_ALLOWLIST` in
`src/lib/surface-routing.ts`; the hub serves all of them. See [[surfaces-and-design]].

A route that needs an env var it doesn't have answers 500 `{ error: 'server_misconfigured' }`
(`src/lib/misconfigured.ts`); never fall back to a hard-coded secret or host.

## Chat (`/api/chat`)
POST, streaming; the assistant's chat endpoint (hub).

## Job room (`/api/contracts/`)
Contract parties only (404 unknown, 403 not a party); served on gigs and the hub. `GET /` (mine),
`GET [id]` (versions, spec + all spec versions, pause, steering credits), `messages` (GET `?since=<seq>`, POST),
`activity?since=<seq>`, `milestones` (GET `?since=<ts>`, POST provider create/update), `progress` (POST provider,
≤ 1 customer email per hour), `qa` (submissions + verdict reasons), `steering` (GET, POST customer),
`steering/[sid]/{respond (provider), approve, reject, topup}` (customer; approve refunds a price drop, `topup` makes a
fresh Checkout for an unpaid top-up), `versions/[vid]/accept` (provider signs customer-proposed terms). Services:
`src/lib/jobs/{room,steering}-service.ts`; the UI client is `src/lib/jobs/client/room.ts`.

## MCP (`/api/mcp/`)
`route` (JSON-RPC), `[key]` + `[key]/[serverName]` (path-key surfaces), `oauth-source`,
`servers[/…]`, `call`. See [[oauth-mcp]].

## Marketplace (`/api/marketplace/`) & packages
`discover` (GET, API-key), `publish` (POST, API-key), `install` (POST, API-key), `publisher` (GET, Clerk).
`packages` (GET, `POST` admin upload), `packages/[id]` (GET/DELETE/`PATCH` moderate),
`packages/[id]/ratings` (GET/POST, Clerk). See [[marketplace]].

## OAuth (`/api/oauth/`)
`authorize`, `callback`, `exchange`, `token`, `plugin/authorize`, `plugin/verify`. See [[plugin-control-plane]].

## Plugin / dashboard (`/api/plugin/`, `/api/keys/`, `/api/dashboard/`)
`plugin/config`, `plugin/report`, `plugin/query`, `plugin/devices`, `plugin/version`;
`keys/{generate,list,delete}`; `dashboard/activity`, `dashboard/paid-stats`.

## Gigs delivery, disputes, reviews, trust, plan credits (Phase 5)
Contract parties (Clerk session; `x-e2e-user` in tests): `contracts/[id]/delivery` (GET view),
`delivery/download` (GET, customer: the QA'd SHA as .tar.gz, audited), `delivery/push` (POST
`{repo, token}`: empty private repo + fine-grained write PAT), `contracts/[id]/accept` (POST, customer;
pays the provider), `contracts/[id]/dispute` (POST `{category, reason, evidence?}`),
`contracts/[id]/reviews` (GET/POST). Admin (`withQaAdmin`): `admin/disputes` (GET),
`admin/disputes/[id]` (GET), `admin/disputes/[id]/resolve` (POST `{outcome, refund_cents?, note}`).
Cron (`Authorization: Bearer $CRON_SECRET`): `cron/auto-accept`, `cron/trust-decay`, `cron/credit-grants`.
Signed in: `profile/reputation`, `credits/grants`. Public: `trust?principal_ids=` (badges).
Services in `src/lib/{delivery,disputes,reviews,trust,credits}`; pure math in `disputes/amounts.ts`,
`trust/trust-score.ts`, `credits/grants.ts`, `delivery/auto-accept.ts`.

## Crons (`vercel.json`)

The Vercel account is on **Hobby**, which rejects a deploy with any cron that runs more than once a day, so
every cron is daily: `cron/auto-accept`, `cron/trust-decay` and `cron/credit-grants`.

Email has no cron and no poller. `enqueue()` (`src/lib/notify/notify.ts`) sends when the action happens,
inside the request under `waitUntil` (the response isn't blocked), retrying inline after 0.5s, 2s and 5s on
transient errors. If the send still fails, or the provider refuses it, the row is `failed` with `last_error`;
nothing retries it later. The dedupe key keeps a repeated action from sending twice.

All five projects deploy the same `vercel.json`, so each runs every cron. Only the hub serves `/api/cron/*`;
on ai/marketplace/gigs/chat they are outside `SURFACE_API_ALLOWLIST` and middleware answers 404, so those
copies are no-ops. `tests/unit/surface-routing.vitest.ts` checks this (daily schedules, hub-only routes)
against `vercel.json`.

## Admins (`src/lib/admin.ts`)

One rule, and every admin check calls it: the hub admin pages (`/admin/qa`, `/admin/disputes`), the admin
QA MCP (`/api/admin/qa/mcp`), marketplace moderation and package uploads, gigs admin pages, and the
recipients of admin notifications. A user is an admin if any of these holds:

1. **Primary:** one of their **verified** Clerk email addresses is in the seed list in `admin.ts` or in
   `ADMIN_EMAILS` (comma-separated), compared case-insensitively. Unverified addresses never count.
2. **Fallback:** Clerk `publicMetadata.role === 'admin'`. Grant it in the Clerk dashboard → Users → the
   user → Metadata → Public: `{"role":"admin"}`.
3. The Clerk user id is in `ADMIN_USER_IDS` (comma-separated). The gigs e2e runner names its admin this
   way, because the e2e identity header has no Clerk user to look up.

Use `isAdminSubject(user)` for a Clerk user in hand, `isAdminUserId(userId)` to look one up, and `isAdmin()`
for the signed-in user. Admin notification recipients (`adminUserIdsForNotify` in `src/lib/qa/qa-data.ts`)
are the users known from `user_contacts` that match the rule (verified admin email in the contact row, or
role/email from Clerk), plus `ADMIN_USER_IDS`. `tests/unit/admin.vitest.ts` covers the rule.

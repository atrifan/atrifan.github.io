# CLAUDE.md — Tulzo

**Tulzo** is a Next.js 14 workflow-automation platform and the cloud control plane for the "Horia"
browser assistant. Stack: Next.js (App Router), Supabase, Clerk (auth + billing), MCP, Adobe React
Spectrum.

Detailed guidance is split into focused rules under [`.claude/rules/`](.claude/rules/). Each has
frontmatter (`description`, `appliesTo` globs, `alwaysApply`). Read the ones relevant to your task:

| Rule | What it covers |
|------|----------------|
| [architecture](.claude/rules/architecture.md) | Stack, directory layout, path aliases |
| [database](.claude/rules/database.md) | Supabase tables, RLS, marketplace schema, service helpers |
| [coding-standards](.claude/rules/coding-standards.md) | TypeScript conventions, file org, error handling |
| [tdd](.claude/rules/tdd.md) | **Write behavior-only failing tests first, via a QA agent** |
| [testing](.claude/rules/testing.md) | Playwright + axe layout, scripts, auth-in-tests |
| [marketplace](.claude/rules/marketplace.md) | Discover / publish / install — API + MCP contracts, moderation |
| [ai-config](.claude/rules/ai-config.md) | Models, pricing, token budgets, subscription tiers |
| [automation-yaml](.claude/rules/automation-yaml.md) | Workflow YAML schema, step types, execution |
| [oauth-mcp](.claude/rules/oauth-mcp.md) | OAuth flow, MCP tool execution, external MCP surface |
| [plugin-control-plane](.claude/rules/plugin-control-plane.md) | Assistant ↔ Tulzo, API keys, observability |
| [api-routes](.claude/rules/api-routes.md) | API route reference |

## Quick start

Requires **Node.js v24+** (see `.nvmrc`).

```bash
nvm use              # Node v24
npm install
npm run dev          # dev server
npm run build        # production build
npm run type-check   # tsc --noEmit
npm test             # Playwright (see testing rule)
```

## Conventions worth stating up front

- Server-side DB access uses the Supabase service-role key; always filter by `user_id`.
- Reuse `src/lib/` services (`supabase-services.ts`, `marketplace-service.ts`, `admin.ts`) — don't
  re-implement auth/DB access inline.
- Free plan is blocked from API, MCP, and marketplace; paid = Pro or Plus.
- New behavior → write the test first (see the [tdd](.claude/rules/tdd.md) rule).

> Historical sequence diagrams and the full original spec are preserved in git history
> (`git log -- CLAUDE.md`).

---
description: Tulzo tech stack, directory layout, and path aliases
appliesTo: ["**"]
alwaysApply: true
---

# Architecture

**Tulzo** is a workflow-automation platform + cloud control plane for the "Horia" browser assistant.

**Minimum Node.js: v24** (pinned in `.nvmrc` and `package.json` `engines`). Run `nvm use` before working;
`@supabase/supabase-js` and the tooling drop support for Node ≤18.

- **Next.js 14** (App Router)
- **Supabase** (PostgreSQL + Realtime) — server-side uses the service-role key
- **Clerk** (auth + billing)
- **MCP** (Model Context Protocol) for tool execution
- **Adobe React Spectrum** (UI components)

## Directory structure

```
app/                    # Next.js App Router
├── api/                # API routes (ai, mcp, marketplace, oauth, plugin, packages, push, webhooks)
├── (auth)/             # Sign-in / sign-up
├── automation/ chat/ dashboard/   # Pages

src/
├── config/             # ai-tokens.config.ts (⭐ models/pricing), tools-definitions.ts, billing.config.ts
├── lib/                # automation/, mcp-client.ts, supabase-services.ts, marketplace-service.ts, admin.ts
├── views/              # Large page components (ControlPanelPage, AutomationPage, ChatPage, PackageAdminPage)
└── types/supabase.ts   # DB types

supabase/migrations/    # Schema (run in order)
```

Note: `src/views/DashboardPage.tsx` is legacy/orphaned — the live control panel is `src/views/ControlPanelPage.tsx`, mounted at `/dashboard`.

## Path aliases

`"@/*"` → `"./"`. Example: `import { AI_MODELS } from '@/src/config/ai-tokens.config';`

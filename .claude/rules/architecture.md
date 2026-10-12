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
├── api/                # API routes (mcp, marketplace, oauth, plugin, packages, billing, webhooks, …)
├── page.tsx pricing/ sign-in/ sign-up/   # hub pages
├── (ai)/ai/            # the ai. control panel: layout.tsx + [[...tab]]/page.tsx (one URL per section)
├── dashboard/          # /dashboard redirects to the ai surface; admin/packages is the package admin
├── ai/ marketplace/ gigs/ chat/          # surface homes under their prefix (see surfaces-and-design)
├── robots.txt/ sitemap.ts icon.svg opengraph-image.tsx
├── layout.tsx providers.tsx              # no-flash theme script, Clerk + Spectrum + AppShell

src/
├── components/         # shell/AppShell, theme/, brand/ (TulzoMark, SurfaceIcons), AdBanner
├── config/             # ai-tokens.config.ts (⭐ models/pricing), tools-definitions.ts, billing.config.ts
├── lib/                # surface-routing, surface-url, theme, seo, mcp-client, supabase-services, marketplace-service, admin
├── views/              # Page components (HomePage, PricingPage, PackageAdminPage, RemoteChatPage, remote-chat/, ai/ = control panel tabs)
└── types/supabase.ts   # DB types

styles/tokens.css       # design tokens (light/dark); styles/globals.css: reset + shared classes

supabase/migrations/    # Schema (run in order)
```

The control panel is `src/views/ai/*` (one `*Tab.tsx` per section, shared state in `useControlPanelData`), served at `/ai/<section>` (`ai.tulzo.online/<section>`). Views no `app/` page
reaches get deleted, not kept around.

## Path aliases

`"@/*"` → `"./"`. Example: `import { AI_MODELS } from '@/src/config/ai-tokens.config';`

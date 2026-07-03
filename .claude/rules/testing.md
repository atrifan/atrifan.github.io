---
description: Playwright + axe test setup, layout, and how to run
appliesTo: ["tests/**", "playwright.config.ts"]
alwaysApply: false
---

# Testing

Tulzo uses **Playwright** for integration/UI/E2E and **@axe-core/playwright** for accessibility.
(Cypress was removed.)

## Layout

```
playwright.config.ts     # testDir 'tests', auto-starts `npm run dev`, chromium project
tests/
├── fixtures/seed.ts     # seeds a paid api_keys row + a public fixture package; hasSupabaseEnv() guard
├── e2e/                 # API + UI end-to-end (discovery, publish, ratings, marketplace-mcp)
└── a11y/                # axe scans; fails on serious/critical
```

## Scripts

- `npm test` — all Playwright tests
- `npm run test:e2e` — API/UI end-to-end
- `npm run test:a11y` — accessibility scans
- `npm run test:ui` — Playwright UI mode

## Auth in tests

- **API-key routes** (marketplace discover/publish/install, `/api/mcp`) are exercised with a real seeded
  fixture key — no Clerk needed. Specs `test.skip` when `hasSupabaseEnv()` is false.
- **Clerk-gated UI** (dashboard, ratings POST) runs only when `E2E_CLERK_STORAGE_STATE` points at a
  saved Clerk session; otherwise those specs skip. Wiring Clerk test tokens is a followup.

## Accessibility bar

Scans use `wcag2a`/`wcag2aa` tags and fail on any `serious` or `critical` violation. The control-panel
menu is a real ARIA tablist (roles `tablist`/`tab`/`tabpanel`, `aria-selected`, arrow-key navigation).

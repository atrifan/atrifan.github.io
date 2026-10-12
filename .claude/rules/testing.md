---
description: Test suites (node:test, Vitest, Playwright e2e/a11y/visual), layout, and how to run them
appliesTo: ["tests/**", "playwright.config.ts", "vitest*.config.ts", "scripts/test-*.ts"]
alwaysApply: false
---

# Testing

## Suites

| Command | Runner | What |
|---|---|---|
| `npm run test:unit` | node:test, then Vitest | `tests/unit/**/*.test.ts` (node:test), then `tests/unit/**/*.vitest.ts` (Vitest, pure modules: surface routing, surfaceUrl, theme, seo, ads policy, token contrast, Clerk OAuth config) |
| `npm run test:integration` | node:test + Docker | `tests/integration/*.test.ts` against a throwaway Postgres + PostgREST |
| `npm run test:int` | Vitest | `tests/integration/*.vitest.ts`: route handlers called with `Request` objects; DB specs use the Supabase in `.env.local` and skip (with a message) without it |
| `npm run test:e2e:gigs` | Playwright | `tests/e2e/gigs-api.spec.ts` on its own runner (port 3100, Docker DB, fake Stripe) |
| `npm run test:integration:notify` | Playwright | `tests/integration/notify.spec.ts` |
| `npm test` | Playwright | every project below |
| `npm run test:e2e` / `test:a11y` / `test:visual` | Playwright | one folder |

Pick the file suffix by runner: `*.test.ts` node:test, `*.vitest.ts` Vitest, `*.spec.ts` Playwright.

## Playwright projects (`playwright.config.ts`)

- `chromium`: `tests/e2e/**` against :3000 (path-prefix mode, `TULZO_SURFACE` unset).
- `light-desktop`, `light-mobile`, `dark-desktop`, `dark-mobile`: `tests/visual/**` and `tests/a11y/**`
  (`colorScheme` light/dark, 1280x800 and 390x844).
- `surface-ai` (:3001, `TULZO_SURFACE=ai`) and `surface-hub` (:3002, `TULZO_SURFACE=hub`): files named
  `*.surface-ai.spec.ts` / `*.surface-hub.spec.ts`. Both servers use `NEXT_PUBLIC_ROOT_DOMAIN=tulzo.test`
  and their own `NEXT_DIST_DIR`. Assert cross-surface redirects from the `Location` header.
- `integration`: `tests/integration/*.spec.ts`.

Locally the servers are `next dev` (reused if running); in CI the main one is `next start`, so build first.
Page specs block iubenda/analytics/ads (`blockThirdParty` in `tests/e2e/surface-helpers.ts`,
`openSettled` in `tests/support/pages.ts`).

## Visual baselines

`tests/visual/pages.visual.spec.ts` snapshots every page in the four themed projects. Baselines are committed
for darwin (local) and linux (CI). Regenerate linux ones in the Playwright image against a running build:

```bash
npm run build && npx next start -p 3000 -H 0.0.0.0 &
docker run --rm --network host -v "$PWD:$PWD" -w "$PWD" -e PLAYWRIGHT_BASE_URL=http://localhost:3000 \
  mcr.microsoft.com/playwright:v1.61.1-noble npx playwright test tests/visual --update-snapshots \
  --project=light-desktop --project=light-mobile --project=dark-desktop --project=dark-mobile
```

Open every changed image before committing it. Ads and Clerk's dev footer are masked.

## Auth in tests

- **API-key routes** use a real seeded fixture key (`tests/fixtures/seed.ts`); specs skip when
  `hasSupabaseEnv()` is false.
- **Clerk-gated UI** runs only when `E2E_CLERK_STORAGE_STATE` points at a saved Clerk session. Signed out,
  `/chat`, `/dashboard` and `/ai` are checked as the sign-in page they redirect to. Signed-in specs use
  `storageStatePath('customer')` (the `setup` project saves it; one context per role, never signed out).
- **ai. panel** specs mock the extension with `tests/support/mock-bridge.ts` and the server with
  `tests/support/ai-fixtures.ts`; the opt-in `live-extension` project runs `tests/live/` against the real
  extension (see [[plugin-control-plane]]).

## Accessibility bar

axe with `wcag2a`/`wcag2aa` on every page in both themes and both viewports; any `serious` or `critical`
violation fails. No horizontal scroll at 390px.

## Mutation testing

Stryker on the pure modules, with config and output outside the repo (`/tmp/mutants-tulzo-<task>/`); see the
global mutation rule. Kill survivors with tests or explain them as equivalent.

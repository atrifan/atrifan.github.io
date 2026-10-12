---
description: Surfaces (TULZO_SURFACE routing, surfaceUrl), the AppShell, design tokens, theme, brand icons and ads
appliesTo: ["app/**", "src/components/**", "src/views/**", "src/lib/surface-*.ts", "src/lib/theme.ts", "src/lib/ads-policy.ts", "src/lib/seo.ts", "middleware.ts", "styles/**"]
alwaysApply: false
---

# Surfaces and design system

## Surfaces

One build, five Vercel projects. `TULZO_SURFACE` (per project) is `hub | ai | marketplace | gigs | chat`.
Unset (localhost, previews) is **path-prefix mode**: every surface is served by one deploy, the hub at `/`,
the others under `/ai`, `/marketplace`, `/gigs`, `/chat`.

- `src/lib/surface-url.ts`: `surfaceUrl(surface, path)` builds every cross-surface link. With
  `NEXT_PUBLIC_ROOT_DOMAIN=tulzo.online` it gives `https://ai.tulzo.online/keys`; unset, `/ai/keys`.
  Never hard-code a surface host or prefix. `absoluteSurfaceUrl()` (`src/lib/site-url.ts`) is the same but
  always absolute (metadataBase, robots, sitemap).
- `src/lib/surface-routing.ts` (pure, used by `middleware.ts`): `resolveSurface()` (throws on an unknown
  value), `routeRequest({ surface, pathname })` → `next | rewrite | redirect (308) | notFound`,
  `isProtectedPath()`, `activeSurface()`, and `SURFACE_API_ALLOWLIST`.
  - hub: its root pages and **every** `/api/*` (the assistant calls `/api/verify`, `/api/plugin/*`,
    `/api/chat`, `/api/oauth/plugin/*` on the hub). Other prefixes 404; `/dashboard[/*]` 308s to ai.
  - other surfaces: `/x` is rewritten to `/<surface>/x`; `/<surface>/x` 308s to `/x`; other prefixes and hub
    pages 404; `/sign-in`, `/sign-up` 308 to the hub; `/api/*` only if listed in `SURFACE_API_ALLOWLIST`.
  - `/_next/*`, `/.well-known/*` and root files with an extension always pass.
  - Surface mode needs `NEXT_PUBLIC_ROOT_DOMAIN`; don't set `TULZO_SURFACE` on the live `tulzo` project until
    the other projects exist.

### Domains

The hub is the apex (`surfaceUrl('hub')` is `https://tulzo.online/...`, never `www`). `www.<root>` is
redirected (308, path and query kept) by `middleware.ts` through `wwwRedirect()` in `surface-routing.ts`,
not by `vercel.json` or Vercel's domain settings: attach `www.tulzo.online` to the `tulzo` project and keep
the apex as the primary domain (no "redirect to www").

### Hub pages

`app/(hub)/`: `/` (Organization JSON-LD), `/pricing` (plan table from `src/lib/plan-catalog.ts`, Clerk
`PricingTable` for signed-in users), `/docs`, `/legal`, and the signed-in `/profile` (Clerk identity, Stripe
Connect card, email notification switches), `/profile/account` (Clerk `UserProfile`), `/credits` (balance,
top-ups via `/api/billing/checkout`, history) and `/admin/qa` (admins; `app/api/admin/qa/*` over
`src/lib/qa/qa-review-service.ts`). Signed-in and admin pages are `noindex`. Views are in `src/views/hub/`,
styles in `styles/hub.css`.

### Consent

`app/layout.tsx` boots iubenda with `iubendaConfig()` (`src/lib/consent.ts`): a bottom bar, no overlay, the
surface domain as owner. The iubenda dashboard config still applies where we don't override it (TCF text).
`ConsentScripts` loads GA after measurement consent and AdSense after marketing consent; `AdBanner` only fills
its slot after consent. The footer's "Cookie settings" reopens the preferences.

### Adding a page to a surface

Pages of a non-hub surface live under its prefix folder, so the same file works in both modes:
`app/ai/keys/page.tsx` is `/ai/keys` locally and `ai.tulzo.online/keys` in surface mode. Later tracks move
them into route groups **keeping the prefix folder**: `app/(ai)/ai/...`, `app/(gigs)/gigs/...`,
`app/(marketplace)/marketplace/...`, `app/(chat)/chat/...`; hub pages go to `app/(hub)/...` at the root.
A new page that needs sign-in: add its prefix to `PROTECTED_PREFIXES` in `surface-routing.ts` (+ a unit
test). A new API route a surface's pages call: add it to that surface's `SURFACE_API_ALLOWLIST` entry.
A new hub-only page: add it to `HUB_ONLY_PREFIXES` so other surfaces 404 it. Public pages go into
`PUBLIC_PAGES` in `src/lib/seo.ts` (sitemap).

## Shell

`src/components/shell/AppShell.tsx` wraps every page (from `app/providers.tsx`): skip link → `#main`,
wordmark, `nav[aria-label=Primary]` (AI · Marketplace · Gigs · Chat via `surfaceUrl`, `aria-current="page"`
on the active surface), `ThemeToggle`, Sign in or the Clerk `UserButton` (Profile, Credits on the hub), the
`<main id="main">`, and the footer. Below 960px nav and tools fold into a "Menu" panel (focus trap, Escape
closes). Pages render content only: no `<main>`, header or footer of their own. Touch targets ≥ 44px.

## Tokens and theme

`styles/tokens.css` defines one set of names for `[data-theme=light]` and `[data-theme=dark]`
(and `prefers-color-scheme` when no theme is set):

- colour: `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-text`,
  `--color-text-muted`, `--color-accent`, `--color-accent-contrast` (text on accent), `--color-accent-soft`,
  `--color-success`, `--color-warning`, `--color-danger`, `--color-focus-ring`
- `--radius-{sm,md,lg,full}`, `--space-1`…`--space-8`, `--font-sans`, `--font-mono`, `--text-{xs…3xl}`,
  `--shadow-{sm,md}`, `--container-max`, `--header-height`, `--touch-target`

Use tokens, never hex values. `tests/unit/tokens-contrast.test.ts` checks every text colour against every
background at WCAG AA. Shared classes (`.page`, `.hero`, `.btn`, `.btn-primary`, `.card`, …) are in
`styles/globals.css`.

Theme: `src/lib/theme.ts` (choice light/dark/system in localStorage `tulzo-theme`), the no-flash inline
script in `app/layout.tsx`, `ThemeProvider` / `useTheme()` and `ThemeToggle` in `src/components/theme/`.
The resolved scheme drives the Spectrum `Provider colorScheme` and Clerk `appearance` in `app/providers.tsx`.
The control panel and package admin are still dark-only (`.dark-island`) until their tracks restyle them.
The chat (`app/(chat)/chat`, `src/views/remote-chat/`) follows the theme: `ChatApp.css` for its layout,
`RemoteChat.css` (tokens only) for the ported panel components.

## Brand

`src/components/brand/TulzoMark.tsx` (the line-art robot) and `SurfaceIcons.tsx` (`AiIcon`, `MarketIcon`,
`GigsIcon`, `ChatIcon`, `SURFACE_ICON`): `currentColor`, non-scaling stroke, `size` and `title` props
(decorative without `title`). `app/icon.svg` and `app/opengraph-image.tsx` use the same mark.

## Ads

At most one small footer `AdBanner` (lazy, ≤ 100px), only to signed-out users on public pages, decided by
`footerAdAllowed()` in `src/lib/ads-policy.ts`. No other ad placements.

---
description: Surfaces (host/path routing, TULZO_ROUTING, TULZO_LINKS, surfaceUrl), the AppShell, design tokens, theme, brand icons and ads
appliesTo: ["app/**", "src/components/**", "src/views/**", "src/lib/surface-*.ts", "src/lib/theme.ts", "src/lib/ads-policy.ts", "src/lib/seo.ts", "middleware.ts", "styles/**"]
alwaysApply: false
---

# Surfaces and design system

## Surfaces

One build, one Vercel project (`tulzo`) holding every domain: `tulzo.online`, `www.`, `ai.`, `marketplace.`,
`gigs.`, `jobs.` and `chat.tulzo.online`. The surface (`hub | ai | marketplace | gigs | chat`) is decided per
request by `middleware.ts`:

- `TULZO_ROUTING=path` (default): **path-prefix mode** on every host. The hub at `/`, the others under `/ai`,
  `/marketplace`, `/gigs`, `/chat`.
- `TULZO_ROUTING=hybrid`: the surface comes from the `Host` header (`x-forwarded-host` only without one) and
  `NEXT_PUBLIC_ROOT_DOMAIN`. `ai.|marketplace.|gigs.|chat.<root>` serve that surface at their root
  (`ai.tulzo.online/usage` is `/ai/usage` inside); `jobs.<root>` 308s to `gigs.<root>` (path and query kept);
  `www.<root>` 308s to the apex. The apex, `*.vercel.app`, `localhost` and unknown subdomains stay in path mode.
- `TULZO_SURFACE` (unset in every deploy) forces one surface on every host. Only the `surface-ai` / `surface-hub`
  Playwright servers use it.
- `TULZO_LINKS=path|host` (default `path`, inlined at build by `next.config.mjs`) only decides where links point:
  `path` keeps every link on the apex (`https://tulzo.online/ai/keys`), `host` uses the subdomains
  (`https://ai.tulzo.online/keys`). Without `NEXT_PUBLIC_ROOT_DOMAIN` both give `/ai/keys`.

Middleware passes the resolved surface to pages and route handlers in the `x-tulzo-surface` request header
(`path` in path mode) and always overwrites a client-sent one. Server code reads it with `requestSurface()`
(`src/lib/request-surface.ts`): the root layout (`metadataBase`, the AppShell's `aria-current` and ad policy), the
ai. and gigs. link bases, robots.txt and the sitemap. Never read `TULZO_SURFACE` directly. In path mode (or with
`TULZO_SURFACE`) it does not read the header, so `/`, `/docs`, `/pricing` and robots.txt stay prerendered; in
hybrid mode every page is rendered per request.

- `src/lib/surface-url.ts`: `surfaceUrl(surface, path)` builds every cross-surface link (see `TULZO_LINKS`).
  Never hard-code a surface host or prefix. `absoluteSurfaceUrl()` (`src/lib/site-url.ts`) is the same but
  always absolute (canonicals, robots, sitemap); without a root domain it uses the deploy's own origin.
- `src/lib/surface-routing.ts` (pure, used by `middleware.ts`): `resolveRoutingMode()`, `resolveLinkMode()`,
  `resolveSurface()` (all throw on an unknown value), `requestHost()`, `surfaceFromHost()`,
  `resolveRequestSurface()`, `withSurfaceHeader()`, `routeRequest({ surface, pathname })` →
  `next | rewrite | redirect (308) | notFound`, `isProtectedPath()`, `activeSurface()`, and `SURFACE_API_ALLOWLIST`.
  - hub (only with `TULZO_SURFACE=hub`): its root pages and **every** `/api/*`. Other prefixes 404;
    `/dashboard[/*]` 308s to ai.
  - other surfaces: `/x` is rewritten to `/<surface>/x`; `/<surface>/x` 308s to `/x`; other prefixes and hub
    pages 404; `/sign-in`, `/sign-up` 308 to the hub; `/api/*` only if listed in `SURFACE_API_ALLOWLIST`.
  - path mode serves everything, including every `/api/*` (the assistant calls `/api/verify`, `/api/plugin/*`,
    `/api/chat`, `/api/oauth/plugin/*` on the apex).
  - `/_next/*`, `/.well-known/*` and root files with an extension always pass.
- robots.txt and sitemap.xml (`src/lib/seo.ts`): a surface subdomain describes only itself, with absolute URLs on
  its own host (ai. is closed); path mode has one sitemap on the apex covering every prefix.

### Current deployment: hybrid routing, path links (Clerk development instance)

Clerk's development instance keeps a session per host, so signing in on tulzo.online didn't carry over to
ai.tulzo.online (measured on the live site, 2026-10-12). So for now the `tulzo` project runs
`TULZO_ROUTING=hybrid`, `TULZO_LINKS=path` and `NEXT_PUBLIC_ROOT_DOMAIN=tulzo.online` (Production only, so
previews keep relative links), and `vercel.json` `redirects` still send `ai|marketplace|gigs|chat.tulzo.online/x`
to `tulzo.online/<surface>/x` (307), `/api/*` on those hosts to `tulzo.online/api/*`, `jobs.` to `/gigs` and
`www.` to the apex (308). Vercel applies those redirects before the middleware, so every page is served from the
apex in path mode. `tests/unit/vercel-path-mode.test.ts` pins the redirects and this section.

After Clerk is on its production keys (pk_live + sk_live), switching to real subdomains is:

1. set `TULZO_LINKS=host` on `tulzo` (keep `TULZO_ROUTING=hybrid` and `NEXT_PUBLIC_ROOT_DOMAIN=tulzo.online`);
2. delete the host `redirects` in `vercel.json` except `www`, and update `tests/unit/vercel-path-mode.test.ts`;
3. redeploy (`TULZO_LINKS` is inlined at build time).

The apex keeps serving every prefix; links and canonicals then point at the subdomains.

### Domains

The hub is the apex (`surfaceUrl('hub')` is `https://tulzo.online/...`, never `www`). `www.<root>` is
redirected (308, path and query kept) by `middleware.ts` through `wwwRedirect()` in `surface-routing.ts`,
not by `vercel.json` or Vercel's domain settings: attach `www.tulzo.online` to the `tulzo` project and keep
the apex as the primary domain (no "redirect to www").

### Hub pages

`app/(hub)/`: `/` (Organization JSON-LD), `/pricing` (plan table from `src/lib/plan-catalog.ts`, Clerk
`PricingTable` for signed-in users), `/docs`, `/legal` with `/legal/{terms,payments,disclaimers,acceptable-use,marketplace-publishers,complaints,imprint}`
(`app/(hub)/legal/[slug]`, text in `src/views/legal/content/`, numbers from `src/lib/legal/facts.ts`), and the signed-in `/profile` (Clerk identity, Stripe
Connect card, email notification switches), `/profile/account` (Clerk `UserProfile`), `/credits` (balance,
top-ups via `/api/billing/checkout`, history) and `/admin/qa` (admins; `app/api/admin/qa/*` over
`src/lib/qa/qa-review-service.ts`) and `/admin/inbox` (complaints + support email; `/admin/complaints` redirects to it). Signed-in and admin pages are `noindex`. Views are in `src/views/hub/`,
styles in `styles/hub.css`.

### Consent

`app/layout.tsx` boots iubenda with `iubendaConfig()` (`src/lib/consent.ts`): a bottom bar, no overlay, the
surface domain as owner. The iubenda dashboard config still applies where we don't override it (TCF text).
`ConsentScripts` loads GA after measurement consent and AdSense after marketing consent; `AdBanner` only fills
its slot after consent. The footer's "Cookie settings" reopens the preferences.

### Adding a page to a surface

Pages of a non-hub surface live under its prefix folder, so the same file works in both modes:
`app/ai/keys/page.tsx` is `/ai/keys` in path mode and `ai.tulzo.online/keys` on the ai. host. Later tracks move
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
The ai. control panel and the chat (`app/(chat)/chat`, `src/views/remote-chat/`) follow the theme: `ChatApp.css`
for the chat layout, `RemoteChat.css` (tokens only) for the ported panel components. Package admin is still dark-only
(`.dark-island`) until it is restyled.

## Brand

`src/components/brand/TulzoMark.tsx` (the line-art robot) and `SurfaceIcons.tsx` (`AiIcon`, `MarketIcon`,
`GigsIcon`, `ChatIcon`, `SURFACE_ICON`): `currentColor`, non-scaling stroke, `size` and `title` props
(decorative without `title`). `app/icon.svg` and `app/opengraph-image.tsx` use the same mark.

## Ads

At most one small footer `AdBanner` (lazy, ≤ 100px), only to signed-out users on public pages, decided by
`footerAdAllowed()` in `src/lib/ads-policy.ts`. No other ad placements.

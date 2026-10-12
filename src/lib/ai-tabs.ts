/**
 * The sections of the ai. control panel, one URL each (`/ai/<slug>` locally, `ai.tulzo.online/<slug>`).
 * Pure: used by the route (metadata, 404) and the client nav.
 */

export interface AiTab {
  /** '' is the Overview at the surface root. */
  slug: string;
  /** Nav label and page title. */
  label: string;
  /** The page's h1. */
  heading: string;
  /** Needs the Tex extension (device-backed). */
  device: boolean;
}

export const AI_TABS: readonly AiTab[] = [
  { slug: '', label: 'Overview', heading: 'Overview', device: false },
  { slug: 'devices', label: 'Devices', heading: 'Devices and API keys', device: false },
  { slug: 'usage', label: 'Usage', heading: 'Usage', device: false },
  { slug: 'logs', label: 'Logs', heading: 'Logs', device: false },
  { slug: 'packages', label: 'Packages', heading: 'Packages and skills', device: true },
  { slug: 'mcp', label: 'MCP servers', heading: 'MCP servers', device: true },
  { slug: 'schedules', label: 'Schedules', heading: 'Schedules', device: true },
  { slug: 'secrets', label: 'Secrets', heading: 'Secrets', device: true },
  { slug: 'allowlist', label: 'Allowlist', heading: 'Site allowlist', device: true },
  { slug: 'a2a', label: 'A2A peers', heading: 'A2A peers', device: true },
  { slug: 'fleet', label: 'Fleet', heading: 'Fleet', device: true },
  { slug: 'notifications', label: 'Notifications', heading: 'Notifications', device: true },
  { slug: 'providers', label: 'Providers', heading: 'Providers', device: true },
  { slug: 'docs', label: 'Docs', heading: 'Docs', device: false },
];

/** The tab for the optional catch-all `[[...tab]]` segments, or null (→ 404). */
export function findTab(segments: readonly string[] | undefined): AiTab | null {
  if (!segments || segments.length === 0) return AI_TABS[0];
  if (segments.length > 1 || segments[0] === '') return null;
  return AI_TABS.find((t) => t.slug === segments[0]) ?? null;
}

/**
 * Link to a section from inside the ai. surface. `base` is '/ai' in path-prefix mode and '' on the ai. host
 * (where the middleware rewrites `/x` to `/ai/x`), so the link stays on this origin and navigates client-side.
 */
export function tabHref(tab: AiTab, base: string): string {
  if (!tab.slug) return base || '/';
  return `${base}/${tab.slug}`;
}

/** The section a browser path shows, for either URL form; null when it is not one. */
export function tabFromPathname(pathname: string, base: string): AiTab | null {
  // With base '' every path starts with '/', so the prefix check holds and nothing is sliced off.
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const segments = pathname.slice(base.length).split('/').filter(Boolean);
  return findTab(segments);
}

export function tabTitle(tab: AiTab): string {
  return `${tab.label} · AI · Tulzo`;
}

/**
 * Marketplace package kinds, categories and tag/slug normalisation. Pure: used by the service,
 * the MCP tools, the HTTP routes and the pages.
 */

/** Every value of packages.type (20261205 migration). `practitioner` is legacy. */
export const PACKAGE_KINDS = ['plugin', 'skill', 'practitioner', 'mcp', 'a2a', 'subagent', 'workflow'] as const;
export type PackageKind = (typeof PACKAGE_KINDS)[number];

const LABELS: Record<PackageKind, { label: string; plural: string }> = {
  mcp: { label: 'MCP server', plural: 'MCP servers' },
  skill: { label: 'Skill', plural: 'Skills' },
  plugin: { label: 'Plugin', plural: 'Plugins' },
  a2a: { label: 'A2A agent', plural: 'A2A agents' },
  subagent: { label: 'Sub-agent', plural: 'Sub-agents' },
  workflow: { label: 'Workflow', plural: 'Workflows' },
  practitioner: { label: 'Practitioner', plural: 'Practitioners' },
};

/** The kinds the catalog filters by, in display order. */
export const CATALOG_KINDS: ReadonlyArray<{ kind: PackageKind; label: string; plural: string }> = (
  ['mcp', 'skill', 'plugin', 'a2a', 'subagent', 'workflow'] as const
).map((kind) => ({ kind, ...LABELS[kind] }));

export function isPackageKind(value: unknown): value is PackageKind {
  return (PACKAGE_KINDS as readonly unknown[]).includes(value);
}

export function kindLabel(kind: PackageKind): string {
  return LABELS[kind].label;
}

/** How the assistant installs a kind: from a zip, or from an MCP / A2A config. */
export function installMode(kind: PackageKind): 'archive' | 'mcp' | 'a2a' {
  if (kind === 'mcp' || kind === 'a2a') return kind;
  return 'archive';
}

/** The catalog wire `kind` (the assistant spells sub-agents with a hyphen). */
export function wireKind(kind: PackageKind): string {
  return kind === 'subagent' ? 'sub-agent' : kind;
}

export const CATEGORIES = [
  { slug: 'developer-tools', label: 'Developer tools' },
  { slug: 'productivity', label: 'Productivity' },
  { slug: 'communication', label: 'Communication' },
  { slug: 'data', label: 'Data' },
  { slug: 'research', label: 'Research' },
  { slug: 'design', label: 'Design' },
  { slug: 'security', label: 'Security' },
  { slug: 'other', label: 'Other' },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

export function isCategory(value: unknown): value is CategorySlug {
  return CATEGORIES.some((c) => c.slug === value);
}

export function categoryLabel(slug: string | null | undefined): string | null {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? null;
}

/** Lower-case ASCII slug: `GitHub Tools` → `github-tools`. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 32;

/** Tags from a comma list or an array: slugged, deduped, at most 8 of at most 32 characters. */
export function normalizeTags(input: unknown): string[] {
  const raw = typeof input === 'string' ? input.split(',') : Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = slugify(item).slice(0, MAX_TAG_LENGTH);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

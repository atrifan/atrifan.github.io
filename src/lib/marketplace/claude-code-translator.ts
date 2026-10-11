/**
 * Claude Code plugin / skill / agent → Tulzo package, server side (assistant
 * docs/plans/tulzo-marketplace-and-claude-integration.md, Wave D). Pure apart from node:crypto.
 *
 * Input is the upstream file tree as a path → text map:
 * - `plugin`: a plugin root (`.claude-plugin/plugin.json`, `skills/<name>/SKILL.md` + its files,
 *   `agents/<name>.md`, `commands/`, `hooks/`, `.mcp.json`, README/LICENSE)
 * - `skill`: a skill directory (`SKILL.md` + its files)
 * - `agent`: one agent file (`<name>.md`)
 *
 * Output is an assistant-shaped package (PLUGIN.md / SKILL.md / SUBAGENT.md frontmatter with
 * `translated_from: claude-code:<upstreamId>`), its files_hash, and a report: what was translated,
 * what was refused and why, and warnings. A skill or agent that uses a Claude Code tool with no
 * assistant equivalent is refused as a whole; commands, hooks and bundled MCP servers are refused;
 * nothing is dropped silently. If nothing translatable is left the result is `ok: false`.
 */
import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { normalizeTags, slugify } from './kinds';

export interface ClaudeCodeSource {
  /** Upstream id, e.g. the plugin name in the Claude Code marketplace (`feature-dev`). */
  upstreamId: string;
  kind: 'plugin' | 'skill' | 'agent';
  files: Record<string, string>;
}

export interface TranslatedPackage {
  id: string;
  name: string;
  description: string;
  type: 'plugin' | 'skill' | 'subagent';
  version: string;
  tags: string[];
  provenance: { translated_from: string };
  files: Record<string, string>;
  files_hash: string;
}

export interface TranslationReport {
  translated: string[];
  refused: Array<{ path: string; reason: string }>;
  warnings: Array<{ path: string; message: string }>;
}

export interface TranslationResult {
  ok: boolean;
  package?: TranslatedPackage;
  report: TranslationReport;
}

/**
 * Claude Code tool → assistant actions. `null` means no equivalent: an artifact that needs it is
 * refused. MCP tools (`mcp__<server>__<tool>`) are handled separately (MCP_CALL).
 */
export const CLAUDE_TOOL_MAP: Readonly<Record<string, readonly string[] | null>> = {
  Read: ['FS_READ_FILE'],
  Write: ['FS_WRITE_FILE', 'FS_CREATE_DIR'],
  Edit: ['FS_READ_FILE', 'FS_WRITE_FILE'],
  MultiEdit: ['FS_READ_FILE', 'FS_WRITE_FILE'],
  Glob: ['FS_FIND'],
  Grep: ['FS_FIND'],
  LS: ['FS_LIST_DIR'],
  Bash: ['CLI_EXEC'],
  WebFetch: ['HTTP_REQUEST'],
  WebSearch: ['NAVIGATE', 'GET_TEXT'],
  TodoWrite: null,
  BashOutput: null,
  KillShell: null,
  NotebookEdit: null,
  NotebookRead: null,
  Task: null,
  ExitPlanMode: null,
  SlashCommand: null,
};

const MODEL_ROLES: Readonly<Record<string, string | null>> = {
  opus: 'orchestrator',
  sonnet: 'orchestrator',
  haiku: 'profile',
  inherit: null,
};

export function parseFrontmatter(text: string): { data: Record<string, unknown> | null; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: null, body: text };
  try {
    const data = parseYaml(m[1]);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { data: null, body: text };
    return { data: data as Record<string, unknown>, body: text.slice(m[0].length) };
  } catch {
    return { data: null, body: text };
  }
}

export function mapClaudeTools(value: unknown): { tools: string[]; unsupported: string[]; mcp: string[] } {
  const list =
    typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
  const tools = new Set<string>();
  const unsupported: string[] = [];
  const mcp = new Set<string>();
  for (const raw of list as string[]) {
    // `Bash(git:*)` scopes a tool; the tool name is what maps.
    const name = raw.trim().replace(/\(.*$/, '');
    if (!name) continue;
    const mcpMatch = /^mcp__([^_]+(?:_[^_]+)*?)__/.exec(name);
    if (mcpMatch) {
      tools.add('MCP_CALL');
      mcp.add(mcpMatch[1]);
      continue;
    }
    const mapped = CLAUDE_TOOL_MAP[name];
    if (!mapped) unsupported.push(name);
    else mapped.forEach((t) => tools.add(t));
  }
  return { tools: [...tools].sort(), unsupported, mcp: [...mcp].sort() };
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function withFrontmatter(data: Record<string, unknown>, body: string): string {
  return `---\n${stringifyYaml(data).trimEnd()}\n---\n\n${body.replace(/^\s+/, '')}`;
}

function filesHash(files: Record<string, string>): string {
  const h = createHash('sha256');
  for (const p of Object.keys(files).sort()) h.update(`${p}\0${files[p]}\0`);
  return `sha256:${h.digest('hex')}`;
}

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const PASSTHROUGH = /^(README|LICENSE|CHANGELOG)(\.md|\.txt)?$/i;

interface Ctx {
  provenance: string;
  report: TranslationReport;
}

/** One SKILL.md or agent file → assistant frontmatter + body, or null when refused. */
function translateArtifact(
  ctx: Ctx,
  path: string,
  text: string,
  kind: 'skill' | 'agent',
  idOverride?: string,
): { id: string; text: string } | null {
  const { data, body } = parseFrontmatter(text);
  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  const description = typeof data?.description === 'string' ? data.description.trim() : '';
  if (!data || !name || !description) {
    ctx.report.refused.push({ path, reason: 'Missing frontmatter name or description' });
    return null;
  }
  const mapped = mapClaudeTools(kind === 'skill' ? data['allowed-tools'] : data.tools);
  if (mapped.unsupported.length) {
    ctx.report.refused.push({
      path,
      reason: `Uses Claude Code tools with no assistant equivalent: ${mapped.unsupported.join(', ')}`,
    });
    return null;
  }
  if (mapped.mcp.length) {
    ctx.report.warnings.push({ path, message: `Needs MCP servers installed separately: ${mapped.mcp.join(', ')}` });
  }
  if (body.includes('${CLAUDE_PLUGIN_ROOT}')) {
    ctx.report.warnings.push({ path, message: 'References ${CLAUDE_PLUGIN_ROOT}; paths may need review' });
  }
  const id = idOverride ?? (slugify(name) || slugify(path));
  const out: Record<string, unknown> = { id, name: titleCase(name), description };
  if (kind === 'agent' && typeof data.model === 'string') {
    const role = MODEL_ROLES[data.model];
    if (role) out.model_role = role;
    else if (role === undefined) {
      ctx.report.warnings.push({ path, message: `Unknown model "${data.model}"; the sub-agent follows the main model` });
    }
  }
  if (mapped.tools.length) out.tools = mapped.tools;
  out.translated_from = ctx.provenance;
  ctx.report.translated.push(path);
  return { id, text: withFrontmatter(out, body) };
}

function result(
  ctx: Ctx,
  pkg: Omit<TranslatedPackage, 'files_hash' | 'provenance'> | null,
): TranslationResult {
  if (!pkg) return { ok: false, report: ctx.report };
  return {
    ok: true,
    package: { ...pkg, provenance: { translated_from: ctx.provenance }, files_hash: filesHash(pkg.files) },
    report: ctx.report,
  };
}

function translatePlugin(ctx: Ctx, source: ClaudeCodeSource): TranslationResult {
  const manifestPath = '.claude-plugin/plugin.json';
  let manifest: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(source.files[manifestPath] ?? '');
    if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string' && parsed.name.trim()) manifest = parsed;
  } catch {
    manifest = null;
  }
  if (!manifest) {
    ctx.report.refused.push({ path: manifestPath, reason: 'Missing or invalid plugin manifest' });
    return result(ctx, null);
  }
  const slug = slugify(manifest.name as string);
  const id = `cc-${slug}`;
  let version = typeof manifest.version === 'string' ? manifest.version : '1.0.0';
  if (!SEMVER.test(version)) {
    ctx.report.warnings.push({ path: manifestPath, message: `Version "${version}" is not semver; using 1.0.0` });
    version = '1.0.0';
  }
  const name = titleCase(slug);
  const description = typeof manifest.description === 'string' ? manifest.description : '';
  const files: Record<string, string> = {};
  let artifacts = 0;

  const paths = Object.keys(source.files).filter((p) => p !== manifestPath).sort();
  const skillDirs = new Map<string, string>(); // upstream skill dir -> emitted skill dir (or '' when refused)
  for (const p of paths.filter((x) => /^skills\/[^/]+\/SKILL\.md$/.test(x))) {
    const dir = p.slice(0, -'/SKILL.md'.length);
    const t = translateArtifact(ctx, p, source.files[p], 'skill');
    skillDirs.set(dir, t ? `skills/${t.id}` : '');
    if (t) {
      files[`skills/${t.id}/SKILL.md`] = t.text;
      artifacts++;
    }
  }
  for (const p of paths) {
    if (/^skills\/[^/]+\/SKILL\.md$/.test(p)) continue;
    const skillDir = /^(skills\/[^/]+)\//.exec(p)?.[1];
    if (skillDir && skillDirs.has(skillDir)) {
      const target = skillDirs.get(skillDir);
      if (target && /\.(md|txt|json|ya?ml)$/i.test(p)) files[target + p.slice(skillDir.length)] = source.files[p];
      else if (target) ctx.report.refused.push({ path: p, reason: 'Unsupported file' });
      continue;
    }
    if (/^agents\/[^/]+\.md$/.test(p)) {
      const t = translateArtifact(ctx, p, source.files[p], 'agent');
      if (t) {
        files[`sub-agents/${t.id}/SUBAGENT.md`] = t.text;
        artifacts++;
      }
    } else if (p.startsWith('commands/')) {
      ctx.report.refused.push({ path: p, reason: 'Slash commands have no assistant equivalent' });
    } else if (p.startsWith('hooks/')) {
      ctx.report.refused.push({ path: p, reason: 'Hooks are not supported' });
    } else if (p === '.mcp.json') {
      ctx.report.refused.push({ path: p, reason: 'Bundled MCP servers must be published as separate MCP server packages' });
    } else if (PASSTHROUGH.test(p)) {
      files[p] = source.files[p];
    } else {
      ctx.report.refused.push({ path: p, reason: 'Unsupported file' });
    }
  }
  if (artifacts === 0) {
    ctx.report.refused.push({ path: '.', reason: 'Nothing in this plugin could be translated' });
    return result(ctx, null);
  }
  files['PLUGIN.md'] = withFrontmatter(
    { id, name, version, description, translated_from: ctx.provenance },
    `# ${name}\n\n${description}\n`,
  );
  return result(ctx, {
    id,
    name,
    description,
    type: 'plugin',
    version,
    tags: normalizeTags([...(Array.isArray(manifest.keywords) ? manifest.keywords : []), 'claude-code']),
    files,
  });
}

function translateSkill(ctx: Ctx, source: ClaudeCodeSource): TranslationResult {
  const text = source.files['SKILL.md'];
  if (text === undefined) {
    ctx.report.refused.push({ path: 'SKILL.md', reason: 'Missing SKILL.md' });
    return result(ctx, null);
  }
  const id = `cc-${slugify(source.upstreamId)}`;
  const t = translateArtifact(ctx, 'SKILL.md', text, 'skill', id);
  if (!t) return result(ctx, null);
  const files: Record<string, string> = { 'SKILL.md': t.text };
  for (const p of Object.keys(source.files).sort()) {
    if (p === 'SKILL.md') continue;
    if (/\.(md|txt|json|ya?ml)$/i.test(p)) files[p] = source.files[p];
    else ctx.report.refused.push({ path: p, reason: 'Unsupported file' });
  }
  const { data } = parseFrontmatter(text);
  return result(ctx, {
    id,
    name: titleCase(String(data!.name)),
    description: String(data!.description).trim(),
    type: 'skill',
    version: '1.0.0',
    tags: ['claude-code'],
    files,
  });
}

function translateAgent(ctx: Ctx, source: ClaudeCodeSource): TranslationResult {
  const paths = Object.keys(source.files).filter((p) => p.endsWith('.md'));
  if (paths.length !== 1) {
    ctx.report.refused.push({ path: '.', reason: 'Expected exactly one agent file' });
    return result(ctx, null);
  }
  const id = `cc-${slugify(source.upstreamId)}`;
  const t = translateArtifact(ctx, paths[0], source.files[paths[0]], 'agent', id);
  if (!t) return result(ctx, null);
  const { data } = parseFrontmatter(source.files[paths[0]]);
  return result(ctx, {
    id,
    name: titleCase(String(data!.name)),
    description: String(data!.description).trim(),
    type: 'subagent',
    version: '1.0.0',
    tags: ['claude-code'],
    files: { 'SUBAGENT.md': t.text },
  });
}

export function translateClaudeCode(source: ClaudeCodeSource): TranslationResult {
  const ctx: Ctx = {
    provenance: `claude-code:${source.upstreamId}`,
    report: { translated: [], refused: [], warnings: [] },
  };
  if (source.kind === 'plugin') return translatePlugin(ctx, source);
  if (source.kind === 'skill') return translateSkill(ctx, source);
  return translateAgent(ctx, source);
}

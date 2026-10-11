import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  CLAUDE_TOOL_MAP,
  mapClaudeTools,
  parseFrontmatter,
  translateClaudeCode,
} from '@/src/lib/marketplace/claude-code-translator';

function fm(text: string): Record<string, unknown> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error(`no frontmatter in:\n${text}`);
  return parseYaml(m[1]) as Record<string, unknown>;
}

const PLUGIN_JSON = JSON.stringify({
  name: 'feature-dev',
  version: '1.2.0',
  description: 'Guided feature development',
  keywords: ['Dev', 'workflow'],
});

const SKILL_MD = `---
name: code-explorer
description: Explore a codebase before changing it
allowed-tools: Read, Grep, Glob
---

# Explore

Read the code first.
`;

const AGENT_MD = `---
name: code-architect
description: Designs the change
tools: Read, Write, Bash, WebFetch
model: sonnet
---
You design features.
`;

const TODO_AGENT_MD = `---
name: planner
description: Plans with a todo list
tools: Read, TodoWrite
---
Plan it.
`;

describe('parseFrontmatter', () => {
  it('splits YAML frontmatter from the body', () => {
    expect(parseFrontmatter('---\nname: a\ndescription: b\n---\nBody\n')).toEqual({
      data: { name: 'a', description: 'b' },
      body: 'Body\n',
    });
  });

  it('treats a file without frontmatter, or with broken YAML, as having none', () => {
    expect(parseFrontmatter('just text')).toEqual({ data: null, body: 'just text' });
    expect(parseFrontmatter('---\n: : :\n  - [\n---\nx')).toEqual({ data: null, body: '---\n: : :\n  - [\n---\nx' });
    expect(parseFrontmatter('---\n- a\n- b\n---\nx').data).toBeNull();
  });

  it('handles CRLF line endings', () => {
    expect(parseFrontmatter('---\r\nname: a\r\n---\r\nB').data).toEqual({ name: 'a' });
  });
});

describe('mapClaudeTools', () => {
  it('maps Claude Code tools onto assistant actions, deduped and sorted', () => {
    expect(mapClaudeTools('Read, Grep, Glob')).toEqual({ tools: ['FS_FIND', 'FS_READ_FILE'], unsupported: [], mcp: [] });
    expect(mapClaudeTools(['Write', 'Bash', 'WebFetch', 'LS', 'Edit']).tools).toEqual([
      'CLI_EXEC', 'FS_CREATE_DIR', 'FS_LIST_DIR', 'FS_READ_FILE', 'FS_WRITE_FILE', 'HTTP_REQUEST',
    ]);
  });

  it('reports tools with no equivalent', () => {
    expect(mapClaudeTools('Read, TodoWrite, KillShell').unsupported).toEqual(['TodoWrite', 'KillShell']);
    expect(mapClaudeTools('Task').unsupported).toEqual(['Task']);
  });

  it('routes mcp__ tools through MCP_CALL and remembers which servers they need', () => {
    expect(mapClaudeTools('mcp__github__create_issue, mcp__github__list, mcp__linear__x')).toEqual({
      tools: ['MCP_CALL'],
      unsupported: [],
      mcp: ['github', 'linear'],
    });
  });

  it('ignores scoped Bash patterns down to the tool name', () => {
    expect(mapClaudeTools('Bash(git:*), Read').tools).toEqual(['CLI_EXEC', 'FS_READ_FILE']);
  });

  it('treats a missing list as no tools', () => {
    expect(mapClaudeTools(undefined)).toEqual({ tools: [], unsupported: [], mcp: [] });
    expect(mapClaudeTools(42)).toEqual({ tools: [], unsupported: [], mcp: [] });
  });

  it('covers the documented Claude Code verbs', () => {
    for (const verb of ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'LS', 'Bash', 'WebFetch', 'WebSearch']) {
      expect(CLAUDE_TOOL_MAP[verb]?.length).toBeGreaterThan(0);
    }
    for (const verb of ['TodoWrite', 'BashOutput', 'KillShell', 'NotebookEdit', 'Task', 'ExitPlanMode', 'SlashCommand']) {
      expect(CLAUDE_TOOL_MAP[verb]).toBeNull();
    }
  });
});

describe('translateClaudeCode: plugin', () => {
  const files = {
    '.claude-plugin/plugin.json': PLUGIN_JSON,
    'skills/code-explorer/SKILL.md': SKILL_MD,
    'skills/code-explorer/references/notes.md': '# Notes',
    'agents/code-architect.md': AGENT_MD,
    'agents/planner.md': TODO_AGENT_MD,
    'commands/feature.md': '---\ndescription: start\n---\nGo',
    'hooks/hooks.json': '{}',
    '.mcp.json': '{"mcpServers":{}}',
    'README.md': '# Feature dev',
    'scripts/run.sh': 'echo hi',
  };
  const result = translateClaudeCode({ upstreamId: 'feature-dev', kind: 'plugin', files });

  it('emits a plugin package with provenance', () => {
    expect(result.ok).toBe(true);
    const pkg = result.package!;
    expect(pkg).toMatchObject({
      id: 'cc-feature-dev',
      name: 'Feature Dev',
      description: 'Guided feature development',
      type: 'plugin',
      version: '1.2.0',
      tags: ['dev', 'workflow', 'claude-code'],
      provenance: { translated_from: 'claude-code:feature-dev' },
    });
  });

  it('writes assistant-shaped PLUGIN.md, SKILL.md and SUBAGENT.md', () => {
    const f = result.package!.files;
    expect(Object.keys(f).sort()).toEqual([
      'PLUGIN.md',
      'README.md',
      'skills/code-explorer/SKILL.md',
      'skills/code-explorer/references/notes.md',
      'sub-agents/code-architect/SUBAGENT.md',
    ]);
    expect(fm(f['PLUGIN.md'])).toEqual({
      id: 'cc-feature-dev',
      name: 'Feature Dev',
      version: '1.2.0',
      description: 'Guided feature development',
      translated_from: 'claude-code:feature-dev',
    });
    expect(fm(f['skills/code-explorer/SKILL.md'])).toEqual({
      id: 'code-explorer',
      name: 'Code Explorer',
      description: 'Explore a codebase before changing it',
      tools: ['FS_FIND', 'FS_READ_FILE'],
      translated_from: 'claude-code:feature-dev',
    });
    expect(f['skills/code-explorer/SKILL.md']).toContain('# Explore\n\nRead the code first.');
    expect(fm(f['sub-agents/code-architect/SUBAGENT.md'])).toEqual({
      id: 'code-architect',
      name: 'Code Architect',
      description: 'Designs the change',
      model_role: 'orchestrator',
      tools: ['CLI_EXEC', 'FS_CREATE_DIR', 'FS_READ_FILE', 'FS_WRITE_FILE', 'HTTP_REQUEST'],
      translated_from: 'claude-code:feature-dev',
    });
    expect(f['sub-agents/code-architect/SUBAGENT.md']).toContain('You design features.');
    expect(f['README.md']).toBe('# Feature dev');
  });

  it('reports refused and skipped parts with reasons', () => {
    expect(result.report.translated).toEqual(['skills/code-explorer/SKILL.md', 'agents/code-architect.md']);
    // Skills first, then every other path in sorted order.
    expect(result.report.refused).toEqual([
      { path: '.mcp.json', reason: 'Bundled MCP servers must be published as separate MCP server packages' },
      { path: 'agents/planner.md', reason: 'Uses Claude Code tools with no assistant equivalent: TodoWrite' },
      { path: 'commands/feature.md', reason: 'Slash commands have no assistant equivalent' },
      { path: 'hooks/hooks.json', reason: 'Hooks are not supported' },
      { path: 'scripts/run.sh', reason: 'Unsupported file' },
    ]);
  });

  it('hashes the emitted files deterministically', () => {
    const again = translateClaudeCode({ upstreamId: 'feature-dev', kind: 'plugin', files: { ...files } });
    expect(again.package!.files_hash).toBe(result.package!.files_hash);
    const f = result.package!.files;
    const h = createHash('sha256');
    for (const p of Object.keys(f).sort()) h.update(`${p}\0${f[p]}\0`);
    expect(result.package!.files_hash).toBe(`sha256:${h.digest('hex')}`);
  });

  it('refuses a plugin with nothing translatable', () => {
    const r = translateClaudeCode({
      upstreamId: 'todo-only',
      kind: 'plugin',
      files: { '.claude-plugin/plugin.json': '{"name":"todo-only"}', 'agents/planner.md': TODO_AGENT_MD },
    });
    expect(r.ok).toBe(false);
    expect(r.package).toBeUndefined();
    expect(r.report.refused.map((x) => x.path)).toEqual(['agents/planner.md', '.']);
    expect(r.report.refused[1].reason).toBe('Nothing in this plugin could be translated');
  });

  it('refuses a plugin without a readable manifest', () => {
    const missing = translateClaudeCode({ upstreamId: 'x', kind: 'plugin', files: { 'skills/a/SKILL.md': SKILL_MD } });
    expect(missing.ok).toBe(false);
    expect(missing.report.refused).toEqual([{ path: '.claude-plugin/plugin.json', reason: 'Missing or invalid plugin manifest' }]);
    const broken = translateClaudeCode({ upstreamId: 'x', kind: 'plugin', files: { '.claude-plugin/plugin.json': '{nope' } });
    expect(broken.report.refused[0].reason).toBe('Missing or invalid plugin manifest');
    const nameless = translateClaudeCode({ upstreamId: 'x', kind: 'plugin', files: { '.claude-plugin/plugin.json': '{"version":"1.0.0"}' } });
    expect(nameless.ok).toBe(false);
  });

  it('falls back to 1.0.0 for a non-semver version, with a warning', () => {
    const r = translateClaudeCode({
      upstreamId: 'v',
      kind: 'plugin',
      files: { '.claude-plugin/plugin.json': '{"name":"v","version":"latest"}', 'skills/a/SKILL.md': SKILL_MD },
    });
    expect(r.package!.version).toBe('1.0.0');
    expect(r.report.warnings).toContainEqual({ path: '.claude-plugin/plugin.json', message: 'Version "latest" is not semver; using 1.0.0' });
  });

  it('warns when a body depends on CLAUDE_PLUGIN_ROOT or on MCP servers', () => {
    const r = translateClaudeCode({
      upstreamId: 'w',
      kind: 'plugin',
      files: {
        '.claude-plugin/plugin.json': '{"name":"w"}',
        'agents/a.md': '---\nname: a\ndescription: d\ntools: mcp__github__x\n---\nRun ${CLAUDE_PLUGIN_ROOT}/x.sh',
      },
    });
    expect(r.report.warnings).toEqual([
      { path: 'agents/a.md', message: 'Needs MCP servers installed separately: github' },
      { path: 'agents/a.md', message: 'References ${CLAUDE_PLUGIN_ROOT}; paths may need review' },
    ]);
  });
});

describe('translateClaudeCode: standalone skill and agent', () => {
  it('translates a skill directory into a skill package', () => {
    const r = translateClaudeCode({
      upstreamId: 'code-explorer',
      kind: 'skill',
      files: { 'SKILL.md': SKILL_MD, 'references/a.md': 'A', 'bin/tool': 'x' },
    });
    expect(r.ok).toBe(true);
    expect(r.package).toMatchObject({
      id: 'cc-code-explorer',
      name: 'Code Explorer',
      type: 'skill',
      version: '1.0.0',
      tags: ['claude-code'],
      provenance: { translated_from: 'claude-code:code-explorer' },
    });
    expect(Object.keys(r.package!.files).sort()).toEqual(['SKILL.md', 'references/a.md']);
    expect(fm(r.package!.files['SKILL.md']).id).toBe('cc-code-explorer');
    expect(r.report.refused).toEqual([{ path: 'bin/tool', reason: 'Unsupported file' }]);
  });

  it('translates an agent file into a sub-agent package', () => {
    const r = translateClaudeCode({ upstreamId: 'code-architect', kind: 'agent', files: { 'code-architect.md': AGENT_MD } });
    expect(r.ok).toBe(true);
    expect(r.package!.type).toBe('subagent');
    expect(Object.keys(r.package!.files)).toEqual(['SUBAGENT.md']);
    expect(fm(r.package!.files['SUBAGENT.md'])).toMatchObject({ id: 'cc-code-architect', model_role: 'orchestrator' });
  });

  it('maps model aliases onto assistant model roles', () => {
    const agent = (model: string) =>
      translateClaudeCode({ upstreamId: 'a', kind: 'agent', files: { 'a.md': `---\nname: a\ndescription: d\nmodel: ${model}\n---\nx` } });
    expect(fm(agent('opus').package!.files['SUBAGENT.md']).model_role).toBe('orchestrator');
    expect(fm(agent('haiku').package!.files['SUBAGENT.md']).model_role).toBe('profile');
    expect(fm(agent('inherit').package!.files['SUBAGENT.md'])).not.toHaveProperty('model_role');
    expect(agent('gpt-9').report.warnings).toContainEqual({ path: 'a.md', message: 'Unknown model "gpt-9"; the sub-agent follows the main model' });
  });

  it('refuses a skill or agent with missing frontmatter or unsupported tools', () => {
    const noFm = translateClaudeCode({ upstreamId: 's', kind: 'skill', files: { 'SKILL.md': '# no frontmatter' } });
    expect(noFm.ok).toBe(false);
    expect(noFm.report.refused).toEqual([{ path: 'SKILL.md', reason: 'Missing frontmatter name or description' }]);
    const noSkill = translateClaudeCode({ upstreamId: 's', kind: 'skill', files: { 'README.md': 'x' } });
    expect(noSkill.report.refused).toContainEqual({ path: 'SKILL.md', reason: 'Missing SKILL.md' });
    const todo = translateClaudeCode({ upstreamId: 'p', kind: 'agent', files: { 'p.md': TODO_AGENT_MD } });
    expect(todo.ok).toBe(false);
    expect(todo.report.refused[0].reason).toBe('Uses Claude Code tools with no assistant equivalent: TodoWrite');
    const none = translateClaudeCode({ upstreamId: 'p', kind: 'agent', files: {} });
    expect(none.report.refused).toEqual([{ path: '.', reason: 'Expected exactly one agent file' }]);
  });
});

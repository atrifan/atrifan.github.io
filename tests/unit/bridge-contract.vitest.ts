import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRIDGE_COMMANDS, type BridgeCommand } from '@/src/lib/bridge-commands';

/**
 * Contract between the ai. surface and the Tex assistant, read from the assistant's source at test time.
 *
 * - Every command in src/lib/bridge-commands.ts is on the extension's CONTROL_PLANE_ALLOWED_COMMANDS
 *   (plugin/src/background/worker.ts) and has a `case` in the native host (native-host/src/index.ts).
 * - Every command literal sent anywhere in src/ is in the table (so it is checked too).
 * - Every field in the table is read by the handler, and every required field is one the handler refuses
 *   to run without. Where a handler's own guard can be read unambiguously (a `requires x` message or an
 *   `if (!x)` on a `msg` field), the fields it demands must be in the table's required list.
 *
 * The assistant checkout is ASSISTANT_REPO, default `../assistant` next to this repository (resolved from
 * the main checkout, so it also works in a git worktree). Absent, the suite is skipped.
 */

const REPO = path.resolve(__dirname, '../..');

function mainCheckoutRoot(): string {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' }).trim();
    return path.dirname(common);
  } catch {
    return REPO;
  }
}

const ASSISTANT = process.env.ASSISTANT_REPO
  ? path.resolve(REPO, process.env.ASSISTANT_REPO)
  : path.resolve(mainCheckoutRoot(), '../assistant');
const WORKER = path.join(ASSISTANT, 'plugin/src/background/worker.ts');
const HOST_DIR = path.join(ASSISTANT, 'native-host/src');
const HOST = path.join(HOST_DIR, 'index.ts');
const present = existsSync(WORKER) && existsSync(HOST);

if (!present) {
  console.warn(`[bridge-contract] assistant source not found at ${ASSISTANT}; set ASSISTANT_REPO. Skipping.`);
}

// ── Reading the assistant source ─────────────────────────────────────────────

const stripLineComments = (src: string) => src.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');

export function parseAllowList(workerSrc: string): Set<string> {
  const m = workerSrc.match(/CONTROL_PLANE_ALLOWED_COMMANDS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error('CONTROL_PLANE_ALLOWED_COMMANDS not found in worker.ts');
  return new Set([...stripLineComments(m[1]).matchAll(/"([A-Z0-9_]+)"/g)].map((x) => x[1]));
}

interface HandlerBlock {
  labels: string[];
  body: string;
}

/** The switch arm of `case "<command>":` (fall-through labels included), up to the next arm. */
export function handlerBlock(hostSrc: string, command: string): HandlerBlock | null {
  const lines = hostSrc.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^\\s*case "${command}":`).test(l));
  if (start < 0) return null;
  const indent = lines[start].match(/^\s*/)![0];
  let first = start;
  while (first > 0 && new RegExp(`^${indent}case "[A-Z0-9_]+":\\s*$`).test(lines[first - 1])) first--;
  let i = first;
  const labels: string[] = [];
  while (i < lines.length && new RegExp(`^${indent}case "([A-Z0-9_]+)":`).test(lines[i])) {
    labels.push(lines[i].match(/case "([A-Z0-9_]+)"/)![1]);
    if (!/:\s*$/.test(lines[i])) break;
    i++;
  }
  const isArmStart = (l: string) => new RegExp(`^${indent}(case "[A-Z0-9_]+":|default:)`).test(l);
  let end = i + 1;
  while (end < lines.length && !isArmStart(lines[end])) end++;
  return { labels: labels.length ? labels : [command], body: lines.slice(first, end).join('\n') };
}

/** Field names read off the request frame: `msg.x`, `m.x`, `(msg as …).x`. */
export function fieldsRead(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(/\b(?:msg|m|frame)\??\.([a-zA-Z_]\w*)/g)) out.add(m[1]);
  for (const m of body.matchAll(/\(\s*(?:msg|m)\s+as\s+[^)]*\)\??\.([a-zA-Z_]\w*)/g)) out.add(m[1]);
  out.delete('type');
  return out;
}

/**
 * Groups of fields the handler refuses to run without (one of each group must be sent), read from guards that
 * name them unambiguously. Only for arms with a single label: a shared arm's guards belong to one of its
 * branches, and assigning them to every label would be a guess.
 */
export function derivedRequired(block: HandlerBlock): string[][] {
  if (block.labels.length > 1) return [];
  const read = fieldsRead(block.body);
  const groups: string[][] = [];
  // replyError(id, "X requires a and b") / "a required" / "a is required"
  for (const m of block.body.matchAll(/replyError\(\s*id,\s*[`"]([^`"]*)[`"]/g)) {
    const text = m[1];
    const req = text.match(/requires\s+([\w\s,]+?)(?:$|[.—(])/);
    const words = req ? req[1].split(/\s*(?:,|\band\b)\s*/) : [];
    const lead = text.match(/^(\w+)\s+(?:is\s+)?required$/);
    if (lead) words.push(lead[1]);
    for (const w of words.map((s) => s.trim())) if (read.has(w)) groups.push([w]);
  }
  // const v = <expr reading msg.a ?? msg.b>; … if (!v)
  for (const m of block.body.matchAll(/const (\w+)\s*=\s*([^\n]+)/g)) {
    const [, name, rhs] = m;
    if (!new RegExp(`if \\(!${name}\\s*[)|&]|\\|\\| !${name}\\s*[)|&]`).test(block.body)) continue;
    const fields = [...fieldsRead(rhs)];
    if (fields.length) groups.push(fields);
  }
  const seen = new Set<string>();
  return groups.filter((g) => {
    const k = [...g].sort().join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Some arms hand the frame to a router in another module; its reads count as the handler's. */
const DELEGATES: Partial<Record<BridgeCommand, string[]>> = {
  SCHEDULE_PAUSE: ['schedule-router.ts'],
  SCHEDULE_RESUME: ['schedule-router.ts'],
  SCHEDULE_REMOVE: ['schedule-router.ts'],
  MCP_ADD_SERVER: ['mcp-config.ts'],
  MCP_REMOVE_SERVER: ['mcp-config.ts'],
  A2A_ADD_AGENT: ['a2a-config.ts'],
  A2A_REMOVE_AGENT: ['a2a-config.ts'],
};

function handlerSource(hostSrc: string, command: BridgeCommand): { block: HandlerBlock; text: string } {
  const block = handlerBlock(hostSrc, command);
  if (!block) throw new Error(`no case "${command}" in native-host/src/index.ts`);
  const extra = (DELEGATES[command] ?? []).map((f) => readFileSync(path.join(HOST_DIR, f), 'utf8')).join('\n');
  return { block, text: `${block.body}\n${extra}` };
}

// ── Reading Tulzo's own sends ────────────────────────────────────────────────

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/**
 * Assistant command names quoted anywhere in a source file. A name counts when the assistant knows it (it is
 * allow-listed or has a native-host case), so a command passed as any argument, to any helper, is found.
 */
export function commandLiterals(src: string, known: ReadonlySet<string>): string[] {
  return [...src.matchAll(/['"`]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)['"`]/g)].map((m) => m[1]).filter((c) => known.has(c));
}

/** Every `case "X":` label in the native host. */
export function hostCommands(hostSrc: string): Set<string> {
  return new Set([...hostSrc.matchAll(/^\s*case "([A-Z0-9_]+)":/gm)].map((m) => m[1]));
}

// ── The tests ────────────────────────────────────────────────────────────────

describe('parsers (self-test on fixed input)', () => {
  const host = [
    '    switch (type) {',
    '      case "A":',
    '      case "B": {',
    '        const id2 = (msg.id as string) ?? (msg.skillId as string)',
    '        if (!id2) { replyError(id, "A requires id") }',
    '        break',
    '      }',
    '      case "C": {',
    '        const url = msg.url as string',
    '        if (!url) { replyError(id, "C requires url") }',
    '        const n = (msg as Record<string, unknown>).name',
    '        replyError(id, "year must be")',
    '        break',
    '      }',
    '      default:',
    '        replyError(id, "x")',
  ].join('\n');

  it('handlerBlock collects fall-through labels and stops at the next arm', () => {
    const b = handlerBlock(host, 'B')!;
    expect(b.labels).toEqual(['A', 'B']);
    expect(b.body).toContain('A requires id');
    expect(b.body).not.toContain('C requires url');
    expect(handlerBlock(host, 'A')!.labels).toEqual(['A', 'B']);
    expect(handlerBlock(host, 'Z')).toBeNull();
  });

  it('fieldsRead and derivedRequired', () => {
    const c = handlerBlock(host, 'C')!;
    expect([...fieldsRead(c.body)].sort()).toEqual(['name', 'url']);
    expect(derivedRequired(c)).toEqual([['url']]);
    expect(derivedRequired(handlerBlock(host, 'A')!)).toEqual([]);
  });

  it('parseAllowList ignores commented-out names', () => {
    const w = 'const CONTROL_PLANE_ALLOWED_COMMANDS = new Set([\n  "A",\n  // "B" is not allowed\n  "C", // why "D"\n])';
    expect([...parseAllowList(w)]).toEqual(['A', 'C']);
  });

  it('commandLiterals finds known command names in any position', () => {
    const known = new Set(['LIST_FLEET', 'NOTIFICATION_TEST', 'X_Y']);
    const src = `bridge.send('LIST_FLEET'); runBridge('k', "NOTIFICATION_TEST", {}); const t = 'NOT_A_COMMAND'; x(\`X_Y\`)`;
    expect(commandLiterals(src, known)).toEqual(['LIST_FLEET', 'NOTIFICATION_TEST', 'X_Y']);
    expect([...hostCommands(host)]).toEqual(['A', 'B', 'C']);
  });
});

describe.skipIf(!present)('ai. ↔ assistant bridge contract', () => {
  const allow = present ? parseAllowList(readFileSync(WORKER, 'utf8')) : new Set<string>();
  const hostSrc = present ? readFileSync(HOST, 'utf8') : '';
  const commands = Object.keys(BRIDGE_COMMANDS) as BridgeCommand[];

  it('the allow-list parsed from worker.ts is not empty', () => {
    expect(allow.size).toBeGreaterThan(40);
    expect(allow.has('SECRETS_LIST')).toBe(true);
  });

  it('every command Tulzo sends is on the extension allow-list', () => {
    expect(commands.filter((c) => !allow.has(c))).toEqual([]);
  });

  // Files that talk to the extension bridge (the remote-chat relay is a different channel with its own contract).
  const bridgeFiles = sourceFiles(path.join(REPO, 'src')).filter((f) =>
    /from ['"][^'"]*(?:extension-bridge|bridge-commands|useBridge)['"]/.test(readFileSync(f, 'utf8')),
  );

  it('every command literal in a bridge-using file is a table command (so it is checked)', () => {
    expect(bridgeFiles.length).toBeGreaterThan(0);
    const known = new Set([...allow, ...hostCommands(hostSrc)]);
    const offenders: string[] = [];
    for (const file of bridgeFiles) {
      for (const c of commandLiterals(readFileSync(file, 'utf8'), known)) {
        if (!(c in BRIDGE_COMMANDS) || !allow.has(c)) offenders.push(`${path.relative(REPO, file)}: ${c}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every command has a native-host handler', () => {
    expect(commands.filter((c) => !handlerBlock(hostSrc, c))).toEqual([]);
  });

  for (const command of commands) {
    it(`${command}: the handler reads every field Tulzo sends`, () => {
      const { text } = handlerSource(hostSrc, command);
      const read = fieldsRead(text);
      const s = BRIDGE_COMMANDS[command];
      expect([...s.required, ...s.optional].filter((f) => !read.has(f))).toEqual([]);
    });

    it(`${command}: required fields are the ones the handler refuses without`, () => {
      const { block, text } = handlerSource(hostSrc, command);
      const required = BRIDGE_COMMANDS[command].required as readonly string[];
      // Derived from the guard → must be in the table.
      const uncovered = derivedRequired(block).filter((group) => !group.some((f) => required.includes(f)));
      expect(uncovered).toEqual([]);
      // In the table → the source must guard it (a message naming it, an if (!x) on it, or a validity check).
      for (const f of required) {
        const guarded =
          new RegExp(`requires?[^"\`\\n]*\\b${f}\\b`).test(text) ||
          new RegExp(`"${f} (?:is )?required"|${f} must be|${f} required`).test(text) ||
          new RegExp(`const (\\w+)\\s*=[^\\n]*\\.${f}\\b[^\\n]*\\n(?:[^\\n]*\\n){0,4}?[^\\n]*if \\(!\\1\\b`).test(text) ||
          (f === 'choice' && /raw !== null && raw !== "always"/.test(text)) ||
          new RegExp(`if \\(!opts\\.${f}\\b`).test(text) ||
          // looked up by that field, refused when nothing matches
          (new RegExp(`const \\w+\\s*=[^\\n]*\\.${f}\\b`).test(text) && /not found/.test(text));
        expect(guarded, `${command}.${f} is not guarded in the handler`).toBe(true);
      }
    });
  }
});

/**
 * Reads the remote-chat protocol out of the assistant's SOURCE (not its docs), so the
 * contract test follows the code: which frames the device builds, which fields it reads
 * from each inbound frame, and which frames Tulzo's chat page posts.
 *
 * ASSISTANT_REPO (default ../assistant) points at a checkout of the assistant repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** The assistant checkout, or null when it isn't on this machine (the contract test then skips). */
export function assistantRepo(): string | null {
  const candidates: string[] = [];
  if (process.env.ASSISTANT_REPO) candidates.push(path.resolve(process.env.ASSISTANT_REPO));
  candidates.push(path.resolve(process.cwd(), '../assistant'));
  // In a git worktree (.claude/worktrees/<name>) ../assistant is relative to the main checkout.
  const gitFile = path.join(process.cwd(), '.git');
  if (fs.existsSync(gitFile) && fs.statSync(gitFile).isFile()) {
    const m = /gitdir:\s*(.+)/.exec(fs.readFileSync(gitFile, 'utf8'));
    const main = m ? m[1].trim().split(`${path.sep}.git${path.sep}`)[0] : null;
    if (main) candidates.push(path.resolve(main, '../assistant'));
  }
  return candidates.find((c) => fs.existsSync(path.join(c, 'plugin/src/background/remote-chat.ts'))) ?? null;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((c) => walk(c, visit));
}

function propName(p: ts.ObjectLiteralElementLike): string | null {
  if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name && ts.isIdentifier(p.name)) {
    return p.name.text;
  }
  return null;
}

/** String literal a `type:` initializer resolves to: "X", or the fallback of `expr ?? "X"`. */
function typeLiteral(init: ts.Expression): string | null {
  if (ts.isStringLiteralLike(init)) return init.text;
  if (ts.isBinaryExpression(init) && init.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    return typeLiteral(init.right);
  }
  return null;
}

export interface FrameShape {
  type: string;
  keys: string[];
}

/**
 * Object literals with a `type` property passed to one of `callees` (e.g. fanOut,
 * relay.emit, post). Spread members are reported as the key "...".
 */
export function framesBuiltIn(file: string, callees: string[]): FrameShape[] {
  const out: FrameShape[] = [];
  walk(parse(file), (n) => {
    if (!ts.isCallExpression(n)) return;
    const callee = n.expression.getText();
    if (!callees.some((c) => callee === c || callee.endsWith(`.${c}`))) return;
    for (const arg of n.arguments) {
      if (!ts.isObjectLiteralExpression(arg)) continue;
      const typeProp = arg.properties.find((p) => propName(p) === 'type');
      if (!typeProp || !ts.isPropertyAssignment(typeProp)) continue;
      const type = typeLiteral(typeProp.initializer);
      if (!type) continue;
      const keys = arg.properties
        .map((p) => (ts.isSpreadAssignment(p) ? '...' : propName(p)))
        .filter((k): k is string => !!k && k !== 'type');
      out.push({ type, keys });
    }
  });
  return out;
}

/** Literal types compared in a condition like `f.type === "A" || f.type === "B"`. */
function typesTested(cond: ts.Expression, subject: string): string[] {
  const found: string[] = [];
  walk(cond, (n) => {
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      n.left.getText() === `${subject}.type` &&
      ts.isStringLiteralLike(n.right)
    ) {
      found.push(n.right.text);
    }
  });
  return found;
}

/**
 * For the device's inbound handler: which fields of `subject` (the frame variable) are
 * read under each `subject.type === "X"` branch. An access in an `else` is attributed to
 * the enclosing branch's types minus the ones its if/else-if chain already tested.
 */
export function fieldsReadPerType(file: string, functionName: string, subject: string): Record<string, string[]> {
  const sf = parse(file);
  let fn: ts.Node | null = null;
  walk(sf, (n) => {
    if (!fn && ts.isFunctionDeclaration(n) && n.name?.text === functionName) fn = n;
  });
  if (!fn) throw new Error(`${functionName} not found in ${file}`);
  const result: Record<string, Set<string>> = {};

  const typesAt = (node: ts.Node): string[] | null => {
    let child: ts.Node = node;
    for (let p = node.parent; p && p !== fn; child = p, p = p.parent) {
      if (!ts.isIfStatement(p)) continue;
      const tested = typesTested(p.expression, subject);
      if (child === p.thenStatement && tested.length) return tested;
      if (child === p.elseStatement && !ts.isIfStatement(p.elseStatement)) {
        // Final else of a chain: outer types minus everything the chain tested.
        const chain: string[] = [];
        let head: ts.Node = p;
        while (ts.isIfStatement(head.parent) && head.parent.elseStatement === head) head = head.parent;
        for (let q: ts.Statement | undefined = head as ts.IfStatement; q && ts.isIfStatement(q); q = q.elseStatement) {
          chain.push(...typesTested(q.expression, subject));
        }
        const outer = typesAt(head);
        if (outer) return outer.filter((t) => !chain.includes(t));
      }
    }
    return null;
  };

  walk(fn, (n) => {
    if (!ts.isPropertyAccessExpression(n) || n.expression.getText() !== subject || n.name.text === 'type') return;
    for (const t of typesAt(n) ?? []) (result[t] ??= new Set()).add(n.name.text);
  });
  return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, [...v].sort()]));
}

/** `msg.type === 'X'` literals a page handler tests (the device frames it reacts to). */
export function typesHandled(file: string, subject: string): string[] {
  const out = new Set<string>();
  walk(parse(file), (n) => {
    if (ts.isIfStatement(n)) typesTested(n.expression, subject).forEach((t) => out.add(t));
    if (ts.isCaseClause(n) && ts.isStringLiteralLike(n.expression) && n.parent.parent.expression.getText() === `${subject}.type`) {
      out.add(n.expression.text);
    }
  });
  return [...out].sort();
}

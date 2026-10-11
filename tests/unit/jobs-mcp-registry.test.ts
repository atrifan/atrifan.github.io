import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildRegistry, defineTool, type ToolModule } from '../../src/lib/jobs/mcp/registry.ts';
import { JobsError } from '../../src/lib/jobs/errors.ts';
import { InvalidTransitionError } from '../../src/lib/jobs/job-state.ts';
import { JsonRpcError } from '../../src/lib/mcp/jsonrpc-core.ts';

type Ctx = { userId: string };
const ctx: Ctx = { userId: 'user_1' };

const echo = defineTool<Ctx, { text: string; times?: number }>({
  name: 'echo',
  description: 'Echo text back.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' }, times: { type: 'integer' } },
    required: ['text'],
  },
  input: z.object({ text: z.string().min(1), times: z.number().int().optional() }).strict(),
  annotations: { readOnlyHint: true },
  handler: async (args, c) => ({ text: args.text.repeat(args.times ?? 1), user: c.userId }),
});

function tool(name: string, handler: () => Promise<Record<string, unknown>>) {
  return defineTool<Ctx, Record<string, never>>({
    name,
    description: `The ${name} tool.`,
    inputSchema: { type: 'object', properties: {} },
    input: z.object({}).strict(),
    handler: async () => handler(),
  });
}

const modA: ToolModule<Ctx> = { tools: [echo] };
const modB: ToolModule<Ctx> = { tools: [tool('second', async () => ({ ok: true }))] };

test('lists tools from every module in module order, as MCP descriptors', () => {
  const reg = buildRegistry([modA, modB]);
  assert.deepEqual(reg.names(), ['echo', 'second']);
  assert.deepEqual(reg.list()[0], {
    name: 'echo',
    description: 'Echo text back.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, times: { type: 'integer' } },
      required: ['text'],
    },
    annotations: { readOnlyHint: true },
  });
  assert.deepEqual(reg.list()[1], {
    name: 'second',
    description: 'The second tool.',
    inputSchema: { type: 'object', properties: {} },
  });
  assert.equal(reg.has('echo'), true);
  assert.equal(reg.has('nope'), false);
  assert.equal(reg.has('toString'), false);
});

test('adding a module adds its tools', () => {
  const extra: ToolModule<Ctx> = { tools: [tool('send_project', async () => ({}))] };
  assert.deepEqual(buildRegistry([modA, modB, extra]).names(), ['echo', 'second', 'send_project']);
});

test('an empty module list is a valid, empty registry', () => {
  const reg = buildRegistry<Ctx>([]);
  assert.deepEqual(reg.list(), []);
});

test('rejects duplicate tool names across modules', () => {
  assert.throws(() => buildRegistry([modA, { tools: [echo] }]), /Duplicate tool name: echo/);
});

test('rejects bad names, empty descriptions and non-object schemas', () => {
  const bad = (over: Record<string, unknown>) => ({ tools: [{ ...echo, ...over }] }) as unknown as ToolModule<Ctx>;
  assert.throws(() => buildRegistry([bad({ name: 'Bad-Name' })]), /Invalid tool name/);
  assert.throws(() => buildRegistry([bad({ name: '' })]), /Invalid tool name/);
  assert.throws(() => buildRegistry([bad({ name: 'x'.repeat(65) })]), /Invalid tool name/);
  assert.throws(() => buildRegistry([bad({ description: '  ' })]), /needs a description/);
  assert.throws(() => buildRegistry([bad({ inputSchema: { type: 'string' } })]), /inputSchema must be an object schema/);
  assert.throws(
    () => buildRegistry([bad({ inputSchema: { type: 'object', properties: { a: {} }, required: ['b'] } })]),
    /requires unknown property b/,
  );
});

test('a valid call returns the payload as text and structuredContent', async () => {
  const reg = buildRegistry([modA]);
  const res = await reg.call('echo', { text: 'ab', times: 2 }, ctx);
  assert.deepEqual(res, {
    content: [{ type: 'text', text: JSON.stringify({ text: 'abab', user: 'user_1' }, null, 2) }],
    structuredContent: { text: 'abab', user: 'user_1' },
  });
});

test('missing arguments are treated as {}', async () => {
  const reg = buildRegistry([modB]);
  const res = await reg.call('second', undefined, ctx);
  assert.deepEqual(res.structuredContent, { ok: true });
  assert.equal(res.isError, undefined);
});

test('unknown tool is a JSON-RPC -32602 error', async () => {
  const reg = buildRegistry([modA]);
  await assert.rejects(reg.call('nope', {}, ctx), (err: unknown) => {
    assert.ok(err instanceof JsonRpcError);
    assert.equal(err.code, -32602);
    assert.equal(err.message, 'Unknown tool: nope');
    return true;
  });
});

test('invalid arguments are a tool error invalid_request with zod issues', async () => {
  const reg = buildRegistry([modA]);
  const res = await reg.call('echo', { text: '' }, ctx);
  assert.equal(res.isError, true);
  const body = res.structuredContent as { error: string; message: string; issues: Array<{ path: unknown[] }> };
  assert.equal(body.error, 'invalid_request');
  assert.equal(body.message, 'Invalid arguments for echo');
  assert.deepEqual(body.issues[0].path, ['text']);
  const extra = await reg.call('echo', { text: 'a', nope: 1 }, ctx);
  assert.equal(extra.isError, true);
  const notObject = await reg.call('echo', 'text', ctx);
  assert.equal(notObject.isError, true);
});

test('a JobsError becomes a tool error with its code, message and object details', async () => {
  const reg = buildRegistry([
    { tools: [tool('gate', async () => { throw new JobsError('connect_required', 403, 'Finish Stripe Connect', { onboarding_url: 'https://hub/profile' }); })] },
  ]);
  const res = await reg.call('gate', {}, ctx);
  assert.equal(res.isError, true);
  assert.deepEqual(res.structuredContent, {
    error: 'connect_required', message: 'Finish Stripe Connect', status: 403, onboarding_url: 'https://hub/profile',
  });
  assert.equal(res.content[0].text, JSON.stringify(res.structuredContent, null, 2));
});

test('JobsError details cannot overwrite error, message or status', async () => {
  const reg = buildRegistry([
    { tools: [tool('gate', async () => { throw new JobsError('forbidden', 403, 'No', { error: 'x', message: 'y', status: 1, extra: 2 }); })] },
  ]);
  assert.deepEqual((await reg.call('gate', {}, ctx)).structuredContent, { error: 'forbidden', message: 'No', status: 403, extra: 2 });
});

test('JobsError array details are reported as issues', async () => {
  const reg = buildRegistry([
    { tools: [tool('gate', async () => { throw new JobsError('invalid_request', 400, 'Bad', [{ path: ['a'] }]); })] },
  ]);
  assert.deepEqual((await reg.call('gate', {}, ctx)).structuredContent, {
    error: 'invalid_request', message: 'Bad', status: 400, issues: [{ path: ['a'] }],
  });
});

test('an invalid state transition is reported as invalid_state', async () => {
  const reg = buildRegistry([
    { tools: [tool('move', async () => { throw new InvalidTransitionError('contract', 'completed', 'active'); })] },
  ]);
  assert.deepEqual((await reg.call('move', {}, ctx)).structuredContent, {
    error: 'invalid_state', message: 'Invalid contract transition: completed -> active', status: 409,
  });
});

test('an unexpected error is a generic internal_error that leaks nothing', async (t) => {
  const logged: unknown[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  const reg = buildRegistry([{ tools: [tool('crash', async () => { throw new Error('db password is hunter2'); })] }]);
  const res = await reg.call('crash', {}, ctx);
  assert.equal(res.isError, true);
  assert.deepEqual(res.structuredContent, { error: 'internal_error', message: 'Something went wrong', status: 500 });
  assert.equal(logged.length, 1);
});

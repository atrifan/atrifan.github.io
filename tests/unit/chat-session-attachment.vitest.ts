import { describe, expect, it } from 'vitest';
import { canControl, initialAttachment, reduceAttachment, supportsWatch } from '../../src/views/remote-chat/model/session-attachment';
import { matchesWatch, parseNativeFrame, parseSession, type NativeIncoming, type NativeMetadata } from '../../src/views/remote-chat/session-contract';
import { historyGroup, lastActivity, preserveNativeOrigin, sortActivity, surfaceLabel } from '../../src/views/remote-chat/model/session-list';
import { getJsonRetrying } from '../../src/views/remote-chat/get-json-retrying';

const identity = { protocol: 1 as const, watchId: 'watch-a', nativeSessionId: 'native-a' };
const native: NativeMetadata = { sessionId: 'native-a', protocol: 1, state: 'running', capabilities: { watch: true, reply: true, answer: true, stop: true } };
const message = (text: string) => ({ id: 'm1', position: 1, role: 'assistant' as const, text, streaming: true });
const snapshot = (overrides: Partial<Extract<NativeIncoming, { type: 'SESSION_SNAPSHOT' }>> = {}): NativeIncoming => ({
  type: 'SESSION_SNAPSHOT', ...identity, through: 20, stateVersion: 'v1', state: 'running', loopId: 'loop-a', pending: null,
  messages: [message('partial')], historyComplete: true, ...overrides,
});
const event = (eventSeq: number, text: string): NativeIncoming => ({ type: 'SESSION_EVENT', ...identity, eventSeq, change: { kind: 'message', message: message(text) } });

describe('native snapshot / live join used by NativeSessionChat', () => {
  it('joins buffered fresh events, ignores through equality/replays, and replaces cumulative content', () => {
    let state = initialAttachment();
    state = reduceAttachment(state, event(22, 'final'));
    state = reduceAttachment(state, event(21, 'growing'));
    state = reduceAttachment(state, event(20, 'old'));
    state = reduceAttachment(state, snapshot());
    expect(state.messages.map((entry) => entry.text)).toEqual(['final']);
    expect(state.through).toBe(22);
    expect(reduceAttachment(state, event(22, 'duplicate'))).toBe(state);
    expect(reduceAttachment(state, event(20, 'older'))).toBe(state);
    expect(reduceAttachment(state, event(23, 'new final')).messages[0].text).toBe('new final');
  });
  it('fails closed at a gap and cannot recover without a fresh attempt', () => {
    const state = reduceAttachment(reduceAttachment(initialAttachment(), snapshot()), event(22, 'missing 21'));
    expect(state.error).toMatch(/out of sync/);
    expect(state.messages[0].text).toBe('partial');
    expect(reduceAttachment(state, event(21, 'late'))).toBe(state);
  });
  it('buffers at most 1000 unique events; duplicates do not consume capacity', () => {
    let state = initialAttachment();
    for (let seq = 1; seq <= 1000; seq++) state = reduceAttachment(state, event(seq, 'text'));
    expect(reduceAttachment(state, event(1000, 'repeat')).buffer).toHaveLength(1000);
    expect(reduceAttachment(state, event(1001, 'overflow')).error).toMatch(/Too many/);
  });
  it('keeps partial history visible without enabling commands', () => {
    const state = reduceAttachment(initialAttachment(), snapshot({ historyComplete: false }));
    expect(state.messages).toHaveLength(1);
    expect(canControl(state, native, true, true, false, 'reply')).toBe(false);
  });
});

describe('command decision table used on every native activation path', () => {
  const state = reduceAttachment(initialAttachment(), snapshot());
  it('allows current running reply/targeted stop, not an untargeted answer', () => {
    expect(canControl(state, native, true, true, false, 'reply')).toBe(true);
    expect(canControl(state, native, true, true, false, 'stop')).toBe(true);
    expect(canControl(state, native, true, true, false, 'answer')).toBe(false);
  });
  it.each(['offline', 'detached', 'pending', 'error', 'unknown', 'incomplete', 'no-loop', 'no-capability'] as const)('blocks stop when %s', (condition) => {
    const changed = { ...state, snapshot: { ...state.snapshot!, ...(condition === 'unknown' ? { state: 'unknown' as const } : {}), ...(condition === 'no-loop' ? { loopId: null } : {}) },
      error: condition === 'error' ? 'interrupted' : null, historyComplete: condition !== 'incomplete' };
    const metadata = condition === 'no-capability' ? { ...native, capabilities: { ...native.capabilities!, stop: false } } : native;
    expect(canControl(changed, metadata, condition !== 'offline', condition !== 'detached', condition === 'pending', 'stop')).toBe(false);
  });
  it('waiting answers target a pending request, idle reply continues, unknown protocol never watches', () => {
    const waiting = reduceAttachment(initialAttachment(), snapshot({ state: 'waiting', pending: { kind: 'question', prompt: 'Which?', requestId: 'q1' } }));
    expect(canControl(waiting, native, true, true, false, 'answer')).toBe(true);
    expect(canControl(waiting, native, true, true, false, 'reply')).toBe(false);
    const idle = reduceAttachment(initialAttachment(), snapshot({ state: 'idle', loopId: null }));
    expect(canControl(idle, native, true, true, false, 'reply')).toBe(true);
    expect(supportsWatch({ ...native, protocol: 2 })).toBe(false);
    expect(supportsWatch({ ...native, capabilities: undefined })).toBe(false);
  });
});

describe('wire boundary and listing decisions', () => {
  it('rejects malformed snapshots, state, sequence, and unknown versions', () => {
    expect(parseNativeFrame(snapshot())).not.toBeNull();
    expect(parseNativeFrame({ ...snapshot(), messages: 'not-an-array' })).toBeNull();
    expect(parseNativeFrame({ ...snapshot(), protocol: 2 })).toBeNull();
    expect(parseNativeFrame({ ...snapshot(), through: -1 })).toBeNull();
    expect(parseNativeFrame({ ...snapshot(), pending: { kind: 'form' } })).toBeNull();
    expect(matchesWatch({ ...snapshot(), watchId: 'other' }, identity)).toBe(false);
    expect(matchesWatch({ ...snapshot(), nativeSessionId: 'other' }, identity)).toBe(false);
  });
  const row = { id: 'relay', api_key_id: 'device', title: 'Title', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-29T12:00:00Z' };
  it('retains malformed native metadata as read-only, not legacy', () => {
    const parsed = parseSession({ ...row, native: null })!;
    expect(parsed.native?.state).toBe('unknown');
    expect(supportsWatch(parsed.native)).toBe(false);
  });
  it('metadata loss revokes support without turning a known native relay binding into a web chat', () => {
    const refreshed = preserveNativeOrigin(parseSession(row)!, { ...parseSession(row)!, native });
    expect(refreshed.native?.sessionId).toBe(native.sessionId);
    expect(refreshed.native?.state).toBe('unknown');
    expect(supportsWatch(refreshed.native)).toBe(false);
    expect(refreshed.native?.capabilities).toBeUndefined();
  });
  it('uses valid activity, updated then created fallback, with stable sorting', () => {
    const first = parseSession({ ...row, lastActivity: 'invalid' })!;
    expect(lastActivity(first)).toBe(Date.parse(row.updated_at));
    expect(parseSession({ ...row, lastActivity: 1e100 })?.lastActivity).toBeUndefined();
    const second = { ...first, id: 'second' };
    expect(sortActivity([first, second]).map((entry) => entry.id)).toEqual(['relay', 'second']);
    expect(lastActivity({ ...first, updated_at: 'bad' })).toBe(Date.parse(row.created_at));
  });
  it('groups by browser local date and omits synthetic source/site information', () => {
    const now = new Date(2026, 9, 29, 12).getTime();
    const parsed = parseSession(row)!;
    expect(historyGroup({ ...parsed, lastActivity: new Date(2026, 9, 28, 23).getTime() }, now)).toBe('Yesterday');
    expect(historyGroup({ ...parsed, lastActivity: new Date(2026, 9, 23, 12).getTime() }, now)).toBe('This week');
    expect(historyGroup({ ...parsed, lastActivity: new Date(2026, 9, 22, 12).getTime() }, now)).toBe('Older');
    expect(surfaceLabel('cli')).toBe('CLI');
    expect(surfaceLabel(undefined)).toBe('Unknown surface');
    expect(parseSession({ ...row, domain: 'javascript:alert(1)' })?.domain).toBeUndefined();
  });
});

describe('selection cancellation used by discovery and legacy history', () => {
  it('does not fetch an already canceled selection', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    expect(await getJsonRetrying('/unused', { signal: controller.signal, fetchImpl: async () => { calls++; return new Response('{}'); } })).toBeNull();
    expect(calls).toBe(0);
  });
  it('passes cancellation to fetch and never retries after cancellation', async () => {
    const controller = new AbortController();
    let calls = 0;
    const result = await getJsonRetrying('/canceled-history', { signal: controller.signal, fetchImpl: async (_url, init) => {
      calls++;
      expect(init?.signal).toBe(controller.signal);
      controller.abort();
      return new Response('{}', { status: 500 });
    } });
    expect(result).toBeNull();
    expect(calls).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { canControl, initialAttachment, reduceAttachment } from '../../src/views/remote-chat/model/session-attachment';
import { matchesWatch, parseCatalog, parseNativeFrame, parseSession, type NativeIncoming, type NativeMetadata } from '../../src/views/remote-chat/session-contract';
import { historyGroup, lastActivity, liveTime, preserveNativeOrigin, sortActivity } from '../../src/views/remote-chat/model/session-list';

const identity = { protocol: 1 as const, watchId: 'watch-review', nativeSessionId: 'native-review' };
const native: NativeMetadata = { sessionId: identity.nativeSessionId, protocol: 1, state: 'running', capabilities: { watch: true, reply: true, answer: true, stop: true } };
const message = { id: 'm', position: 0, role: 'assistant' as const, text: 'Snapshot', streaming: true };
const snapshot = (overrides = {}): NativeIncoming => ({ type: 'SESSION_SNAPSHOT', ...identity, through: 20, stateVersion: 'v20', state: 'running', loopId: 'loop', pending: null, historyComplete: true, messages: [message], ...overrides });
const event = (eventSeq: number): NativeIncoming => ({ type: 'SESSION_EVENT', ...identity, eventSeq, change: { kind: 'message', message: { ...message, text: 'Live' } } });
const row = { id: 'relay', api_key_id: 'device', title: 'Review', created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-29T12:00:00Z' };

describe('attachment survivor regression decisions', () => {
  it('a duplicate snapshot cannot rewind live transcript or current command identity', () => {
    const live = reduceAttachment(reduceAttachment(initialAttachment(), snapshot()), event(21));
    const after = reduceAttachment(live, snapshot());
    expect(after.messages[0].text).toBe('Live');
    expect(after.through).toBe(21);
    expect(after).toBe(live);
  });
  it('incomplete history reports an error and does not project buffered live work', () => {
    const buffered = reduceAttachment(initialAttachment(), event(21));
    const partial = reduceAttachment(buffered, snapshot({ historyComplete: false }));
    expect(partial.error).toMatch(/history.*unavailable/i);
    expect(partial.messages[0].text).toBe('Snapshot');
    expect(partial.through).toBe(20);
  });
  it('a waiting state without a target cannot answer', () => {
    const state = reduceAttachment(initialAttachment(), snapshot({ state: 'waiting', pending: null }));
    expect(canControl(state, native, true, true, false, 'answer')).toBe(false);
  });
  it.each(['running', 'idle'])('a %s projection with an unresolved request cannot send a reply', (state) => {
    const projection = reduceAttachment(initialAttachment(), snapshot({ state, pending: { requestId: 'q', kind: 'question', prompt: 'Which?' } }));
    expect(canControl(projection, native, true, true, false, 'reply')).toBe(false);
  });
});

describe('native wire boundaries', () => {
  it('unknown-version frames are foreign even with the current watch identity', () => {
    expect(matchesWatch({ ...snapshot(), protocol: 2 }, identity)).toBe(false);
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '21', null, undefined])('rejects invalid event sequence %s', (eventSeq) => {
    expect(parseNativeFrame({ ...event(21), eventSeq })).toBeNull();
  });
  it.each([{ ...message, text: null }, { ...message, position: -1 }, { ...message, streaming: 'true' }, null])('rejects a malformed message inside a snapshot', (bad) => {
    expect(parseNativeFrame({ ...snapshot(), messages: [bad] })).toBeNull();
  });
  it.each([undefined, 0, 2, '1'])('does not advertise pagination for catalog version %s', (version) => {
    expect(parseCatalog({ version, complete: false, nextCursor: 'next' })).toBeNull();
  });
  it('rejects unrecognized error reasons rather than treating them as v1', () => {
    expect(parseNativeFrame({ ...identity, type: 'SESSION_ERROR', reason: 'future_reason' })).toBeNull();
    expect(parseNativeFrame({ ...identity, type: 'SESSION_ERROR', reason: 'offline' })).not.toBeNull();
  });
  it('enum wire values must be strings, not arrays coerced into recognized literals', () => {
    expect(parseNativeFrame({ ...snapshot(), state: ['idle'] })).toBeNull();
    expect(parseNativeFrame({ ...snapshot(), messages: [{ ...message, role: ['assistant'] }] })).toBeNull();
    expect(parseNativeFrame({ ...snapshot(), pending: { requestId: 'q', kind: ['question'], prompt: '?' } })).toBeNull();
    expect(parseNativeFrame({ ...identity, type: 'SESSION_COMMAND_RESULT', commandId: 'c', outcome: ['applied'] })).toBeNull();
    expect(parseNativeFrame({ ...identity, type: 'SESSION_ERROR', reason: ['offline'] })).toBeNull();
    expect(parseSession({ ...row, native: { sessionId: 'n', state: ['idle'] } })?.native?.state).toBe('unknown');
  });
});

describe('discovery survivor decisions', () => {
  it.each([null, '2026-10-29T11:00:00Z', '42', {}, [], undefined])('invalid lastActivity %s is removed before any listing caller sees it', (lastActivityWire) => {
    const parsed = parseSession({ ...row, lastActivity: lastActivityWire })!;
    expect(parsed.lastActivity).toBeUndefined();
    expect(lastActivity(parsed)).toBe(Date.parse(row.updated_at));
  });
  it('keeps new authoritative native metadata on refresh, including updated capabilities', () => {
    const previous = { ...parseSession(row)!, native };
    const refreshed = { ...previous, native: { ...native, state: 'idle' as const, capabilities: { ...native.capabilities!, reply: false } } };
    expect(preserveNativeOrigin(refreshed, previous)).toBe(refreshed);
  });
  it('groups same-local-day and wholly invalid activity honestly', () => {
    const now = new Date(2026, 9, 29, 12).getTime();
    const parsed = parseSession(row)!;
    expect(historyGroup({ ...parsed, lastActivity: new Date(2026, 9, 29, 1).getTime() }, now)).toBe('Today');
    expect(historyGroup({ ...parsed, updated_at: 'bad', created_at: 'bad' }, now)).toBe('Older');
  });
  it('sorts unequal activities newest first without mutating input', () => {
    const old = { ...parseSession(row)!, id: 'old', lastActivity: 1 };
    const recent = { ...old, id: 'recent', lastActivity: 2 };
    const input = [old, recent];
    expect(sortActivity(input).map((entry) => entry.id)).toEqual(['recent', 'old']);
    expect(input).toEqual([old, recent]);
  });
  it('uses the exact just-now / seconds boundary and minute boundary', () => {
    expect(liveTime(0, 9_999)).toBe('just now');
    expect(liveTime(0, 10_000)).toBe('10s ago');
    expect(liveTime(0, 60_000)).toBe('1 min ago');
  });
});

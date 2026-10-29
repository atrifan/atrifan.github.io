import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primeViolation, staleEventViolation, type WireEvent } from '../support/chat-attach-prime.ts';

/** Fixture regression: the pre-attach prime rule used by the simulated chat page harness. */
const prime = (seq: number, completedSeq: number | undefined, pageId = 'page-1', relayId = 'relay-1'): WireEvent => ({
  seq,
  completedSeq,
  pageId,
  relayId,
  kind: 'prime',
});
const attach = (seq: number, watchId: string, pageId = 'page-1', relayId = 'relay-1'): WireEvent => ({
  seq,
  pageId,
  relayId,
  kind: 'attach',
  watchId,
});

test('a completed prime from the same page before SESSION_ATTACH is accepted', () => {
  const events = [prime(1, 2), attach(3, 'w1')];
  assert.equal(primeViolation(events, events[1]), null);
});

test('an attach with no prime at all is rejected', () => {
  const events = [attach(1, 'w1')];
  assert.match(primeViolation(events, events[0])!, /no \/receive\?after=latest prime/);
});

test('a prime sent after SESSION_ATTACH is rejected, even if it completes later', () => {
  const events = [attach(1, 'w1'), prime(2, 3)];
  assert.match(primeViolation(events, events[0])!, /sent after SESSION_ATTACH/);
});

test('a prime still in flight when SESSION_ATTACH is sent is rejected', () => {
  const events = [prime(1, undefined), attach(2, 'w1')];
  assert.match(primeViolation(events, events[1])!, /did not complete before SESSION_ATTACH/);
});

test('a prime that completes only after SESSION_ATTACH was sent is rejected', () => {
  const events = [prime(1, 3), attach(2, 'w1')];
  assert.match(primeViolation(events, events[1])!, /completed after SESSION_ATTACH/);
});

test('a retry needs its own prime: the first attempt prime cannot satisfy the second attach', () => {
  const events = [prime(1, 2), attach(3, 'w1'), attach(4, 'w2')];
  assert.equal(primeViolation(events, events[1]), null);
  assert.match(primeViolation(events, events[2])!, /predates its previous SESSION_ATTACH|no \/receive/);
});

test('a retry with its own completed prime after the first attach is accepted', () => {
  const events = [prime(1, 2), attach(3, 'w1'), prime(4, 5), attach(6, 'w2')];
  assert.equal(primeViolation(events, events[3]), null);
});

test('another page prime cannot satisfy this page attach', () => {
  const events = [prime(1, 2, 'page-2'), attach(3, 'w1', 'page-1')];
  assert.match(primeViolation(events, events[1])!, /no \/receive\?after=latest prime from this page/);
});

test('a prime for another relay session does not satisfy this attach', () => {
  const events = [prime(1, 2, 'page-1', 'relay-2'), attach(3, 'w1', 'page-1', 'relay-1')];
  assert.match(primeViolation(events, events[1])!, /no \/receive\?after=latest prime/);
});

test('two pages each need their own prime before their own attach', () => {
  const events = [prime(1, 2, 'page-1'), prime(3, 4, 'page-2'), attach(5, 'a', 'page-1'), attach(6, 'b', 'page-2')];
  assert.equal(primeViolation(events, events[2]), null);
  assert.equal(primeViolation(events, events[3]), null);
  const crossed = [prime(1, 2, 'page-1'), attach(3, 'b', 'page-2')];
  assert.notEqual(primeViolation(crossed, crossed[1]), null);
});

test('a prime completed before the previous attach of the same page cannot be reused', () => {
  const events = [prime(1, 2), attach(3, 'w1'), attach(4, 'w2')];
  assert.notEqual(primeViolation(events, events[2]), null);
});

test('an event declared fresh must sit above the snapshot watermark', () => {
  assert.equal(staleEventViolation(2, 3), null);
  assert.equal(staleEventViolation(20, 21), null);
  assert.match(staleEventViolation(2, 2)!, /at or below the snapshot watermark through 2/);
  assert.match(staleEventViolation(1, 1)!, /at or below the snapshot watermark through 1/);
});

test('a replay at or below the watermark is accepted only as an intentional old event, not as fresh', () => {
  assert.notEqual(staleEventViolation(20, 18), null);
  assert.notEqual(staleEventViolation(20, 20), null);
});

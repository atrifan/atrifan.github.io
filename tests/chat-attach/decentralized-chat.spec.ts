import { expect, test } from '@playwright/test';
import {
  ChatHarness,
  assertNoLeaks,
  composerOf,
  headingOf,
  openChat,
  type RecordedRequest,
} from '../support/chat-attach-fixture';

const DEVICE_ID = '00000000-0000-4000-8000-0000000000a1';
const SERVER_TIME = '2026-10-29T09:00:00.000Z';
const MESSAGE_SENTINEL = 'synthetic-chat-content-must-stay-on-direct-channel';

type ControlRequest = { method: string; path: string; body: unknown };

let harness: ChatHarness;
let controlRequests: ControlRequest[];

test.beforeEach(async ({ page }, testInfo) => {
  harness = new ChatHarness(testInfo);
  controlRequests = [];
  harness.annotate();
  await harness.install(page);
  await page.route('**/api/plugin/chat/p2p/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData() ?? null;
    }
    controlRequests.push({ method: request.method(), path: url.pathname, body });

    if (url.pathname === '/api/plugin/chat/p2p/config' && request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'cache-control': 'private, no-store, max-age=0, must-revalidate',
          'cdn-cache-control': 'no-store',
          'vercel-cdn-cache-control': 'no-store',
          'pragma': 'no-cache',
          expires: '0',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
          vary: 'Cookie, Authorization, Origin',
        },
        body: JSON.stringify({ protocol: 2, serverTime: SERVER_TIME, deviceId: DEVICE_ID, ownerUserId: 'owner-A', iceServers: [] }),
      });
      return;
    }

    // This fixture intentionally does not impersonate a paired peer or acknowledge an RTC handshake.
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'pairing_not_found' }) });
  });
});

test.afterEach(() => {
  assertNoLeaks(harness);
});

async function openSyntheticDevice(page: Parameters<typeof openChat>[0]): Promise<void> {
  const device = harness.addDevice({ name: 'Synthetic direct-chat device' });
  device.id = DEVICE_ID;
  await openChat(page, device);
}

test('real ChatApp mount baseline stays runnable in the isolated browser fixture', async ({ page }) => {
  await openSyntheticDevice(page);
  await expect(headingOf(page)).toHaveText('New chat');
  await expect(composerOf(page)).toBeVisible();
  expect(harness.external).toEqual([]);
});

test('fixture health: Chromium exchanges a synthetic frame over a real host-only ordered RTCDataChannel', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const first = new RTCPeerConnection({ iceServers: [] });
    const second = new RTCPeerConnection({ iceServers: [] });
    const label = 'tulzo-chat-p2p-v2';
    const protocol = 'tulzo-chat/2';
    const outgoing = first.createDataChannel(label, { ordered: true, protocol });
    let incoming: RTCDataChannel | null = null;
    let acceptIncoming!: (channel: RTCDataChannel) => void;
    const incomingReady = new Promise<RTCDataChannel>((resolve) => { acceptIncoming = resolve; });
    second.addEventListener('datachannel', (event) => {
      incoming = event.channel;
      acceptIncoming(event.channel);
    }, { once: true });

    const gather = (peer: RTCPeerConnection) => new Promise<void>((resolve, reject) => {
      if (peer.iceGatheringState === 'complete') return resolve();
      const timer = window.setTimeout(() => reject(new Error('ICE gathering exceeded the bounded fixture deadline')), 5_000);
      peer.addEventListener('icegatheringstatechange', () => {
        if (peer.iceGatheringState === 'complete') {
          window.clearTimeout(timer);
          resolve();
        }
      });
    });
    const opened = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('local RTCDataChannel did not open')), 5_000);
      outgoing.addEventListener('open', () => { window.clearTimeout(timer); resolve(); }, { once: true });
    });
    try {
      await first.setLocalDescription(await first.createOffer());
      await gather(first);
      await second.setRemoteDescription(first.localDescription!);
      await second.setLocalDescription(await second.createAnswer());
      await gather(second);
      await first.setRemoteDescription(second.localDescription!);
      await opened;
      const peerChannel = await incomingReady;
      const received = new Promise<string>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('synthetic direct frame was not delivered')), 5_000);
        peerChannel.addEventListener('message', (event) => {
          window.clearTimeout(timer);
          resolve(String(event.data));
        }, { once: true });
      });
      const message = 'synthetic-direct-rtc-fixture-health-only';
      outgoing.send(message);
      const receivedMessage = await received;
      const candidateTypes = (sdp: string | undefined) => [...(sdp ?? '').matchAll(/^a=candidate:.*\btyp (\w+)/gm)].map((match) => match[1]);
      return {
        label: outgoing.label,
        protocol: outgoing.protocol,
        ordered: outgoing.ordered,
        receivedMessage,
        localCandidateTypes: candidateTypes(first.localDescription?.sdp),
        remoteCandidateTypes: candidateTypes(second.localDescription?.sdp),
      };
    } finally {
      outgoing.close();
      (incoming as RTCDataChannel | null)?.close();
      first.close();
      second.close();
    }
  });
  expect(result).toMatchObject({
    label: 'tulzo-chat-p2p-v2',
    protocol: 'tulzo-chat/2',
    ordered: true,
    receivedMessage: 'synthetic-direct-rtc-fixture-health-only',
  });
  expect(result.localCandidateTypes.length).toBeGreaterThan(0);
  expect(new Set(result.localCandidateTypes)).toEqual(new Set(['host']));
  expect(result.remoteCandidateTypes.length).toBeGreaterThan(0);
  expect(new Set(result.remoteCandidateTypes)).toEqual(new Set(['host']));
});

test('selecting a device obtains P2P config before any peer negotiation', async ({ page }) => {
  await openSyntheticDevice(page);
  await expect.poll(() => controlRequests.some((request) => request.path === '/api/plugin/chat/p2p/config' && request.method === 'POST')).toBe(true);
  const configIndex = controlRequests.findIndex((request) => request.path === '/api/plugin/chat/p2p/config');
  const firstNegotiation = controlRequests.findIndex((request) => request.path.endsWith('/viewer/pairs'));
  expect(configIndex).toBeGreaterThanOrEqual(0);
  expect(firstNegotiation === -1 || configIndex < firstNegotiation).toBe(true);
});

test('a submitted browser message does not use a cloud chat route or expose its text there', async ({ page }) => {
  await openSyntheticDevice(page);
  await expect(headingOf(page)).toHaveText('New chat');
  await composerOf(page).fill(MESSAGE_SENTINEL);
  await composerOf(page).press('Enter');

  await expect.poll(() => harness.requests.some((request) => request.method === 'POST')).toBe(true);
  const conversationHttp = harness.requests.filter((request: RecordedRequest) =>
    /^\/api\/plugin\/chat\/(?:sessions(?:\/|$)|send(?:$|\/)|receive$|poll$|emit$)/.test(request.path),
  );
  expect(conversationHttp, 'conversation content and its routing identifiers belong only on the direct DataChannel').toEqual([]);
  expect(JSON.stringify([...harness.requests, ...controlRequests])).not.toContain(MESSAGE_SENTINEL);
});

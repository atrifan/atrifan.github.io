import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveConversation } from '@/src/views/remote-chat/LiveConversation';
import type { LiveRelayClient } from '@/src/views/remote-chat/live-relay-client';

const render = (client: LiveRelayClient | null) => renderToStaticMarkup(createElement(LiveConversation, { row: null, client, retry: () => {}, creating: false }));

describe('live conversation retry row', () => {
  it('shows the unavailable text and the Retry button when there is no client', () => {
    const html = render(null);
    expect(html).toContain('Assistant unavailable. Retry to connect.');
    expect(html).toContain('>Retry</button>');
  });

  it('never shows the Retry text or button once a client is connected', () => {
    const html = render({ authorized: () => true } as unknown as LiveRelayClient);
    expect(html).not.toContain('Retry to connect');
    expect(html).not.toContain('>Retry</button>');
  });
});

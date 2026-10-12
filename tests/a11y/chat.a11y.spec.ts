import AxeBuilder from '@axe-core/playwright';
import { test, expect, chatEnvReady, openChatState, CHAT_STATES } from '../fixtures/chat-page';

/**
 * axe (WCAG 2 A/AA) on every chat state, signed in, in both themes and both viewports
 * (the four themed projects). Any serious or critical violation fails.
 */
test.describe('chat accessibility', () => {
  test.skip(!chatEnvReady(), 'needs Clerk dev keys and Supabase service-role env');
  test.setTimeout(120_000);

  for (const state of CHAT_STATES) {
    test(`chat ${state} has no serious axe violations`, async ({ page, request, device }) => {
      await openChatState(page, request, device, state);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        // Clerk's dev-instance footer badge isn't ours (as in pages.a11y.spec.ts).
        .exclude('.cl-footer')
        .analyze();
      const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        blocking,
        blocking.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`).join('\n'),
      ).toEqual([]);
      // No horizontal scroll at any width.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

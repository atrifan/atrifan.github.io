import { test, expect, chatEnvReady, openChatState, CHAT_STATES } from '../fixtures/chat-page';

/**
 * Visual baselines of the signed-in chat in each reviewed state (empty, conversation,
 * approval card, chats drawer open), in the four themed projects
 * (light/dark x desktop/mobile). Data is seeded through the relay (chat-fixtures).
 */
test.describe('chat visual', () => {
  test.skip(!chatEnvReady(), 'needs Clerk dev keys and Supabase service-role env');
  test.setTimeout(120_000);

  for (const state of CHAT_STATES) {
    test(`chat ${state}`, async ({ page, request, device }) => {
      await openChatState(page, request, device, state);
      await expect(page).toHaveScreenshot(`chat-${state}.png`, {
        fullPage: false,
        // The Clerk avatar is account-specific.
        mask: [page.locator('.user-button')],
      });
    });
  }
});

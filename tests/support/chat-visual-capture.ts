import { expect, type Locator, type Page } from '@playwright/test';

/** Wait for the real drawer animation, rather than capturing its offscreen entrance frame. */
export async function settleChatDrawer(page: Page): Promise<void> {
  const drawer = page.getByRole('dialog', { name: 'Chats', exact: true });
  if (!await drawer.isVisible()) return;
  await expect.poll(() => drawer.evaluate((element) => {
    const backdrop = element.parentElement!;
    return backdrop.getAnimations({ subtree: true }).every((animation) => animation.playState === 'finished');
  }), { message: 'drawer/backdrop entrance animation has not completed' }).toBe(true);
  await expect.poll(async () => Math.abs((await drawer.boundingBox())!.x)).toBeLessThan(1);
  await expect(drawer).toHaveCSS('transform', 'none');
}

/** Keyboard modality plus an observable focus ring, not only programmatic activeElement. */
export async function focusChatControl(page: Page, control: Locator): Promise<void> {
  await page.keyboard.press('Tab');
  await control.focus();
  await expect(control).toBeFocused();
  expect(await control.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
  const ring = await control.evaluate((element) => ({ style: getComputedStyle(element).outlineStyle, width: parseFloat(getComputedStyle(element).outlineWidth) }));
  expect(ring.style).not.toBe('none');
  expect(ring.width).toBeGreaterThanOrEqual(2);
}

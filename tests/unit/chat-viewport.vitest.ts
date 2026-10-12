import { describe, expect, it } from 'vitest';
import { keyboardInset } from '@/src/views/remote-chat/model/viewport';

describe('keyboardInset', () => {
  it('is the part of the layout viewport the on-screen keyboard covers (iOS: layout does not resize)', () => {
    expect(keyboardInset({ layoutHeight: 844, visualHeight: 508, offsetTop: 0 })).toBe(336);
  });

  it('subtracts how far the visual viewport is scrolled down', () => {
    expect(keyboardInset({ layoutHeight: 844, visualHeight: 508, offsetTop: 36 })).toBe(300);
  });

  it('is 0 when the layout already resized for the keyboard (interactive-widget=resizes-content)', () => {
    expect(keyboardInset({ layoutHeight: 508, visualHeight: 508, offsetTop: 0 })).toBe(0);
  });

  it('never goes negative and rounds to whole pixels', () => {
    expect(keyboardInset({ layoutHeight: 500, visualHeight: 520, offsetTop: 0 })).toBe(0);
    expect(keyboardInset({ layoutHeight: 844.4, visualHeight: 844, offsetTop: 0 })).toBe(0);
    expect(keyboardInset({ layoutHeight: 844, visualHeight: 507.6, offsetTop: 0 })).toBe(336);
  });

  it('is 0 for non-finite input (no visualViewport)', () => {
    expect(keyboardInset({ layoutHeight: Number.NaN, visualHeight: 500, offsetTop: 0 })).toBe(0);
    expect(keyboardInset({ layoutHeight: 844, visualHeight: Number.POSITIVE_INFINITY, offsetTop: 0 })).toBe(0);
    expect(keyboardInset({ layoutHeight: 844, visualHeight: 500, offsetTop: Number.NaN })).toBe(0);
  });
});

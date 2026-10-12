'use client';

import { useEffect } from 'react';
import { keyboardInset } from './model/viewport';

/**
 * Keeps `--chat-keyboard` on `el` equal to the height the on-screen keyboard covers,
 * so the composer stays above it on browsers that don't resize the layout for the
 * keyboard (iOS Safari). Chrome on Android resizes the layout (interactive-widget),
 * which makes the inset 0.
 */
export function useKeyboardInset(ref: React.RefObject<HTMLElement>): void {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const el = ref.current;
    if (!vv || !el) return;
    const update = () => {
      const inset = keyboardInset({ layoutHeight: window.innerHeight, visualHeight: vv.height, offsetTop: vv.offsetTop });
      el.style.setProperty('--chat-keyboard', `${inset}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [ref]);
}

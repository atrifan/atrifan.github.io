import { describe, expect, it } from 'vitest';
import {
  THEME_CHOICES,
  THEME_STORAGE_KEY,
  noFlashThemeScript,
  parseThemeChoice,
  resolveScheme,
} from '@/src/lib/theme';

describe('parseThemeChoice', () => {
  it('accepts the three stored choices', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
    expect(parseThemeChoice('system')).toBe('system');
  });

  it('falls back to system for anything else', () => {
    for (const v of [null, undefined, '', 'Dark', 'blue', 1, {}]) {
      expect(parseThemeChoice(v)).toBe('system');
    }
  });
});

describe('resolveScheme', () => {
  it('uses an explicit choice whatever the OS says', () => {
    expect(resolveScheme('light', true)).toBe('light');
    expect(resolveScheme('dark', false)).toBe('dark');
  });

  it('follows the OS for system', () => {
    expect(resolveScheme('system', true)).toBe('dark');
    expect(resolveScheme('system', false)).toBe('light');
  });
});

describe('constants', () => {
  it('exposes the choices in toggle order and a stable storage key', () => {
    expect(THEME_CHOICES).toEqual(['light', 'dark', 'system']);
    expect(THEME_STORAGE_KEY).toBe('tulzo-theme');
  });
});

/** Run the inline script against fake browser globals; return what it set. */
function runScript(stored: string | null, prefersDark: boolean, opts: { throwOnStorage?: boolean } = {}) {
  const attrs: Record<string, string> = {};
  const style: Record<string, string> = {};
  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => {
        attrs[k] = v;
      },
      style,
    },
  };
  const localStorage = {
    getItem: (k: string) => {
      if (opts.throwOnStorage) throw new Error('blocked');
      return k === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const matchMedia = (q: string) => ({ matches: q === '(prefers-color-scheme: dark)' && prefersDark });
  new Function('document', 'localStorage', 'matchMedia', noFlashThemeScript())(document, localStorage, matchMedia);
  return { theme: attrs['data-theme'], choice: attrs['data-theme-choice'], colorScheme: style.colorScheme };
}

describe('noFlashThemeScript', () => {
  it('applies a stored explicit choice', () => {
    expect(runScript('dark', false)).toEqual({ theme: 'dark', choice: 'dark', colorScheme: 'dark' });
    expect(runScript('light', true)).toEqual({ theme: 'light', choice: 'light', colorScheme: 'light' });
  });

  it('follows prefers-color-scheme when nothing valid is stored', () => {
    expect(runScript(null, true)).toEqual({ theme: 'dark', choice: 'system', colorScheme: 'dark' });
    expect(runScript('bogus', false)).toEqual({ theme: 'light', choice: 'system', colorScheme: 'light' });
    expect(runScript('system', true)).toEqual({ theme: 'dark', choice: 'system', colorScheme: 'dark' });
  });

  it('still sets a theme when storage is blocked', () => {
    expect(runScript('dark', true, { throwOnStorage: true })).toEqual({ theme: 'dark', choice: 'system', colorScheme: 'dark' });
  });
});

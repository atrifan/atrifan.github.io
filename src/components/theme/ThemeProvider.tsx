'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  THEME_STORAGE_KEY,
  parseThemeChoice,
  resolveScheme,
  type Scheme,
  type ThemeChoice,
} from '@/src/lib/theme';

/**
 * Theme state lives on <html> (data-theme, data-theme-choice), set before
 * paint by the inline script from src/lib/theme.ts. This provider reads it with
 * useSyncExternalStore (server snapshot: system/light, so hydration is clean),
 * writes it on change, persists the choice in localStorage, and keeps
 * `system` in sync with prefers-color-scheme.
 */

interface ThemeContextValue {
  choice: ThemeChoice;
  scheme: Scheme;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  choice: 'system',
  scheme: 'light',
  setChoice: () => {},
});

const DARK_QUERY = '(prefers-color-scheme: dark)';

function apply(choice: ThemeChoice) {
  const scheme = resolveScheme(choice, window.matchMedia(DARK_QUERY).matches);
  const root = document.documentElement;
  root.setAttribute('data-theme', scheme);
  root.setAttribute('data-theme-choice', choice);
  root.style.colorScheme = scheme;
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-choice'] });
  return () => observer.disconnect();
}

const readChoice = () => parseThemeChoice(document.documentElement.getAttribute('data-theme-choice'));
const readScheme = (): Scheme => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const choice = useSyncExternalStore(subscribe, readChoice, () => 'system' as ThemeChoice);
  const scheme = useSyncExternalStore(subscribe, readScheme, () => 'light' as Scheme);

  const setChoice = useCallback((next: ThemeChoice) => {
    try {
      if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice still applies for this page view.
    }
    apply(next);
  }, []);

  // Follow the OS while the choice is `system`.
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      if (readChoice() === 'system') apply('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const value = useMemo(() => ({ choice, scheme, setChoice }), [choice, scheme, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

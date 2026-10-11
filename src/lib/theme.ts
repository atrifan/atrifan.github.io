/**
 * Theme choice and resolution. Pure; shared by ThemeProvider, ThemeToggle and
 * the no-flash inline script in app/layout.tsx.
 *
 * The stored choice is light | dark | system (localStorage THEME_STORAGE_KEY).
 * The applied scheme, `<html data-theme>`, is light | dark; `system` follows
 * prefers-color-scheme. styles/tokens.css keys every token off data-theme.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';
export type Scheme = 'light' | 'dark';

export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];
export const THEME_STORAGE_KEY = 'tulzo-theme';

export function parseThemeChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveScheme(choice: ThemeChoice, systemPrefersDark: boolean): Scheme {
  if (choice === 'system') return systemPrefersDark ? 'dark' : 'light';
  return choice;
}

/**
 * Inline script for <head>: sets data-theme, data-theme-choice and
 * color-scheme on <html> before first paint, so there is no flash of the
 * wrong theme. Uses only `document`, `localStorage` and `matchMedia`.
 */
export function noFlashThemeScript(): string {
  return `(function(){var c='system';try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s==='light'||s==='dark')c=s;}catch(e){}var t=c==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):c;var d=document.documentElement;d.setAttribute('data-theme',t);d.setAttribute('data-theme-choice',c);d.style.colorScheme=t;})();`;
}

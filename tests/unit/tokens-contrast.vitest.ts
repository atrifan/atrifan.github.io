import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards styles/tokens.css: both themes define the same tokens, the
 * no-JS prefers-color-scheme block matches the dark theme, and every
 * text/background pair passes WCAG AA (4.5:1).
 */
const css = readFileSync(path.resolve(__dirname, '../../styles/tokens.css'), 'utf8');

function block(selectorRe: RegExp): Record<string, string> {
  const m = selectorRe.exec(css);
  if (!m) throw new Error(`block not found: ${selectorRe}`);
  const start = css.indexOf('{', m.index) + 1;
  const body = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/(--color-[a-z0-9-]+):\s*([^;]+);/g)) vars[name] = value.trim();
  return vars;
}

const light = block(/:root,\s*\[data-theme='light'\]\s*\{/);
const dark = block(/\n\[data-theme='dark'\]\s*\{/);
const systemDark = block(/:root:not\(\[data-theme\]\)\s*\{/);

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = ['text', 'text-muted', 'accent', 'success', 'warning', 'danger'];
const BACKGROUNDS = ['bg', 'surface', 'surface-2', 'accent-soft'];
const REQUIRED = [...new Set([...TEXT, ...BACKGROUNDS, 'border', 'accent-contrast', 'focus-ring'])];

describe('styles/tokens.css', () => {
  it('defines the same colour tokens in light and dark', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    for (const name of REQUIRED) expect(light).toHaveProperty(`--color-${name}`);
  });

  it('uses the dark values for prefers-color-scheme: dark when no theme is set', () => {
    expect(systemDark).toEqual(dark);
  });

  it('uses 6-digit hex colours so contrast can be checked', () => {
    for (const v of [...Object.values(light), ...Object.values(dark)]) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
  });

  for (const [name, theme] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    describe(`${name} theme`, () => {
      for (const fg of TEXT) {
        for (const bg of BACKGROUNDS) {
          it(`${fg} on ${bg} is at least 4.5:1`, () => {
            expect(contrast(theme[`--color-${fg}`], theme[`--color-${bg}`])).toBeGreaterThanOrEqual(4.5);
          });
        }
      }

      it('accent-contrast on accent is at least 4.5:1', () => {
        expect(contrast(theme['--color-accent-contrast'], theme['--color-accent'])).toBeGreaterThanOrEqual(4.5);
      });

      it('the focus ring is at least 3:1 against bg and surface', () => {
        expect(contrast(theme['--color-focus-ring'], theme['--color-bg'])).toBeGreaterThanOrEqual(3);
        expect(contrast(theme['--color-focus-ring'], theme['--color-surface'])).toBeGreaterThanOrEqual(3);
      });
    });
  }
});

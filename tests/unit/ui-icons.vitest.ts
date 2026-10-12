import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ArrowLeftIcon, ArrowRightIcon, PauseIcon, withGlyphIcons } from '@/src/components/brand/UiIcons';

const html = (node: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, node));
const svgCount = (markup: string) => markup.split('<svg').length - 1;
/** The text a reader gets: SVG titles count, tags don't. */
const text = (markup: string) => markup.replace(/<[^>]+>/g, '');

describe('inline glyph icons', () => {
  it.each([
    ['←', ArrowLeftIcon],
    ['→', ArrowRightIcon],
    ['⏸', PauseIcon],
  ] as const)('%s is an SVG named after the character it replaces', (glyph, Icon) => {
    const markup = html(createElement(Icon));
    expect(svgCount(markup)).toBe(1);
    expect(markup).toContain(`aria-label="${glyph}"`);
    expect(markup).toContain('role="img"');
    expect(markup).toContain('class="inline-icon"');
  });

  it('is decorative with an empty title', () => {
    const markup = html(createElement(ArrowLeftIcon, { title: '' }));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('aria-label');
    expect(markup).not.toContain('<title>');
  });

  it('keeps an extra class next to inline-icon', () => {
    expect(html(createElement(ArrowRightIcon, { className: 'x' }))).toContain('class="inline-icon x"');
  });
});

describe('withGlyphIcons', () => {
  it('draws every arrow and pause character as an icon and keeps the rest as text', () => {
    const markup = html(withGlyphIcons('Price: €300 → €350 (+€50)'));
    expect(svgCount(markup)).toBe(1);
    expect(markup.replace(/<svg[\s\S]*?<\/svg>/g, '')).not.toContain('→');
    expect(text(markup)).toBe('Price: €300 → €350 (+€50)');
  });

  it('handles several glyphs and glyphs at the ends', () => {
    const markup = html(withGlyphIcons('← a → b ⏸'));
    expect(svgCount(markup)).toBe(3);
    expect(text(markup)).toBe('← a → b ⏸');
  });

  it('returns a string without glyphs unchanged', () => {
    expect(withGlyphIcons('ETA: 5 days')).toBe('ETA: 5 days');
  });
});

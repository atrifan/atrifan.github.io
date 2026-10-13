/**
 * Generate every site icon from the TulzoMark robot (src/components/brand/TulzoMark.tsx).
 *
 *   npm run generate:icons   (tsx with scripts/tsconfig.icons.json: the mark is JSX, the automatic runtime)
 *
 * The robot is rendered straight from the React mark, drawn in the accent colour on a rounded
 * accent-soft tile (light tokens), which reads on light and dark browser tabs alike. Writes:
 * - app/icon.svg          the SVG favicon (Next file convention)
 * - app/favicon.ico       16, 32 and 48 px PNGs in one ICO
 * - app/apple-icon.png    180x180 (Next file convention: the apple-touch-icon link)
 * - public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png (manifest.json)
 * Re-run after changing the mark or the tokens below.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { TulzoMark } from '../src/components/brand/TulzoMark';
import { encodeIco } from './ico';

/** Light-theme tokens (styles/tokens.css): --color-accent on --color-accent-soft. */
const ICON_ACCENT = '#6b4fb3';
const ICON_TILE = '#eee9fa';

const root = path.resolve(__dirname, '..');

/** The robot's inner SVG (no wrapper), with the theme colour and plain (scaling) strokes. */
function robotMarkup(): string {
  const svg = renderToStaticMarkup(createElement(TulzoMark, { size: 100 }));
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return inner.replace(/ vector-effect="non-scaling-stroke"/g, '').replace(/currentColor/g, ICON_ACCENT);
}

/** The robot's box on the mark's 100x100 grid (antenna dot top to feet). */
const ROBOT = { cx: 50, cy: 44.5 };

interface TileOptions {
  /** Robot size relative to the tile. */
  scale: number;
  /** Stroke width in output px at `size`. */
  strokePx: number;
  /** Output size the stroke is tuned for. */
  size: number;
  /** Rounded tile (favicons) or full bleed (maskable: the OS crops it). */
  rounded: boolean;
}

function tileSvg({ scale, strokePx, size, rounded }: TileOptions): string {
  const stroke = +((strokePx * 100) / (size * scale)).toFixed(2);
  const rx = rounded ? 22 : 0;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    `<rect width="100" height="100" rx="${rx}" fill="${ICON_TILE}"/>`,
    `<g transform="translate(50 50) scale(${scale}) translate(${-ROBOT.cx} ${-ROBOT.cy})" fill="none" stroke="${ICON_ACCENT}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">`,
    robotMarkup(),
    '</g>',
    '</svg>',
  ].join('');
}

/** Stroke in px: heavier at favicon sizes so 16px stays legible. */
function strokePxFor(size: number): number {
  if (size <= 16) return 1.25;
  if (size <= 32) return 2.4;
  return Math.max(3, size / 16);
}

function png(size: number, opts: Partial<TileOptions> = {}): Buffer {
  const svg = tileSvg({ scale: size <= 16 ? 0.94 : 0.82, strokePx: strokePxFor(size), size, rounded: true, ...opts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

function main(): void {
  const out = (rel: string, data: Buffer | string) => {
    writeFileSync(path.join(root, rel), data);
    console.log('wrote', rel);
  };
  out('app/icon.svg', tileSvg({ scale: 0.82, strokePx: 2.4, size: 32, rounded: true }) + '\n');
  out('app/favicon.ico', encodeIco([16, 32, 48].map((size) => ({ size, data: png(size) }))));
  out('app/apple-icon.png', png(180, { rounded: false }));
  out('public/icon-192.png', png(192));
  out('public/icon-512.png', png(512));
  // Maskable: full-bleed tile, the robot inside the central 80% safe zone.
  out('public/icon-maskable-512.png', png(512, { scale: 0.6, rounded: false }));
}

main();

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { blockThirdParty } from './surface-helpers';

/**
 * Site icons contract: /favicon.ico (16, 32 and 48px images), /icon.svg, /apple-icon.png (180x180), the
 * apple-touch-icon and manifest links in <head>, and /manifest.json (theme/background colours, 192 and 512
 * PNG icons, a 512 maskable one), every icon URL serving what it declares. The old tulzo-logo files are gone.
 */

test.use({ storageState: { cookies: [], origins: [] } });

/** Width/height from a PNG's IHDR chunk. */
function pngSize(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'PNG signature').toBe(true);
  expect(buf.subarray(12, 16).toString('ascii'), 'first chunk is IHDR').toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** The image sizes listed in an ICO directory ("WxH"; a 0 byte means 256). */
function icoSizes(buf: Buffer): string[] {
  expect(buf.readUInt16LE(0), 'ICONDIR reserved').toBe(0);
  expect(buf.readUInt16LE(2), 'ICONDIR type 1 = icon').toBe(1);
  const count = buf.readUInt16LE(4);
  expect(buf.length).toBeGreaterThanOrEqual(6 + 16 * count);
  const sizes: string[] = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + 16 * i;
    const w = buf[at] || 256;
    const h = buf[at + 1] || 256;
    sizes.push(`${w}x${h}`);
  }
  return sizes;
}

const contentType = (headers: Record<string, string>) => (headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();

async function headHrefs(page: Page, rel: string): Promise<string[]> {
  return page.locator(`head link[rel="${rel}"]`).evaluateAll((els) => els.map((el) => (el as HTMLLinkElement).href));
}

async function expectPng(request: APIRequestContext, url: string, width: number, height: number) {
  const res = await request.get(url);
  expect(res.status(), url).toBe(200);
  expect(contentType(res.headers()), url).toBe('image/png');
  expect(pngSize(await res.body()), url).toEqual({ width, height });
}

type ManifestIcon = { src: string; sizes?: string; type?: string; purpose?: string };
type Manifest = { theme_color?: string; background_color?: string; icons?: ManifestIcon[] };

test('/favicon.ico is an ICO with 16x16, 32x32 and 48x48 images', async ({ request }) => {
  const res = await request.get('/favicon.ico');
  expect(res.status()).toBe(200);
  expect(['image/x-icon', 'image/vnd.microsoft.icon']).toContain(contentType(res.headers()));
  const sizes = icoSizes(await res.body());
  for (const s of ['16x16', '32x32', '48x48']) expect(sizes, JSON.stringify(sizes)).toContain(s);
});

test('/icon.svg is an SVG', async ({ request }) => {
  const res = await request.get('/icon.svg');
  expect(res.status()).toBe(200);
  expect(contentType(res.headers())).toBe('image/svg+xml');
  expect(await res.text()).toContain('<svg');
});

test('/apple-icon.png is a 180x180 PNG', async ({ request }) => {
  await expectPng(request, '/apple-icon.png', 180, 180);
});

test('the home page links an apple-touch-icon that is a 180x180 PNG', async ({ page, request }) => {
  await blockThirdParty(page);
  await page.goto('/');
  const hrefs = await headHrefs(page, 'apple-touch-icon');
  expect(hrefs.length, 'an apple-touch-icon link').toBeGreaterThan(0);
  for (const href of hrefs) await expectPng(request, href, 180, 180);
});

for (const source of ['/manifest.json', '<link rel=manifest> on /'] as const) {
  test(`manifest (${source}) has colours and 192/512/maskable PNG icons that match their sizes`, async ({ page, request }) => {
    let url: string = '/manifest.json';
    if (source !== '/manifest.json') {
      await blockThirdParty(page);
      await page.goto('/');
      const hrefs = await headHrefs(page, 'manifest');
      expect(hrefs, 'exactly one manifest link').toHaveLength(1);
      url = hrefs[0];
    }
    const res = await request.get(url);
    expect(res.status(), url).toBe(200);
    const manifest = JSON.parse(await res.text()) as Manifest;
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    const icons = manifest.icons ?? [];
    const ctx = JSON.stringify(icons);
    expect(icons.some((i) => i.sizes === '192x192' && i.type === 'image/png'), `192x192 png in ${ctx}`).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.type === 'image/png'), `512x512 png in ${ctx}`).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && (i.purpose ?? '').split(/\s+/).includes('maskable')), `512 maskable in ${ctx}`).toBe(
      true,
    );
    const base = new URL(url, res.url());
    for (const icon of icons) {
      const iconUrl = new URL(icon.src, base).toString();
      const r = await request.get(iconUrl);
      expect(r.status(), iconUrl).toBe(200);
      if (icon.type) expect(contentType(r.headers()), iconUrl).toBe(icon.type);
      if (icon.type === 'image/png' && icon.sizes) {
        const [w, h] = icon.sizes.split('x').map(Number);
        expect(pngSize(await r.body()), iconUrl).toEqual({ width: w, height: h });
      }
    }
  });
}

test('no icon link or the manifest references tulzo-logo, and the old logo files are gone', async ({ page, request }) => {
  await blockThirdParty(page);
  await page.goto('/');
  const iconHrefs = await page
    .locator('head link[rel~="icon"], head link[rel="apple-touch-icon"], head link[rel="manifest"], head link[rel="mask-icon"]')
    .evaluateAll((els) => els.map((el) => (el as HTMLLinkElement).href));
  for (const href of iconHrefs) expect(href).not.toMatch(/tulzo-logo/);
  const manifest = await request.get('/manifest.json');
  if (manifest.status() === 200) expect(await manifest.text()).not.toMatch(/tulzo-logo/);
  for (const path of ['/tulzo-logo.png', '/tulzo-logo.svg']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

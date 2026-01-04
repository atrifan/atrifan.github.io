import { NextResponse } from 'next/server';

const BASE_URL = 'https://tulzo.vercel.app';

// All tool routes
const TOOL_ROUTES = [
  '',           // home
  '/age',
  '/blood',
  '/brain',
  '/convert',
  '/cut',
  '/cycle',
  '/days',
  '/decide',
  '/docs/tools',
  '/eclipse',
  '/flip',
  '/luck',
  '/match',
  '/names',
  '/percent',
  '/pricing',
  '/risk',
  '/sleep',
  '/spin',
  '/stack',
  '/tap',
  '/tip',
  '/unique',
  '/vibe',
  '/when',
  '/zone',
];

export async function GET() {
  const currentDate = new Date().toISOString();

  const urls = TOOL_ROUTES.map((route) => {
    const priority = route === '' ? '1.0' : '0.8';
    return `
  <url>
    <loc>${BASE_URL}${route}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}


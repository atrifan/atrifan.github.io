import { MetadataRoute } from 'next';

const BASE_URL = 'https://tulzo.vercel.app';

// All tool routes
const TOOL_ROUTES = [
  '',           // home
  '/age',
  '/brain',
  '/convert',
  '/cut',
  '/cycle',
  '/days',
  '/decide',
  '/flip',
  '/luck',
  '/match',
  '/names',
  '/percent',
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

export default function sitemap(): MetadataRoute.Sitemap {
  const currentDate = new Date().toISOString();

  return TOOL_ROUTES.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: currentDate,
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1 : 0.8,
  }));
}


import { redirect } from 'next/navigation';
import { surfaceUrl } from '@/src/lib/surface-url';

// Rendered per request so the redirect is a real HTTP redirect. A prerendered (static) page
// would send the HTML for /dashboard and only then navigate on the client, after the page
// was already interactive (e.g. a Menu opened on /dashboard closed itself).
export const dynamic = 'force-dynamic';

/** The old control panel URL: it now lives on the ai surface (`/ai` locally, ai.tulzo.online). */
export default function Dashboard() {
  redirect(surfaceUrl('ai', '/'));
}

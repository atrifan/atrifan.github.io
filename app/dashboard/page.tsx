import { redirect } from 'next/navigation';
import { surfaceUrl } from '@/src/lib/surface-url';

/** The old control panel URL: it now lives on the ai surface (`/ai` locally, ai.tulzo.online). */
export default function Dashboard() {
  redirect(surfaceUrl('ai', '/'));
}

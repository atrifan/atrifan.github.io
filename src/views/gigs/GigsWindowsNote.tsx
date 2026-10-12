/**
 * The one-line dispute and claim windows (src/lib/legal/facts.ts gigsWindowsNotice), with a link
 * to the payments policy. The text is built on the server from the env-backed day counts.
 */
import { surfaceUrl } from '@/src/lib/surface-url';

export function GigsWindowsNote({ text }: { text: string }) {
  return (
    <p className="gigs-hint gigs-windows-note">
      {text} <a href={surfaceUrl('hub', '/legal/payments')}>Payments, credits and refunds</a>
    </p>
  );
}

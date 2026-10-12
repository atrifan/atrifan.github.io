import { redirect } from 'next/navigation';
import { surfaceUrl } from '@/src/lib/surface-url';

/** Complaints live in the support inbox, filtered (src/views/hub/AdminInboxView.tsx). */
export default function AdminComplaints() {
  redirect(surfaceUrl('hub', '/admin/inbox?source=complaint'));
}

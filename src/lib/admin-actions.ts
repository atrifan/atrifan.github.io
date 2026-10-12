'use server';

import { isAdmin } from './admin';

/**
 * Is the signed-in viewer an admin? For the shell's "Admin" menu entry (src/components/shell/AppShell.tsx).
 * Computed on the server by the src/lib/admin.ts rule; only the boolean reaches the browser, never the
 * admin list. A server action rather than a root-layout prop: reading the session in the root layout
 * would render every page per request, including the ones prerendered today.
 */
export async function viewerIsAdmin(): Promise<boolean> {
  try {
    return await isAdmin();
  } catch {
    return false;
  }
}

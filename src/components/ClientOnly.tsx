'use client';

import { useEffect, useState } from 'react';

/**
 * Renders children only after mount. Used by the large signed-in views
 * (control panel, package admin, remote chat) that read browser APIs during
 * render; they were client-only before the shell became server-rendered.
 */
export function ClientOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

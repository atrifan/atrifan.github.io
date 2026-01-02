'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Declare gtag on window
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Analytics component that tracks page views on route changes
 * Uses Next.js navigation hooks
 */
export function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Send page view to Google Analytics on route change
    if (window.gtag) {
      const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
      window.gtag('config', 'G-QSNTL3PGRJ', {
        page_path: url,
      });
    }
  }, [pathname, searchParams]);

  return null;
}


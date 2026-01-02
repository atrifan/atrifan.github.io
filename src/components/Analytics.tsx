import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Declare gtag on window
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Analytics component that tracks page views on route changes
 * Must be placed inside a Router component
 */
export function Analytics() {
  const location = useLocation();

  useEffect(() => {
    // Send page view to Google Analytics on route change
    if (window.gtag) {
      window.gtag('config', 'G-QSNTL3PGRJ', {
        page_path: location.pathname + location.hash,
      });
    }
  }, [location]);

  return null;
}


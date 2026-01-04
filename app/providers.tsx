'use client';

import { useState, useEffect, Suspense } from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { Analytics } from '@/src/components/Analytics';
import { Header } from '@/src/components/Header';

interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * Client-side providers wrapper
 * Uses a two-phase render to avoid hydration mismatches:
 * 1. Server and initial client render: empty div (matches perfectly)
 * 2. After mount: full app with Provider
 */
export function Providers({ children }: ProvidersProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Immediate mount
    setMounted(true);
  }, []);

  // Show loading state only on server/initial render
  // This should transition immediately on client
  if (!mounted) {
    return (
      <div
        id="app-loading"
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f472b6 100%)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <Provider theme={defaultTheme} colorScheme="dark">
      <Suspense fallback={null}>
        <Analytics />
      </Suspense>
      <Header />
      {children}
    </Provider>
  );
}


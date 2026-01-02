'use client';

import dynamic from 'next/dynamic';

const HomePage = dynamic(() => import('@/src/views/HomePage').then(mod => mod.HomePage), {
  ssr: false,
  loading: () => (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    }} />
  ),
});

export default function Home() {
  return <HomePage />;
}


'use client';

import dynamic from 'next/dynamic';

const VibePage = dynamic(() => import('@/src/views/VibePage').then(mod => mod.VibePage), {
  ssr: false,
});

export default function Vibe() {
  return <VibePage />;
}

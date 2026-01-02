'use client';

import dynamic from 'next/dynamic';

const LuckPage = dynamic(() => import('@/src/views/LuckPage').then(mod => mod.LuckPage), {
  ssr: false,
});

export default function Luck() {
  return <LuckPage />;
}

'use client';

import dynamic from 'next/dynamic';

const DecidePage = dynamic(() => import('@/src/views/DecidePage').then(mod => mod.DecidePage), {
  ssr: false,
});

export default function Decide() {
  return <DecidePage />;
}

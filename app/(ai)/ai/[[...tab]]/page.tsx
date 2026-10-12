import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AiTabView } from '@/src/views/ai/AiTabView';
import { findTab, tabTitle } from '@/src/lib/ai-tabs';

interface Props {
  params: { tab?: string[] };
}

export function generateMetadata({ params }: Props): Metadata {
  const tab = findTab(params.tab);
  return {
    title: { absolute: tab ? tabTitle(tab) : 'Page not found' },
    robots: { index: false, follow: false },
  };
}

/** One URL per control-panel section (src/lib/ai-tabs.ts); anything else is a 404. */
export default function AiSectionPage({ params }: Props) {
  const tab = findTab(params.tab);
  if (!tab) notFound();
  return <AiTabView slug={tab.slug} />;
}

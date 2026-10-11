import { SURFACE_ICON } from '../components/brand/SurfaceIcons';
import type { Surface } from '../lib/surface-url';

const COPY: Record<'ai' | 'marketplace' | 'gigs', { title: string; lede: string }> = {
  ai: { title: 'AI', lede: 'API keys, devices, usage and agent diagnostics for your assistant.' },
  marketplace: { title: 'Marketplace', lede: 'Skills, MCP servers, A2A agents and plugins you can install in one click.' },
  gigs: { title: 'Gigs', lede: 'Post a software job, compare bids from AI agents and pay on delivery.' },
};

/** Placeholder home for a surface that later tracks will build out. */
export function SurfaceComingSoon({ surface }: { surface: Exclude<Surface, 'hub' | 'chat'> }) {
  const Icon = SURFACE_ICON[surface];
  const { title, lede } = COPY[surface];
  return (
    <div className="page surface-home">
      <section className="hero">
        <Icon size={72} className="hero-mark" />
        <h1 className="hero-title">{title}</h1>
        <p className="eyebrow">Coming soon</p>
        <p className="hero-lede">{lede}</p>
      </section>
    </div>
  );
}

export const comingSoonTitle = (surface: keyof typeof COPY) => `${COPY[surface].title}: Coming soon`;

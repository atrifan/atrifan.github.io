'use client';

import Link from 'next/link';
import { AI_MODELS, LOCAL_EMBEDDING_MODEL, REMOTE_EMBEDDING_MODELS } from '@/src/config/ai-tokens.config';
import type { AIModel, EmbeddingModel } from '@/src/config/ai-tokens.config';

interface ModelsPageProps {
  isPro: boolean;
  isPlus: boolean;
}

const formatCost = (cost: number) => cost === 0 ? 'Free' : `$${cost.toFixed(2)}`;
const formatContext = (ctx: number) => ctx >= 1000000 ? `${(ctx / 1000000).toFixed(1)}M` : `${Math.round(ctx / 1000)}K`;

const getTierBadge = (tier: string, userTier: string) => {
  const colors: Record<string, { bg: string; text: string }> = {
    free: { bg: '#10b981', text: '#fff' },
    pro: { bg: '#3b82f6', text: '#fff' },
    plus: { bg: '#8b5cf6', text: '#fff' },
  };
  const hasAccess = tier === 'free' || (tier === 'pro' && (userTier === 'pro' || userTier === 'plus')) || (tier === 'plus' && userTier === 'plus');
  const style = colors[tier] || colors.free;
  return (
    <span style={{ 
      background: hasAccess ? style.bg : '#6b7280', 
      color: style.text, 
      padding: '2px 8px', 
      borderRadius: '4px', 
      fontSize: '0.7rem', 
      fontWeight: 600,
      opacity: hasAccess ? 1 : 0.6,
    }}>
      {tier.toUpperCase()} {!hasAccess && '🔒'}
    </span>
  );
};

const ModelCard = ({ model, userTier }: { model: AIModel; userTier: string }) => (
  <div style={{ background: 'rgba(30,30,40,0.8)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.5rem' }}>{model.icon}</span>
        <div>
          <div style={{ fontWeight: 600, color: '#fff' }}>{model.name}</div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{model.provider}</div>
        </div>
      </div>
      {getTierBadge(model.tier, userTier)}
    </div>
    <p style={{ fontSize: '0.8rem', color: '#d1d5db', marginBottom: '0.75rem' }}>{model.description}</p>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '6px' }}>
        <div style={{ color: '#9ca3af' }}>Input Cost/1M</div>
        <div style={{ color: '#10b981', fontWeight: 600 }}>{formatCost(model.inputCostPer1M)}</div>
      </div>
      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '6px' }}>
        <div style={{ color: '#9ca3af' }}>Output Cost/1M</div>
        <div style={{ color: '#f59e0b', fontWeight: 600 }}>{formatCost(model.outputCostPer1M)}</div>
      </div>
      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '6px' }}>
        <div style={{ color: '#9ca3af' }}>Context Window</div>
        <div style={{ color: '#3b82f6', fontWeight: 600 }}>{formatContext(model.contextWindow)}</div>
      </div>
      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '6px' }}>
        <div style={{ color: '#9ca3af' }}>Max Output</div>
        <div style={{ color: '#a78bfa', fontWeight: 600 }}>{model.maxOutput ? formatContext(model.maxOutput) : 'N/A'}</div>
      </div>
    </div>
  </div>
);

const EmbeddingCard = ({ model, userTier }: { model: EmbeddingModel; userTier: string }) => (
  <div style={{ background: 'rgba(30,30,40,0.8)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.5rem' }}>{model.icon}</span>
        <div>
          <div style={{ fontWeight: 600, color: '#fff' }}>{model.name}</div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{model.provider} {model.isLocal && '• Local'}</div>
        </div>
      </div>
      {getTierBadge(model.tier, userTier)}
    </div>
    <p style={{ fontSize: '0.8rem', color: '#d1d5db', marginBottom: '0.75rem' }}>{model.description}</p>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '6px' }}>
        <div style={{ color: '#9ca3af' }}>Cost/1M Tokens</div>
        <div style={{ color: '#10b981', fontWeight: 600 }}>{formatCost(model.costPer1M)}</div>
      </div>
      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '6px' }}>
        <div style={{ color: '#9ca3af' }}>Dimensions</div>
        <div style={{ color: '#3b82f6', fontWeight: 600 }}>{model.dimensions}</div>
      </div>
    </div>
  </div>
);

export function ModelsPage({ isPro, isPlus }: ModelsPageProps) {
  const userTier = isPlus ? 'plus' : isPro ? 'pro' : 'free';
  const allEmbeddings = [LOCAL_EMBEDDING_MODEL, ...REMOTE_EMBEDDING_MODELS];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)', padding: '2rem' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <Link href="/dashboard" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: '0.9rem' }}>← Back to Dashboard</Link>
          <h1 style={{ color: '#fff', fontSize: '2rem', margin: '0.5rem 0' }}>🔍 AI Models & Costs</h1>
          <p style={{ color: '#9ca3af' }}>Your tier: <span style={{ color: userTier === 'plus' ? '#8b5cf6' : userTier === 'pro' ? '#3b82f6' : '#10b981', fontWeight: 600 }}>{userTier.toUpperCase()}</span></p>
        </div>

        <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>💬 Chat Models ({AI_MODELS.length})</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {AI_MODELS.map(model => <ModelCard key={model.id} model={model} userTier={userTier} />)}
        </div>

        <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>📊 Embedding Models ({allEmbeddings.length})</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {allEmbeddings.map(model => <EmbeddingCard key={model.id} model={model} userTier={userTier} />)}
        </div>
      </div>
    </div>
  );
}


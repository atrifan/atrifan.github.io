'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { View } from '@adobe/react-spectrum';
import { BackToTools } from '@/src/components/BackToTools';
import { Footer } from '@/src/components/Footer';
import { UpgradeModal } from '@/src/components/UpgradeModal';
import { AdBanner } from '@/src/components/AdBanner';
import { SideAds } from '@/src/components/SideAds';
import { FaviconImage } from '@/src/components/FaviconImage';
import { ADS_CONFIG } from '@/src/config/ads.config';
import { formatCurrency, formatTokenCount } from '@/src/config/ai-tokens.config';
import { applySEO } from '@/src/utils/seo';

interface AnalyticsData {
  summary: {
    totalMessages: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCost: number;
    totalRagTokens: number;
    totalHistoryTokens: number;
    totalRecentHistoryTokens: number;
    totalPersonaTokens: number;
    ragUsageCount: number;
    historyUsageCount: number;
    personaUsageCount: number;
    uniqueModels: number;
    uniqueDays: number;
  };
  modelBreakdown: Array<{
    modelId: string;
    modelName: string;
    modelIcon: string;
    modelIconUrl?: string;
    modelAgentUrl?: string;
    isAgent: boolean;
    messages: number;
    tokens: number;
    cost: number;
  }>;
  contextBreakdown: {
    rag: { tokens: number; percent: number };
    history: { tokens: number; percent: number };
    recentHistory: { tokens: number; percent: number };
    persona: { tokens: number; percent: number };
    query: { tokens: number; percent: number };
    total: number;
  };
  dailyTrend: Array<{ date: string; messages: number; tokens: number; cost: number }>;
  dateRange: { startDate: string; endDate: string };
}

interface AnalyticsPageProps {
  isLoggedIn: boolean;
  isPro: boolean;
  isPlus: boolean;
}

// Simple bar chart component with optional icon support
interface BarChartItem {
  label: string;
  value: number;
  color: string;
  iconUrl?: string;
  agentUrl?: string;
  isAgent?: boolean;
}

const BarChart: React.FC<{ data: Array<BarChartItem>; maxValue?: number }> = ({ data, maxValue }) => {
  const max = maxValue || Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {data.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '100px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
            {item.isAgent ? (
              <FaviconImage
                iconUrl={item.iconUrl}
                baseUrl={item.agentUrl}
                size={14}
                fallbackEmoji={item.label.split(' ')[0]}
              />
            ) : (
              <span>{item.label.split(' ')[0]}</span>
            )}
            <span>{item.label.split(' ').slice(1).join(' ')}</span>
          </div>
          <div style={{ flex: 1, height: '20px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(item.value / max) * 100}%`, height: '100%', background: item.color, borderRadius: '4px', transition: 'width 0.3s' }} />
          </div>
          <div style={{ width: '60px', fontSize: '0.75rem', color: item.color, fontWeight: 600 }}>
            {typeof item.value === 'number' && item.value < 1000 ? item.value.toFixed(2) : formatTokenCount(item.value)}
          </div>
        </div>
      ))}
    </div>
  );
};

// Pie/Donut chart component
const DonutChart: React.FC<{ data: Array<{ label: string; value: number; color: string }>; size?: number }> = ({ data, size = 120 }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}>No data</div>;
  
  let currentAngle = 0;
  const segments = data.map(item => {
    const angle = (item.value / total) * 360;
    const segment = { ...item, startAngle: currentAngle, endAngle: currentAngle + angle };
    currentAngle += angle;
    return segment;
  });

  const radius = size / 2;
  const innerRadius = radius * 0.6;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => {
        const startRad = (seg.startAngle - 90) * (Math.PI / 180);
        const endRad = (seg.endAngle - 90) * (Math.PI / 180);
        const largeArc = seg.endAngle - seg.startAngle > 180 ? 1 : 0;
        
        const x1 = radius + radius * Math.cos(startRad);
        const y1 = radius + radius * Math.sin(startRad);
        const x2 = radius + radius * Math.cos(endRad);
        const y2 = radius + radius * Math.sin(endRad);
        const x3 = radius + innerRadius * Math.cos(endRad);
        const y3 = radius + innerRadius * Math.sin(endRad);
        const x4 = radius + innerRadius * Math.cos(startRad);
        const y4 = radius + innerRadius * Math.sin(startRad);

        return (
          <path
            key={i}
            d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`}
            fill={seg.color}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
};

// Line chart for daily trend with Y-axis
const LineChart: React.FC<{ data: Array<{ date: string; value: number }>; color: string; height?: number; formatValue?: (v: number) => string }> = ({ data, color, height = 100, formatValue }) => {
  if (data.length === 0) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}>No data</div>;

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const minValue = Math.min(...data.map(d => d.value), 0);
  const chartWidth = 100;
  const leftPadding = 0; // We'll show labels outside the SVG

  const points = data.map((d, i) => ({
    x: leftPadding + (i / Math.max(data.length - 1, 1)) * (chartWidth - leftPadding),
    y: height - 10 - ((d.value - minValue) / (maxValue - minValue || 1)) * (height - 30),
    value: d.value,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${chartWidth} ${height - 10} L ${leftPadding} ${height - 10} Z`;

  const format = formatValue || ((v: number) => v < 1 ? v.toFixed(4) : v < 1000 ? v.toFixed(2) : formatTokenCount(v));

  return (
    <div style={{ position: 'relative' }}>
      {/* Y-axis labels */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 20, width: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', textAlign: 'right', paddingRight: '4px' }}>
        <span>{format(maxValue)}</span>
        <span>{format((maxValue + minValue) / 2)}</span>
        <span>{format(minValue)}</span>
      </div>
      <div style={{ marginLeft: '55px' }}>
        <svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="none">
          {/* Grid lines */}
          <line x1="0" y1={height - 10} x2={chartWidth} y2={height - 10} stroke="rgba(255,255,255,0.1)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1={(height - 10) / 2} x2={chartWidth} y2={(height - 10) / 2} stroke="rgba(255,255,255,0.05)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="4 4" />
          <line x1="0" y1="10" x2={chartWidth} y2="10" stroke="rgba(255,255,255,0.05)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="4 4" />
          <defs>
            <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#gradient-${color.replace('#', '')})`} />
          <path d={pathD} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
    </div>
  );
};

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ isLoggedIn, isPro, isPlus }) => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [viewMode, setViewMode] = useState<'overview' | 'models' | 'context' | 'trends'>('overview');

  const canAccess = isPro || isPlus;

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const response = await fetch(`/api/ai/analytics?startDate=${startDate.toISOString().split('T')[0]}`);
      if (!response.ok) throw new Error('Failed to fetch analytics');

      const data = await response.json();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    applySEO('analytics');
    if (canAccess) {
      fetchAnalytics();
    }
  }, [canAccess, fetchAnalytics]);

  // Show upgrade modal for non-Pro users
  if (!canAccess) {
    return (
      <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
        <UpgradeModal isOpen={true} title="Analytics - Pro Feature" featureName="Usage Analytics" showCloseButton={false} />
        <View maxWidth="56rem" marginX="auto" UNSAFE_style={{ filter: 'blur(8px)', pointerEvents: 'none' }}>
          <div style={{ marginBottom: '2rem' }}><BackToTools /></div>
          <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 4rem)', fontWeight: 900, background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #3b82f6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textAlign: 'center' }}>ANALYTICS</h1>
        </View>
        <Footer />
      </View>
    );
  }

  const modelColors = ['#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#ec4899'];
  const contextColors = {
    rag: '#a78bfa',
    history: '#60a5fa',
    recentHistory: '#34d399',
    persona: '#fbbf24',
    query: '#f87171',
  };

  return (
    <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
      {/* Side Ads - Desktop only */}
      <SideAds
        leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
        leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
        leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
        rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
        rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
        rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
      />

      <View maxWidth="56rem" marginX="auto">
        <div style={{ marginBottom: '1.5rem' }}><BackToTools /></div>

        {/* Top Ad */}
        <AdBanner slot={ADS_CONFIG.slots.analyticsTop} style={{ marginBottom: '1.5rem' }} />

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 3rem)', fontWeight: 900, background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #3b82f6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="url(#analyticsGradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <defs>
                <linearGradient id="analyticsGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="50%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
              <polyline points="3 17 9 11 13 15 21 7" />
              <polyline points="17 7 21 7 21 11" />
            </svg>
            <span>USAGE ANALYTICS</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'clamp(0.85rem, 2vw, 1rem)' }}>
            Track your AI usage, costs, and context breakdown
          </p>
        </div>

        {/* Date Range & View Mode Selector */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0.25rem' }}>
            {(['7d', '30d', '90d', 'all'] as const).map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: dateRange === range ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'transparent',
                  color: dateRange === range ? '#fff' : 'rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }}
              >
                {range === 'all' ? 'All Time' : range}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0.25rem' }}>
            {(['overview', 'models', 'context', 'trends'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: viewMode === mode ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'transparent',
                  color: viewMode === mode ? '#fff' : 'rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  textTransform: 'capitalize',
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {isLoading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.6)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
            Loading analytics...
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#ef4444' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>❌</div>
            {error}
          </div>
        )}

        {analytics && !isLoading && (
          <>
            {/* Overview Mode */}
            {viewMode === 'overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                {/* Summary Cards */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '1rem' }}>💬 Messages</h3>
                  <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#8b5cf6' }}>{analytics.summary.totalMessages.toLocaleString()}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{analytics.summary.uniqueDays} active days</div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '1rem' }}>🔤 Tokens</h3>
                  <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#10b981' }}>{formatTokenCount(analytics.summary.totalTokens)}</div>
                  <div style={{ display: 'flex', gap: '1rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                    <span>↑ {formatTokenCount(analytics.summary.totalInputTokens)}</span>
                    <span>↓ {formatTokenCount(analytics.summary.totalOutputTokens)}</span>
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '1rem' }}>💰 Cost</h3>
                  <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#f59e0b' }}>{formatCurrency(analytics.summary.totalCost)}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{analytics.summary.uniqueModels} models used</div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '1rem' }}>🧠 Context Usage</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <div><span style={{ color: contextColors.rag }}>📚 RAG:</span> <span style={{ color: '#fff' }}>{analytics.summary.ragUsageCount}</span></div>
                    <div><span style={{ color: contextColors.history }}>📜 History:</span> <span style={{ color: '#fff' }}>{analytics.summary.historyUsageCount}</span></div>
                    <div><span style={{ color: contextColors.persona }}>🎭 Persona:</span> <span style={{ color: '#fff' }}>{analytics.summary.personaUsageCount}</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Models Mode */}
            {viewMode === 'models' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '1.5rem' }}>
                {/* Model Cost Breakdown */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1.5rem' }}>💰 Cost by Model</h3>
                  <BarChart
                    data={analytics.modelBreakdown.map((m, i) => ({
                      label: m.modelIcon + ' ' + m.modelName.split(' ')[0],
                      value: m.cost,
                      color: modelColors[i % modelColors.length],
                      iconUrl: m.modelIconUrl,
                      agentUrl: m.modelAgentUrl,
                      isAgent: m.isAgent,
                    }))}
                  />
                </div>

                {/* Model Token Breakdown */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1.5rem' }}>🔤 Tokens by Model</h3>
                  <BarChart
                    data={analytics.modelBreakdown.map((m, i) => ({
                      label: m.modelIcon + ' ' + m.modelName.split(' ')[0],
                      value: m.tokens,
                      color: modelColors[i % modelColors.length],
                      iconUrl: m.modelIconUrl,
                      agentUrl: m.modelAgentUrl,
                      isAgent: m.isAgent,
                    }))}
                  />
                </div>

                {/* Model Messages Breakdown */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1.5rem' }}>💬 Messages by Model</h3>
                  <BarChart
                    data={analytics.modelBreakdown.map((m, i) => ({
                      label: m.modelIcon + ' ' + m.modelName.split(' ')[0],
                      value: m.messages,
                      color: modelColors[i % modelColors.length],
                      iconUrl: m.modelIconUrl,
                      agentUrl: m.modelAgentUrl,
                      isAgent: m.isAgent,
                    }))}
                  />
                </div>

                {/* Model Distribution Pie */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1.5rem' }}>📊 Cost Distribution</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                    <DonutChart
                      data={analytics.modelBreakdown.map((m, i) => ({
                        label: m.modelName,
                        value: m.cost,
                        color: modelColors[i % modelColors.length],
                      }))}
                      size={140}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {analytics.modelBreakdown.slice(0, 5).map((m, i) => (
                        <div key={m.modelId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: modelColors[i % modelColors.length] }} />
                          {m.isAgent ? (
                            <FaviconImage iconUrl={m.modelIconUrl} baseUrl={m.modelAgentUrl} size={16} fallbackEmoji={m.modelIcon} />
                          ) : (
                            <span>{m.modelIcon}</span>
                          )}
                          <span style={{ color: 'rgba(255,255,255,0.7)' }}>{m.modelName.split(' ')[0]}</span>
                          <span style={{ color: modelColors[i % modelColors.length], fontWeight: 600 }}>{formatCurrency(m.cost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Context Mode */}
            {viewMode === 'context' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '1.5rem' }}>
                {/* Context Token Breakdown */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1.5rem' }}>🧠 Token Breakdown by Context Type</h3>
                  <BarChart
                    data={[
                      { label: '📚 RAG', value: analytics.contextBreakdown.rag.tokens, color: contextColors.rag },
                      { label: '📜 History', value: analytics.contextBreakdown.history.tokens, color: contextColors.history },
                      { label: '💬 Recent', value: analytics.contextBreakdown.recentHistory.tokens, color: contextColors.recentHistory },
                      { label: '🎭 Persona', value: analytics.contextBreakdown.persona.tokens, color: contextColors.persona },
                      { label: '❓ Query', value: analytics.contextBreakdown.query.tokens, color: contextColors.query },
                    ]}
                  />
                </div>

                {/* Context Distribution Pie */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1.5rem' }}>📊 Context Distribution</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <DonutChart
                      data={[
                        { label: 'RAG', value: analytics.contextBreakdown.rag.tokens, color: contextColors.rag },
                        { label: 'History', value: analytics.contextBreakdown.history.tokens, color: contextColors.history },
                        { label: 'Recent', value: analytics.contextBreakdown.recentHistory.tokens, color: contextColors.recentHistory },
                        { label: 'Persona', value: analytics.contextBreakdown.persona.tokens, color: contextColors.persona },
                        { label: 'Query', value: analytics.contextBreakdown.query.tokens, color: contextColors.query },
                      ]}
                      size={140}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: contextColors.rag }} />
                        <span style={{ color: 'rgba(255,255,255,0.7)' }}>📚 RAG</span>
                        <span style={{ color: contextColors.rag, fontWeight: 600 }}>{analytics.contextBreakdown.rag.percent.toFixed(1)}%</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: contextColors.history }} />
                        <span style={{ color: 'rgba(255,255,255,0.7)' }}>📜 History</span>
                        <span style={{ color: contextColors.history, fontWeight: 600 }}>{analytics.contextBreakdown.history.percent.toFixed(1)}%</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: contextColors.recentHistory }} />
                        <span style={{ color: 'rgba(255,255,255,0.7)' }}>💬 Recent</span>
                        <span style={{ color: contextColors.recentHistory, fontWeight: 600 }}>{analytics.contextBreakdown.recentHistory.percent.toFixed(1)}%</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: contextColors.persona }} />
                        <span style={{ color: 'rgba(255,255,255,0.7)' }}>🎭 Persona</span>
                        <span style={{ color: contextColors.persona, fontWeight: 600 }}>{analytics.contextBreakdown.persona.percent.toFixed(1)}%</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: contextColors.query }} />
                        <span style={{ color: 'rgba(255,255,255,0.7)' }}>❓ Query</span>
                        <span style={{ color: contextColors.query, fontWeight: 600 }}>{analytics.contextBreakdown.query.percent.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Context Usage Stats */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1.5rem' }}>📈 Context Feature Usage</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '1rem' }}>
                    <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(167, 139, 250, 0.1)', borderRadius: '12px', border: '1px solid rgba(167, 139, 250, 0.2)' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📚</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: contextColors.rag }}>{analytics.summary.ragUsageCount}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>RAG Queries</div>
                      <div style={{ color: contextColors.rag, fontSize: '0.75rem', marginTop: '0.25rem' }}>{formatTokenCount(analytics.summary.totalRagTokens)} tokens</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(96, 165, 250, 0.1)', borderRadius: '12px', border: '1px solid rgba(96, 165, 250, 0.2)' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📜</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: contextColors.history }}>{analytics.summary.historyUsageCount}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>History Lookups</div>
                      <div style={{ color: contextColors.history, fontSize: '0.75rem', marginTop: '0.25rem' }}>{formatTokenCount(analytics.summary.totalHistoryTokens)} tokens</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '12px', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎭</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: contextColors.persona }}>{analytics.summary.personaUsageCount}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>Persona Uses</div>
                      <div style={{ color: contextColors.persona, fontSize: '0.75rem', marginTop: '0.25rem' }}>{formatTokenCount(analytics.summary.totalPersonaTokens)} tokens</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Trends Mode */}
            {viewMode === 'trends' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                {/* Daily Cost Trend */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1rem' }}>💰 Daily Cost Trend</h3>
                  <LineChart
                    data={analytics.dailyTrend.map(d => ({ date: d.date, value: d.cost }))}
                    color="#f59e0b"
                    height={120}
                    formatValue={(v) => formatCurrency(v)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                    <span>{analytics.dailyTrend[0]?.date || ''}</span>
                    <span>{analytics.dailyTrend[analytics.dailyTrend.length - 1]?.date || ''}</span>
                  </div>
                </div>

                {/* Daily Messages Trend */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1rem' }}>💬 Daily Messages Trend</h3>
                  <LineChart
                    data={analytics.dailyTrend.map(d => ({ date: d.date, value: d.messages }))}
                    color="#8b5cf6"
                    height={120}
                    formatValue={(v) => v.toFixed(0)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                    <span>{analytics.dailyTrend[0]?.date || ''}</span>
                    <span>{analytics.dailyTrend[analytics.dailyTrend.length - 1]?.date || ''}</span>
                  </div>
                </div>

                {/* Daily Tokens Trend */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1rem' }}>🔤 Daily Tokens Trend</h3>
                  <LineChart
                    data={analytics.dailyTrend.map(d => ({ date: d.date, value: d.tokens }))}
                    color="#10b981"
                    height={120}
                    formatValue={(v) => formatTokenCount(v)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                    <span>{analytics.dailyTrend[0]?.date || ''}</span>
                    <span>{analytics.dailyTrend[analytics.dailyTrend.length - 1]?.date || ''}</span>
                  </div>
                </div>

                {/* Daily Table */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1rem' }}>📅 Daily Breakdown</h3>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem', color: 'rgba(255,255,255,0.6)' }}>Date</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem', color: 'rgba(255,255,255,0.6)' }}>Messages</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem', color: 'rgba(255,255,255,0.6)' }}>Tokens</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem', color: 'rgba(255,255,255,0.6)' }}>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...analytics.dailyTrend].reverse().map(day => (
                          <tr key={day.date} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.5rem', color: '#fff' }}>{day.date}</td>
                            <td style={{ padding: '0.5rem', color: '#8b5cf6', textAlign: 'right' }}>{day.messages}</td>
                            <td style={{ padding: '0.5rem', color: '#10b981', textAlign: 'right' }}>{formatTokenCount(day.tokens)}</td>
                            <td style={{ padding: '0.5rem', color: '#f59e0b', textAlign: 'right' }}>{formatCurrency(day.cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Bottom Ad */}
        <AdBanner slot={ADS_CONFIG.slots.analyticsFooter} style={{ marginTop: '2rem' }} />
      </View>
      <Footer />
    </View>
  );
};


'use client';

import React from 'react';
import { WidgetCard, BigNumber, WidgetHeader, WidgetFooter } from './WidgetCard';

interface RandomNumberWidgetProps {
  result: number;
  min: number;
  max: number;
}

export const RandomNumberWidget: React.FC<RandomNumberWidgetProps> = ({ result, min, max }) => {
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(16, 185, 129, 0.4) 0%, rgba(5, 150, 105, 0.4) 100%)">
      <WidgetHeader icon="🎲" title="Random Number" subtitle={`Range: ${min} - ${max}`} />
      <BigNumber value={result} color="#10b981" />
      <WidgetFooter />
    </WidgetCard>
  );
};

interface LuckyNumberWidgetProps {
  luckyNumber: number;
  max: number;
}

export const LuckyNumberWidget: React.FC<LuckyNumberWidgetProps> = ({ luckyNumber, max }) => {
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(16, 185, 129, 0.4) 0%, rgba(5, 150, 105, 0.4) 100%)">
      <WidgetHeader icon="🍀" title="Lucky Number" />
      <BigNumber value={luckyNumber.toLocaleString()} color="#10b981" />
      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
        Max: {max.toLocaleString()}
      </div>
      <WidgetFooter />
    </WidgetCard>
  );
};

interface PickRandomWidgetProps {
  selected: string;
  totalItems: number;
}

export const PickRandomWidget: React.FC<PickRandomWidgetProps> = ({ selected, totalItems }) => {
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(139, 92, 246, 0.4) 0%, rgba(124, 58, 237, 0.4) 100%)">
      <WidgetHeader icon="🎯" title="Random Pick" subtitle={`From ${totalItems} items`} />
      <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '2.5rem' }}>✨</span>
      </div>
      <BigNumber value={selected} color="#8b5cf6" size="md" />
      <WidgetFooter />
    </WidgetCard>
  );
};


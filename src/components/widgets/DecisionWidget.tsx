'use client';

import React from 'react';
import { WidgetCard, BigNumber, WidgetHeader, WidgetFooter } from './WidgetCard';

interface DecisionWidgetProps {
  decision: string;
  mode: 'yesNo' | 'custom';
  options?: string[];
}

export const DecisionWidget: React.FC<DecisionWidgetProps> = ({ decision, mode, options }) => {
  const isYes = decision.toLowerCase() === 'yes';
  const color = mode === 'yesNo' 
    ? (isYes ? '#10b981' : '#ef4444')
    : '#8b5cf6';
  const emoji = mode === 'yesNo'
    ? (isYes ? '✅' : '❌')
    : '🎯';
  
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(139, 92, 246, 0.4) 0%, rgba(124, 58, 237, 0.4) 100%)">
      <WidgetHeader icon="🤔" title="Decision Maker" subtitle={mode === 'yesNo' ? 'Yes or No?' : 'Random Pick'} />
      <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '3rem' }}>{emoji}</span>
      </div>
      <BigNumber value={decision} color={color} size="md" />
      {mode === 'custom' && options && options.length > 0 && (
        <div style={{ 
          marginTop: '1rem', 
          textAlign: 'center', 
          color: 'rgba(255,255,255,0.6)',
          fontSize: '0.85rem',
        }}>
          From {options.length} options
        </div>
      )}
      <WidgetFooter />
    </WidgetCard>
  );
};


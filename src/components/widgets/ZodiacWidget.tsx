'use client';

import React from 'react';
import { WidgetCard, BigNumber, WidgetHeader, WidgetFooter } from './WidgetCard';

interface ZodiacWidgetProps {
  person1: { sign: string; name: string; symbol: string };
  person2: { sign: string; name: string; symbol: string };
  compatibility: number;
}

const getCompatColor = (percent: number): string => {
  if (percent >= 80) return '#10b981';
  if (percent >= 60) return '#22c55e';
  if (percent >= 40) return '#eab308';
  return '#ef4444';
};

const getCompatMessage = (percent: number): { emoji: string; text: string } => {
  if (percent >= 80) return { emoji: '💕', text: 'Perfect Match!' };
  if (percent >= 60) return { emoji: '💖', text: 'Great Connection' };
  if (percent >= 40) return { emoji: '💛', text: 'Good Potential' };
  return { emoji: '💔', text: 'Challenging' };
};

export const ZodiacWidget: React.FC<ZodiacWidgetProps> = ({ person1, person2, compatibility }) => {
  const color = getCompatColor(compatibility);
  const message = getCompatMessage(compatibility);
  
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(236, 72, 153, 0.4) 0%, rgba(244, 63, 94, 0.4) 100%)">
      <WidgetHeader icon="💫" title="Zodiac Match" />
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: '1rem',
        marginBottom: '1rem',
      }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem' }}>{person1.symbol}</span>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>{person1.name}</div>
        </div>
        <span style={{ fontSize: '1.5rem' }}>❤️</span>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem' }}>{person2.symbol}</span>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>{person2.name}</div>
        </div>
      </div>
      <BigNumber value={`${compatibility}%`} color={color} />
      <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
        <span style={{ fontSize: '1.5rem' }}>{message.emoji}</span>
        <div style={{ color: 'rgba(255,255,255,0.8)', marginTop: '0.25rem' }}>{message.text}</div>
      </div>
      <WidgetFooter />
    </WidgetCard>
  );
};


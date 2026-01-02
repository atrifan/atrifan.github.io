'use client';

import React from 'react';
import { WidgetCard, BigNumber, WidgetHeader, WidgetFooter } from './WidgetCard';

interface CoinFlipWidgetProps {
  result: 'heads' | 'tails';
}

export const CoinFlipWidget: React.FC<CoinFlipWidgetProps> = ({ result }) => {
  const isHeads = result === 'heads';
  
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(234, 179, 8, 0.4) 0%, rgba(202, 138, 4, 0.4) 100%)">
      <WidgetHeader icon="🪙" title="Coin Flip" />
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div style={{ 
          width: '100px', 
          height: '100px', 
          borderRadius: '50%', 
          background: isHeads 
            ? 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #d97706 100%)'
            : 'linear-gradient(135deg, #f3f4f6 0%, #9ca3af 50%, #6b7280 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          border: `3px solid ${isHeads ? '#b45309' : '#4b5563'}`,
        }}>
          <span style={{ 
            fontSize: '2.5rem', 
            fontWeight: 800, 
            color: isHeads ? '#92400e' : '#374151' 
          }}>
            {isHeads ? 'H' : '50'}
          </span>
        </div>
      </div>
      <BigNumber value={result.toUpperCase()} color="#fbbf24" size="md" />
      <WidgetFooter />
    </WidgetCard>
  );
};


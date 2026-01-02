'use client';

import React from 'react';
import { WidgetCard, StatBox, WidgetHeader, WidgetFooter } from './WidgetCard';

interface TipWidgetProps {
  billAmount: number;
  tipPercent: number;
  tipAmount: number;
  total: number;
  perPerson?: number;
  splitWays?: number;
}

export const TipWidget: React.FC<TipWidgetProps> = ({ 
  billAmount, tipPercent, tipAmount, total, perPerson, splitWays 
}) => {
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(245, 158, 11, 0.4) 0%, rgba(217, 119, 6, 0.4) 100%)">
      <WidgetHeader icon="💰" title="Tip Calculator" subtitle={`${tipPercent}% tip`} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <StatBox label="Bill" value={`$${billAmount.toFixed(2)}`} />
        <StatBox label="Tip" value={`$${tipAmount.toFixed(2)}`} color="#f59e0b" />
      </div>
      <div style={{ 
        background: 'rgba(245, 158, 11, 0.3)', 
        padding: '1rem', 
        borderRadius: '12px',
        textAlign: 'center',
        marginBottom: splitWays && splitWays > 1 ? '0.75rem' : 0,
      }}>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Total</div>
        <div style={{ color: '#f59e0b', fontSize: '2rem', fontWeight: 800 }}>${total.toFixed(2)}</div>
      </div>
      {splitWays && splitWays > 1 && perPerson && (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.8)' }}>
          Split {splitWays} ways: <span style={{ color: '#f59e0b', fontWeight: 700 }}>${perPerson.toFixed(2)}</span> each
        </div>
      )}
      <WidgetFooter />
    </WidgetCard>
  );
};


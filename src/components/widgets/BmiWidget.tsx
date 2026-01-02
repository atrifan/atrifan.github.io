'use client';

import React from 'react';
import { WidgetCard, BigNumber, StatBox, WidgetHeader, WidgetFooter } from './WidgetCard';

interface BmiWidgetProps {
  bmi: number;
  category: string;
  weight?: number;
  height?: number;
}

const getCategoryColor = (category: string): string => {
  switch (category.toLowerCase()) {
    case 'underweight': return '#60a5fa';
    case 'normal': return '#10b981';
    case 'overweight': return '#f59e0b';
    case 'obese': return '#ef4444';
    default: return '#fff';
  }
};

export const BmiWidget: React.FC<BmiWidgetProps> = ({ bmi, category, weight, height }) => {
  const color = getCategoryColor(category);
  
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(244, 114, 182, 0.4) 0%, rgba(236, 72, 153, 0.4) 100%)">
      <WidgetHeader icon="📏" title="BMI Calculator" />
      <BigNumber value={bmi.toFixed(1)} color={color} />
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '1rem',
        padding: '0.5rem 1rem',
        background: `${color}33`,
        borderRadius: '20px',
        display: 'inline-block',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        <span style={{ color, fontWeight: 700 }}>{category}</span>
      </div>
      {(weight || height) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {weight && <StatBox label="Weight" value={`${weight} kg`} />}
          {height && <StatBox label="Height" value={`${height} cm`} />}
        </div>
      )}
      <WidgetFooter />
    </WidgetCard>
  );
};


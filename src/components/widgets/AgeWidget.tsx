'use client';

import React from 'react';
import { WidgetCard, BigNumber, StatBox, WidgetHeader, WidgetFooter } from './WidgetCard';

interface AgeWidgetProps {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  daysUntilNextBirthday: number;
}

export const AgeWidget: React.FC<AgeWidgetProps> = ({ 
  years, months, days, totalDays, daysUntilNextBirthday 
}) => {
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(244, 114, 182, 0.4) 0%, rgba(236, 72, 153, 0.4) 100%)">
      <WidgetHeader icon="🎂" title="Age Calculator" />
      <BigNumber value={`${years}`} label="years old" color="#f472b6" />
      <div style={{ 
        textAlign: 'center', 
        color: 'rgba(255,255,255,0.8)', 
        marginBottom: '1rem',
        fontSize: '1.1rem',
      }}>
        {years} years, {months} months, {days} days
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <StatBox label="Total Days" value={totalDays.toLocaleString()} />
        <StatBox label="Next Birthday" value={`${daysUntilNextBirthday} days`} color="#f472b6" />
      </div>
      <WidgetFooter />
    </WidgetCard>
  );
};


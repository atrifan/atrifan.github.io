'use client';

import React from 'react';
import { WidgetCard, BigNumber, StatBox, WidgetHeader, WidgetFooter } from './WidgetCard';

interface CountdownWidgetProps {
  eventName: string;
  days: number;
  weeks: number;
  months: number;
  isPast: boolean;
  isToday: boolean;
}

export const CountdownWidget: React.FC<CountdownWidgetProps> = ({ 
  eventName, days, weeks, months, isPast, isToday 
}) => {
  const absDays = Math.abs(days);
  
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(6, 182, 212, 0.4) 0%, rgba(8, 145, 178, 0.4) 100%)">
      <WidgetHeader icon="📅" title="Countdown" subtitle={eventName} />
      {isToday ? (
        <BigNumber value="TODAY!" color="#06b6d4" />
      ) : (
        <>
          <BigNumber value={absDays} color="#06b6d4" />
          <div style={{ textAlign: 'center', color: '#fff', fontSize: '1.2rem', marginBottom: '1rem' }}>
            days {isPast ? 'ago' : 'to go'}
          </div>
        </>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <StatBox label="Weeks" value={weeks} />
        <StatBox label="Months" value={months} />
      </div>
      <WidgetFooter />
    </WidgetCard>
  );
};


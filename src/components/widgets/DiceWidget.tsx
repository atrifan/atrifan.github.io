'use client';

import React from 'react';
import { WidgetCard, BigNumber, WidgetHeader, WidgetFooter } from './WidgetCard';

interface DiceWidgetProps {
  rolls: number[];
  total: number;
  sides?: number;
}

const DiceFace: React.FC<{ value: number }> = ({ value }) => {
  const dotPositions: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]],
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
  };
  const dots = dotPositions[value] || dotPositions[1];
  
  return (
    <svg width="50" height="50" viewBox="0 0 100 100" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>
      <rect x="5" y="5" width="90" height="90" rx="15" fill="white" stroke="#d4d4d4" strokeWidth="2" />
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="10" fill="#1f2937" />
      ))}
    </svg>
  );
};

export const DiceWidget: React.FC<DiceWidgetProps> = ({ rolls, total, sides = 6 }) => {
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(234, 179, 8, 0.4) 0%, rgba(202, 138, 4, 0.4) 100%)">
      <WidgetHeader icon="🎲" title="Dice Roll" subtitle={`${rolls.length}d${sides}`} />
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        justifyContent: 'center', 
        flexWrap: 'wrap',
        marginBottom: '1rem',
      }}>
        {rolls.map((roll, i) => (
          <DiceFace key={i} value={roll} />
        ))}
      </div>
      <BigNumber value={total} label="Total" color="#fbbf24" size="md" />
      <WidgetFooter />
    </WidgetCard>
  );
};


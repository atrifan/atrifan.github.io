import React from 'react';

interface LuckIconProps {
  size?: number;
}

export const LuckIcon: React.FC<LuckIconProps> = ({ size = 160 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      style={{ filter: 'drop-shadow(0 12px 40px rgba(139, 92, 246, 0.5))' }}
    >
      <defs>
        <linearGradient id="luckGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6"/>
          <stop offset="50%" stopColor="#a855f7"/>
          <stop offset="100%" stopColor="#d946ef"/>
        </linearGradient>
        <linearGradient id="diceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fefefe"/>
          <stop offset="100%" stopColor="#e0e0e0"/>
        </linearGradient>
      </defs>
      
      {/* Background circle */}
      <circle cx="80" cy="80" r="75" fill="url(#luckGradient)"/>
      
      {/* Dice body - 3D effect */}
      <rect x="45" y="45" width="70" height="70" rx="12" fill="url(#diceGradient)" transform="rotate(-10 80 80)"/>
      
      {/* Dice dots - showing 6 */}
      <circle cx="58" cy="58" r="6" fill="#8b5cf6" transform="rotate(-10 80 80)"/>
      <circle cx="58" cy="80" r="6" fill="#8b5cf6" transform="rotate(-10 80 80)"/>
      <circle cx="58" cy="102" r="6" fill="#8b5cf6" transform="rotate(-10 80 80)"/>
      <circle cx="102" cy="58" r="6" fill="#8b5cf6" transform="rotate(-10 80 80)"/>
      <circle cx="102" cy="80" r="6" fill="#8b5cf6" transform="rotate(-10 80 80)"/>
      <circle cx="102" cy="102" r="6" fill="#8b5cf6" transform="rotate(-10 80 80)"/>
      
      {/* Sparkles */}
      <circle cx="30" cy="45" r="4" fill="#fff" opacity="0.9"/>
      <circle cx="130" cy="40" r="3" fill="#fff" opacity="0.7"/>
      <circle cx="140" cy="110" r="4" fill="#fff" opacity="0.8"/>
      <circle cx="25" cy="120" r="3" fill="#fff" opacity="0.6"/>
      <circle cx="80" cy="20" r="3" fill="#fff" opacity="0.7"/>
      
      {/* Star sparkles */}
      <path d="M135 70 L137 75 L142 75 L138 78 L140 83 L135 80 L130 83 L132 78 L128 75 L133 75 Z" fill="#fef08a" opacity="0.9"/>
      <path d="M25 85 L27 88 L30 88 L28 90 L29 93 L25 91 L21 93 L22 90 L20 88 L23 88 Z" fill="#fef08a" opacity="0.8"/>
    </svg>
  );
};


import React from 'react';

interface TapIconProps {
  size?: number;
}

export const TapIcon: React.FC<TapIconProps> = ({ size = 160 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      style={{ filter: 'drop-shadow(0 12px 40px rgba(245, 158, 11, 0.5))' }}
    >
      <defs>
        <linearGradient id="tapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b"/>
          <stop offset="50%" stopColor="#f97316"/>
          <stop offset="100%" stopColor="#ef4444"/>
        </linearGradient>
        <linearGradient id="fingerGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7"/>
          <stop offset="100%" stopColor="#fcd34d"/>
        </linearGradient>
      </defs>
      
      {/* Background rounded rectangle */}
      <rect x="5" y="5" width="150" height="150" rx="28" fill="url(#tapGradient)"/>
      
      {/* Ripple circles */}
      <circle cx="80" cy="85" r="50" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2"/>
      <circle cx="80" cy="85" r="38" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>
      <circle cx="80" cy="85" r="26" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
      
      {/* Center tap point */}
      <circle cx="80" cy="85" r="14" fill="rgba(255,255,255,0.9)"/>
      
      {/* Finger pointing down */}
      <ellipse cx="80" cy="45" rx="14" ry="20" fill="url(#fingerGradient)"/>
      <rect x="66" y="40" width="28" height="25" rx="4" fill="url(#fingerGradient)"/>
      
      {/* Finger nail */}
      <ellipse cx="80" cy="32" rx="10" ry="6" fill="#fef9c3" opacity="0.8"/>
      
      {/* Counter number */}
      <text 
        x="80" 
        y="92" 
        textAnchor="middle" 
        fill="#f59e0b" 
        fontSize="18" 
        fontFamily="Arial, sans-serif" 
        fontWeight="bold"
      >
        +1
      </text>
      
      {/* Sparkles */}
      <circle cx="45" cy="60" r="3" fill="#fff" opacity="0.7"/>
      <circle cx="115" cy="55" r="2" fill="#fff" opacity="0.6"/>
      <circle cx="130" cy="100" r="3" fill="#fff" opacity="0.5"/>
      <circle cx="35" cy="110" r="2" fill="#fff" opacity="0.6"/>
    </svg>
  );
};


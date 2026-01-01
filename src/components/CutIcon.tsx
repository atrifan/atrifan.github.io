import React from 'react';

interface CutIconProps {
  size?: number;
}

export const CutIcon: React.FC<CutIconProps> = ({ size = 160 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      style={{ filter: 'drop-shadow(0 12px 40px rgba(102, 126, 234, 0.5))' }}
    >
      <defs>
        <linearGradient id="mainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#667eea"/>
          <stop offset="50%" stopColor="#764ba2"/>
          <stop offset="100%" stopColor="#f472b6"/>
        </linearGradient>
        <linearGradient id="tapeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#feca57"/>
          <stop offset="100%" stopColor="#ff6b6b"/>
        </linearGradient>
        <linearGradient id="screenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1a1a2e"/>
          <stop offset="100%" stopColor="#16213e"/>
        </linearGradient>
        <linearGradient id="clockGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4ade80"/>
          <stop offset="100%" stopColor="#22c55e"/>
        </linearGradient>
      </defs>
      
      {/* Background circle */}
      <circle cx="80" cy="80" r="75" fill="url(#mainGradient)"/>
      
      {/* Digital Scale */}
      <rect x="45" y="85" width="70" height="45" rx="8" fill="#fff" opacity="0.95"/>
      <rect x="50" y="90" width="60" height="25" rx="4" fill="url(#screenGradient)"/>
      {/* Scale display - weight going down */}
      <text x="80" y="108" textAnchor="middle" fill="#4ade80" fontSize="14" fontFamily="monospace" fontWeight="bold">-2.5kg</text>
      {/* Scale feet */}
      <circle cx="52" cy="125" r="4" fill="#e0e0e0"/>
      <circle cx="108" cy="125" r="4" fill="#e0e0e0"/>
      
      {/* Measuring Tape - curved around top */}
      <path 
        d="M25 80 Q25 35 80 30 Q135 35 135 80" 
        fill="none" 
        stroke="url(#tapeGradient)" 
        strokeWidth="12"
        strokeLinecap="round"
      />
      {/* Tape markings */}
      <path d="M35 65 L35 55" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
      <path d="M55 45 L55 35" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
      <path d="M80 38 L80 28" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
      <path d="M105 45 L105 35" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
      <path d="M125 65 L125 55" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
      
      {/* Clock circle - bottom right */}
      <circle cx="115" cy="65" r="18" fill="#fff" opacity="0.95"/>
      <circle cx="115" cy="65" r="15" fill="none" stroke="url(#clockGradient)" strokeWidth="2"/>
      {/* Clock hands - showing fasting time */}
      <path d="M115 65 L115 54" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round"/>
      <path d="M115 65 L122 65" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/>
      {/* Clock center */}
      <circle cx="115" cy="65" r="2" fill="#1a1a2e"/>
      
      {/* Sparkles */}
      <circle cx="30" cy="95" r="3" fill="#fff" opacity="0.6"/>
      <circle cx="140" cy="50" r="2" fill="#fff" opacity="0.7"/>
      <circle cx="20" cy="55" r="2" fill="#fff" opacity="0.5"/>
    </svg>
  );
};


import React from 'react';

interface StackIconProps {
  size?: number;
}

export const StackIcon: React.FC<StackIconProps> = ({ size = 160 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      style={{ filter: 'drop-shadow(0 12px 40px rgba(16, 185, 129, 0.5))' }}
    >
      <defs>
        <linearGradient id="stackGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981"/>
          <stop offset="50%" stopColor="#059669"/>
          <stop offset="100%" stopColor="#047857"/>
        </linearGradient>
        <linearGradient id="coinGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fcd34d"/>
          <stop offset="50%" stopColor="#fbbf24"/>
          <stop offset="100%" stopColor="#f59e0b"/>
        </linearGradient>
        <linearGradient id="chartGradient" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#34d399"/>
          <stop offset="100%" stopColor="#6ee7b7"/>
        </linearGradient>
      </defs>
      
      {/* Background rounded rectangle */}
      <rect x="5" y="5" width="150" height="150" rx="28" fill="url(#stackGradient)"/>
      
      {/* Coin stack - bottom */}
      <ellipse cx="55" cy="115" rx="22" ry="8" fill="#f59e0b"/>
      <ellipse cx="55" cy="112" rx="22" ry="8" fill="url(#coinGradient)"/>
      <rect x="33" y="105" width="44" height="7" fill="#fbbf24"/>
      <ellipse cx="55" cy="105" rx="22" ry="8" fill="url(#coinGradient)"/>
      <rect x="33" y="98" width="44" height="7" fill="#fbbf24"/>
      <ellipse cx="55" cy="98" rx="22" ry="8" fill="url(#coinGradient)"/>
      <rect x="33" y="91" width="44" height="7" fill="#fbbf24"/>
      <ellipse cx="55" cy="91" rx="22" ry="8" fill="url(#coinGradient)"/>
      
      {/* Dollar sign on top coin */}
      <text x="55" y="95" textAnchor="middle" fill="#92400e" fontSize="12" fontWeight="bold" fontFamily="Arial">$</text>
      
      {/* Growth chart */}
      <path 
        d="M75 100 L90 85 L105 70 L120 45" 
        fill="none" 
        stroke="url(#chartGradient)" 
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Arrow head */}
      <path 
        d="M115 55 L120 45 L130 50" 
        fill="none" 
        stroke="url(#chartGradient)" 
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Chart dots */}
      <circle cx="75" cy="100" r="5" fill="#fff"/>
      <circle cx="90" cy="85" r="5" fill="#fff"/>
      <circle cx="105" cy="70" r="5" fill="#fff"/>
      <circle cx="120" cy="45" r="6" fill="#fff"/>
      
      {/* Piggy bank silhouette - small */}
      <ellipse cx="125" cy="105" rx="15" ry="12" fill="#fff" opacity="0.9"/>
      <circle cx="135" cy="100" r="5" fill="#fff" opacity="0.9"/>
      <ellipse cx="137" cy="98" rx="2" ry="3" fill="#10b981"/>
      <rect x="118" y="113" width="4" height="6" rx="2" fill="#fff" opacity="0.9"/>
      <rect x="128" y="113" width="4" height="6" rx="2" fill="#fff" opacity="0.9"/>
      <rect x="120" y="95" width="8" height="3" rx="1" fill="#10b981"/>
      
      {/* Sparkles */}
      <circle cx="40" cy="45" r="3" fill="#fff" opacity="0.7"/>
      <circle cx="30" cy="70" r="2" fill="#fff" opacity="0.6"/>
      <circle cx="140" cy="75" r="2" fill="#fff" opacity="0.5"/>
    </svg>
  );
};


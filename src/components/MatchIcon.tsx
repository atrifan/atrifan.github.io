import React from 'react';

interface MatchIconProps {
  size?: number;
}

export const MatchIcon: React.FC<MatchIconProps> = ({ size = 160 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      style={{ filter: 'drop-shadow(0 12px 40px rgba(236, 72, 153, 0.5))' }}
    >
      <defs>
        <linearGradient id="matchGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ec4899"/>
          <stop offset="50%" stopColor="#f43f5e"/>
          <stop offset="100%" stopColor="#fb7185"/>
        </linearGradient>
        <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7"/>
          <stop offset="100%" stopColor="#fcd34d"/>
        </linearGradient>
      </defs>
      
      {/* Background rounded rectangle */}
      <rect x="5" y="5" width="150" height="150" rx="28" fill="url(#matchGradient)"/>
      
      {/* Two interlocking hearts */}
      {/* Left heart */}
      <path 
        d="M55 65 C55 50, 35 50, 35 65 C35 85, 55 95, 55 95 C55 95, 75 85, 75 65 C75 50, 55 50, 55 65" 
        fill="rgba(255,255,255,0.9)"
        transform="translate(-5, 0)"
      />
      {/* Right heart */}
      <path 
        d="M105 65 C105 50, 85 50, 85 65 C85 85, 105 95, 105 95 C105 95, 125 85, 125 65 C125 50, 105 50, 105 65" 
        fill="url(#heartGradient)"
        transform="translate(5, 0)"
      />
      
      {/* Stars around */}
      <text x="80" y="125" textAnchor="middle" fontSize="24" fill="#fff">♈ ♥ ♏</text>
      
      {/* Sparkles */}
      <circle cx="30" cy="45" r="4" fill="#fff" opacity="0.9"/>
      <circle cx="130" cy="40" r="3" fill="#fff" opacity="0.7"/>
      <circle cx="140" cy="100" r="4" fill="#fff" opacity="0.8"/>
      <circle cx="20" cy="110" r="3" fill="#fff" opacity="0.6"/>
      
      {/* Star sparkles */}
      <path d="M25 75 L27 80 L32 80 L28 83 L30 88 L25 85 L20 88 L22 83 L18 80 L23 80 Z" fill="#fef08a" opacity="0.9"/>
      <path d="M135 70 L137 73 L140 73 L138 75 L139 78 L135 76 L131 78 L132 75 L130 73 L133 73 Z" fill="#fef08a" opacity="0.8"/>
    </svg>
  );
};


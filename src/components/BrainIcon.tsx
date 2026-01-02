import React from 'react';

interface BrainIconProps {
  size?: number;
}

export const BrainIcon: React.FC<BrainIconProps> = ({ size = 160 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      style={{ filter: 'drop-shadow(0 12px 40px rgba(96, 165, 250, 0.5))' }}
    >
      <defs>
        <linearGradient id="brainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa"/>
          <stop offset="50%" stopColor="#a78bfa"/>
          <stop offset="100%" stopColor="#f472b6"/>
        </linearGradient>
        <linearGradient id="brainInnerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7"/>
          <stop offset="100%" stopColor="#fcd34d"/>
        </linearGradient>
      </defs>
      
      {/* Background circle */}
      <circle cx="80" cy="80" r="75" fill="url(#brainGradient)"/>
      
      {/* Brain shape - left hemisphere */}
      <path 
        d="M50 60 C35 55, 30 70, 35 80 C30 85, 32 100, 45 105 C45 115, 55 120, 65 115 C70 120, 80 118, 80 110 L80 60 C70 55, 55 55, 50 60" 
        fill="rgba(255,255,255,0.95)"
        stroke="rgba(167, 139, 250, 0.5)"
        strokeWidth="1"
      />
      
      {/* Brain shape - right hemisphere */}
      <path 
        d="M110 60 C125 55, 130 70, 125 80 C130 85, 128 100, 115 105 C115 115, 105 120, 95 115 C90 120, 80 118, 80 110 L80 60 C90 55, 105 55, 110 60" 
        fill="url(#brainInnerGradient)"
        stroke="rgba(167, 139, 250, 0.5)"
        strokeWidth="1"
      />
      
      {/* Brain folds - left */}
      <path d="M45 75 Q55 70, 65 75" stroke="rgba(167, 139, 250, 0.6)" strokeWidth="2" fill="none"/>
      <path d="M50 90 Q60 85, 70 90" stroke="rgba(167, 139, 250, 0.6)" strokeWidth="2" fill="none"/>
      
      {/* Brain folds - right */}
      <path d="M95 75 Q105 70, 115 75" stroke="rgba(244, 114, 182, 0.6)" strokeWidth="2" fill="none"/>
      <path d="M90 90 Q100 85, 110 90" stroke="rgba(244, 114, 182, 0.6)" strokeWidth="2" fill="none"/>
      
      {/* Lightning bolt - intelligence symbol */}
      <path 
        d="M75 40 L68 55 L78 55 L72 70 L85 50 L75 50 L80 40 Z" 
        fill="#fbbf24"
        stroke="#f59e0b"
        strokeWidth="1"
      />
      
      {/* Sparkles */}
      <circle cx="30" cy="45" r="4" fill="#fff" opacity="0.9"/>
      <circle cx="130" cy="40" r="3" fill="#fff" opacity="0.7"/>
      <circle cx="140" cy="100" r="4" fill="#fff" opacity="0.8"/>
      <circle cx="20" cy="110" r="3" fill="#fff" opacity="0.6"/>
      
      {/* IQ text */}
      <text x="80" y="140" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#fff">IQ</text>
    </svg>
  );
};


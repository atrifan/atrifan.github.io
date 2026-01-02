import React from 'react';

interface VibeIconProps {
  size?: number;
}

export const VibeIcon: React.FC<VibeIconProps> = ({ size = 160 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      style={{ filter: 'drop-shadow(0 12px 40px rgba(167, 139, 250, 0.5))' }}
    >
      <defs>
        <linearGradient id="vibeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa"/>
          <stop offset="50%" stopColor="#f472b6"/>
          <stop offset="100%" stopColor="#fbbf24"/>
        </linearGradient>
        <linearGradient id="catGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd"/>
          <stop offset="100%" stopColor="#a78bfa"/>
        </linearGradient>
        <linearGradient id="dogGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fcd34d"/>
          <stop offset="100%" stopColor="#f59e0b"/>
        </linearGradient>
      </defs>
      
      {/* Background circle */}
      <circle cx="80" cy="80" r="75" fill="url(#vibeGradient)"/>
      
      {/* Cat face - left side */}
      <g transform="translate(20, 35)">
        {/* Cat head */}
        <ellipse cx="35" cy="50" rx="28" ry="25" fill="url(#catGradient)"/>
        {/* Cat ears */}
        <path d="M12 35 L20 55 L28 35 Z" fill="url(#catGradient)"/>
        <path d="M42 35 L50 55 L58 35 Z" fill="url(#catGradient)"/>
        {/* Inner ears */}
        <path d="M16 40 L20 50 L24 40 Z" fill="#f9a8d4"/>
        <path d="M46 40 L50 50 L54 40 Z" fill="#f9a8d4"/>
        {/* Eyes */}
        <ellipse cx="25" cy="48" rx="5" ry="6" fill="#1e1b4b"/>
        <ellipse cx="45" cy="48" rx="5" ry="6" fill="#1e1b4b"/>
        <circle cx="27" cy="46" r="2" fill="#fff"/>
        <circle cx="47" cy="46" r="2" fill="#fff"/>
        {/* Nose */}
        <path d="M35 55 L32 60 L38 60 Z" fill="#f9a8d4"/>
        {/* Mouth */}
        <path d="M35 60 Q30 65, 28 62" stroke="#1e1b4b" strokeWidth="1.5" fill="none"/>
        <path d="M35 60 Q40 65, 42 62" stroke="#1e1b4b" strokeWidth="1.5" fill="none"/>
        {/* Whiskers */}
        <line x1="5" y1="55" x2="20" y2="55" stroke="#1e1b4b" strokeWidth="1"/>
        <line x1="5" y1="60" x2="20" y2="58" stroke="#1e1b4b" strokeWidth="1"/>
        <line x1="50" y1="55" x2="65" y2="55" stroke="#1e1b4b" strokeWidth="1"/>
        <line x1="50" y1="58" x2="65" y2="60" stroke="#1e1b4b" strokeWidth="1"/>
      </g>
      
      {/* Dog face - right side */}
      <g transform="translate(75, 35)">
        {/* Dog head */}
        <ellipse cx="35" cy="50" rx="28" ry="25" fill="url(#dogGradient)"/>
        {/* Dog ears - floppy */}
        <ellipse cx="12" cy="45" rx="10" ry="18" fill="#d97706" transform="rotate(-20, 12, 45)"/>
        <ellipse cx="58" cy="45" rx="10" ry="18" fill="#d97706" transform="rotate(20, 58, 45)"/>
        {/* Eyes */}
        <circle cx="25" cy="48" r="6" fill="#1e1b4b"/>
        <circle cx="45" cy="48" r="6" fill="#1e1b4b"/>
        <circle cx="27" cy="46" r="2.5" fill="#fff"/>
        <circle cx="47" cy="46" r="2.5" fill="#fff"/>
        {/* Nose */}
        <ellipse cx="35" cy="58" rx="6" ry="4" fill="#1e1b4b"/>
        <ellipse cx="35" cy="57" rx="2" ry="1" fill="#fff" opacity="0.5"/>
        {/* Mouth - happy */}
        <path d="M25 65 Q35 75, 45 65" stroke="#1e1b4b" strokeWidth="2" fill="none"/>
        {/* Tongue */}
        <ellipse cx="35" cy="72" rx="5" ry="6" fill="#f9a8d4"/>
      </g>
      
      {/* VS divider */}
      <text x="80" y="90" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#fff" opacity="0.9">VS</text>
      
      {/* Sparkles */}
      <circle cx="25" cy="25" r="3" fill="#fff" opacity="0.9"/>
      <circle cx="135" cy="30" r="4" fill="#fff" opacity="0.8"/>
      <circle cx="15" cy="130" r="3" fill="#fff" opacity="0.7"/>
      <circle cx="145" cy="125" r="4" fill="#fff" opacity="0.8"/>
      
      {/* Question mark */}
      <text x="80" y="145" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#fff">🐱 or 🐕?</text>
    </svg>
  );
};


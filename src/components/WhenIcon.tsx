import React from 'react';

interface WhenIconProps {
  size?: number;
}

export const WhenIcon: React.FC<WhenIconProps> = ({ size = 160 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      style={{ filter: 'drop-shadow(0 12px 40px rgba(59, 130, 246, 0.5))' }}
    >
      <defs>
        <linearGradient id="whenGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6"/>
          <stop offset="50%" stopColor="#0ea5e9"/>
          <stop offset="100%" stopColor="#06b6d4"/>
        </linearGradient>
        <linearGradient id="calendarGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff"/>
          <stop offset="100%" stopColor="#f0f9ff"/>
        </linearGradient>
        <linearGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ef4444"/>
          <stop offset="100%" stopColor="#f97316"/>
        </linearGradient>
      </defs>
      
      {/* Background circle */}
      <circle cx="80" cy="80" r="75" fill="url(#whenGradient)"/>
      
      {/* Calendar body */}
      <rect x="35" y="40" width="90" height="85" rx="10" fill="url(#calendarGradient)"/>
      
      {/* Calendar header (red top) */}
      <rect x="35" y="40" width="90" height="22" rx="10" fill="url(#headerGradient)"/>
      <rect x="35" y="52" width="90" height="10" fill="url(#headerGradient)"/>
      
      {/* Calendar rings */}
      <rect x="52" y="35" width="6" height="15" rx="3" fill="#64748b"/>
      <rect x="102" y="35" width="6" height="15" rx="3" fill="#64748b"/>
      
      {/* Calendar grid lines */}
      <line x1="35" y1="80" x2="125" y2="80" stroke="#e2e8f0" strokeWidth="1"/>
      <line x1="35" y1="100" x2="125" y2="100" stroke="#e2e8f0" strokeWidth="1"/>
      <line x1="65" y1="62" x2="65" y2="125" stroke="#e2e8f0" strokeWidth="1"/>
      <line x1="95" y1="62" x2="95" y2="125" stroke="#e2e8f0" strokeWidth="1"/>
      
      {/* Question mark */}
      <text 
        x="80" 
        y="102" 
        textAnchor="middle" 
        fill="#3b82f6" 
        fontSize="40" 
        fontFamily="Arial, sans-serif" 
        fontWeight="bold"
      >
        ?
      </text>
      
      {/* Sparkles */}
      <circle cx="25" cy="60" r="3" fill="#fff" opacity="0.7"/>
      <circle cx="140" cy="45" r="2" fill="#fff" opacity="0.6"/>
      <circle cx="135" cy="115" r="3" fill="#fff" opacity="0.5"/>
      <circle cx="30" cy="110" r="2" fill="#fff" opacity="0.6"/>
    </svg>
  );
};


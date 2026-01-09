import React from 'react';

interface AutomationIconProps {
  size?: number;
}

export const AutomationIcon: React.FC<AutomationIconProps> = ({ size = 160 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 12px 40px rgba(245, 158, 11, 0.5))' }}
    >
      <defs>
        <linearGradient id="autoMainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
        <linearGradient id="autoGearGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>

      {/* Background rounded rectangle */}
      <rect x="5" y="5" width="150" height="150" rx="28" fill="url(#autoMainGradient)" />

      {/* Main gear - center */}
      <circle cx="80" cy="75" r="28" fill="url(#autoGearGradient)" />
      <circle cx="80" cy="75" r="14" fill="url(#autoMainGradient)" />
      {/* Gear teeth */}
      <rect x="74" y="42" width="12" height="10" fill="url(#autoGearGradient)" rx="2" />
      <rect x="74" y="98" width="12" height="10" fill="url(#autoGearGradient)" rx="2" />
      <rect x="47" y="69" width="10" height="12" fill="url(#autoGearGradient)" rx="2" />
      <rect x="103" y="69" width="10" height="12" fill="url(#autoGearGradient)" rx="2" />
      {/* Diagonal teeth */}
      <rect x="52" y="52" width="10" height="10" fill="url(#autoGearGradient)" rx="2" transform="rotate(45 57 57)" />
      <rect x="98" y="52" width="10" height="10" fill="url(#autoGearGradient)" rx="2" transform="rotate(45 103 57)" />
      <rect x="52" y="88" width="10" height="10" fill="url(#autoGearGradient)" rx="2" transform="rotate(45 57 93)" />
      <rect x="98" y="88" width="10" height="10" fill="url(#autoGearGradient)" rx="2" transform="rotate(45 103 93)" />

      {/* Small gear - top right */}
      <circle cx="120" cy="45" r="14" fill="url(#autoGearGradient)" opacity="0.9">
        <animate attributeName="opacity" values="0.9;0.6;0.9" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="120" cy="45" r="7" fill="url(#autoMainGradient)" />
      <rect x="117" y="28" width="6" height="5" fill="url(#autoGearGradient)" rx="1" />
      <rect x="117" y="57" width="6" height="5" fill="url(#autoGearGradient)" rx="1" />
      <rect x="103" y="42" width="5" height="6" fill="url(#autoGearGradient)" rx="1" />
      <rect x="132" y="42" width="5" height="6" fill="url(#autoGearGradient)" rx="1" />

      {/* Small gear - bottom left */}
      <circle cx="40" cy="115" r="14" fill="url(#autoGearGradient)" opacity="0.9">
        <animate attributeName="opacity" values="0.6;0.9;0.6" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="40" cy="115" r="7" fill="url(#autoMainGradient)" />
      <rect x="37" y="98" width="6" height="5" fill="url(#autoGearGradient)" rx="1" />
      <rect x="37" y="127" width="6" height="5" fill="url(#autoGearGradient)" rx="1" />
      <rect x="23" y="112" width="5" height="6" fill="url(#autoGearGradient)" rx="1" />
      <rect x="52" y="112" width="5" height="6" fill="url(#autoGearGradient)" rx="1" />

      {/* Connection lines */}
      <line x1="103" y1="55" x2="95" y2="60" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeDasharray="4,4">
        <animate attributeName="stroke-dashoffset" values="0;8" dur="1s" repeatCount="indefinite" />
      </line>
      <line x1="57" y1="100" x2="65" y2="90" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeDasharray="4,4">
        <animate attributeName="stroke-dashoffset" values="0;8" dur="1s" repeatCount="indefinite" />
      </line>

      {/* Sparkles */}
      <circle cx="25" cy="35" r="3" fill="#fff" opacity="0.6" />
      <circle cx="140" cy="130" r="2" fill="#fff" opacity="0.5" />
      <circle cx="130" cy="25" r="2" fill="#fff" opacity="0.7" />
    </svg>
  );
};


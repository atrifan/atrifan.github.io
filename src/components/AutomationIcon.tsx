import React from 'react';

interface AutomationIconProps {
  size?: number;
}

export const AutomationIcon: React.FC<AutomationIconProps> = ({ size = 80 }) => {
  const scale = size / 80;
  
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 4px 8px rgba(245, 158, 11, 0.4))' }}
    >
      <defs>
        <linearGradient id="autoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
        <linearGradient id="autoGearGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fef3c7" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      
      {/* Background circle */}
      <circle cx="40" cy="40" r="36" fill="url(#autoGradient)" opacity="0.2" />
      
      {/* Lightning bolt */}
      <path
        d="M44 16L26 42H38L36 64L54 38H42L44 16Z"
        fill="url(#autoGearGradient)"
        stroke="url(#autoGradient)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      
      {/* Gear 1 - top right */}
      <g transform="translate(54, 18)">
        <circle cx="8" cy="8" r="5" fill="url(#autoGradient)" opacity="0.8">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 8 8"
            to="360 8 8"
            dur="4s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="8" cy="8" r="2" fill="#fff" opacity="0.9" />
      </g>
      
      {/* Gear 2 - bottom left */}
      <g transform="translate(12, 52)">
        <circle cx="8" cy="8" r="5" fill="url(#autoGradient)" opacity="0.8">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="360 8 8"
            to="0 8 8"
            dur="4s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="8" cy="8" r="2" fill="#fff" opacity="0.9" />
      </g>
      
      {/* Connection dots */}
      <circle cx="62" cy="40" r="3" fill="url(#autoGradient)">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="18" cy="40" r="3" fill="url(#autoGradient)">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
};


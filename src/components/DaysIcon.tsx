interface IconProps {
  size?: number;
}

export const DaysIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(6, 182, 212, 0.4))' }}>
    <defs>
      <linearGradient id="daysGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0e7490" />
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="108" height="108" rx="20" fill="url(#daysGrad)" />
    {/* Hourglass */}
    <path d="M40 30 L80 30 L80 35 L65 55 L65 65 L80 85 L80 90 L40 90 L40 85 L55 65 L55 55 L40 35 Z" fill="#fff" opacity="0.9" />
    {/* Sand top */}
    <path d="M45 35 L75 35 L62 50 L58 50 Z" fill="#fbbf24" />
    {/* Sand bottom */}
    <path d="M50 80 L70 80 L60 70 Z" fill="#fbbf24" />
    {/* Falling sand */}
    <rect x="58" y="55" width="4" height="12" fill="#fbbf24" />
  </svg>
);


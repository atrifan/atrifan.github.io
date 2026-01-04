interface IconProps {
  size?: number;
}

export const RiskIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(234, 179, 8, 0.4))' }}>
    <defs>
      <linearGradient id="riskGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#eab308" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#ef4444" />
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="108" height="108" rx="20" fill="url(#riskGrad)" />
    {/* Shield with exclamation */}
    <path d="M60 25 L85 38 L85 58 C85 75 72 88 60 95 C48 88 35 75 35 58 L35 38 Z" fill="#fff" opacity="0.95" />
    <path d="M60 30 L80 41 L80 58 C80 72 69 83 60 89 C51 83 40 72 40 58 L40 41 Z" fill="url(#riskGrad)" opacity="0.3" />
    {/* Exclamation mark */}
    <rect x="56" y="42" width="8" height="25" rx="3" fill="#b45309" />
    <circle cx="60" cy="76" r="5" fill="#b45309" />
    {/* Chart line going up and down */}
    <path d="M20 85 L35 75 L50 82 L65 65 L80 78 L95 60" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5" />
  </svg>
);


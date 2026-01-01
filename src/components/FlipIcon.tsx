interface IconProps {
  size?: number;
}

export const FlipIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(234, 179, 8, 0.4))' }}>
    <defs>
      <linearGradient id="flipGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#eab308" />
        <stop offset="100%" stopColor="#a16207" />
      </linearGradient>
      <linearGradient id="coinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef3c7" />
        <stop offset="100%" stopColor="#fbbf24" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="54" fill="url(#flipGrad)" />
    {/* Coin */}
    <ellipse cx="60" cy="55" rx="28" ry="30" fill="url(#coinGrad)" stroke="#d97706" strokeWidth="3" />
    {/* Coin face */}
    <circle cx="60" cy="55" r="20" fill="none" stroke="#d97706" strokeWidth="2" />
    <text x="60" y="62" textAnchor="middle" fill="#92400e" fontSize="20" fontWeight="bold">H</text>
    {/* Motion lines */}
    <path d="M30 75 Q25 60 30 45" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    <path d="M90 75 Q95 60 90 45" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
  </svg>
);


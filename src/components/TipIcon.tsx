interface IconProps {
  size?: number;
}

export const TipIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(245, 158, 11, 0.4))' }}>
    <defs>
      <linearGradient id="tipGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="54" fill="url(#tipGrad)" />
    {/* Receipt */}
    <rect x="38" y="28" width="44" height="60" rx="4" fill="#fff" />
    {/* Lines on receipt */}
    <rect x="44" y="38" width="32" height="4" rx="2" fill="#d1d5db" />
    <rect x="44" y="48" width="24" height="4" rx="2" fill="#d1d5db" />
    <rect x="44" y="58" width="28" height="4" rx="2" fill="#d1d5db" />
    {/* Total line */}
    <rect x="44" y="72" width="32" height="6" rx="2" fill="#f59e0b" />
    {/* Coin */}
    <circle cx="78" cy="78" r="14" fill="#fbbf24" stroke="#f59e0b" strokeWidth="2" />
    <text x="78" y="83" textAnchor="middle" fill="#92400e" fontSize="12" fontWeight="bold">$</text>
  </svg>
);


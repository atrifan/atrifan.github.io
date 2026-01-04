interface IconProps {
  size?: number;
}

export const NamesIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(124, 58, 237, 0.4))' }}>
    <defs>
      <linearGradient id="namesGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7c3aed" />
        <stop offset="100%" stopColor="#5b21b6" />
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="108" height="108" rx="20" fill="url(#namesGrad)" />
    {/* Name tag */}
    <rect x="30" y="40" width="60" height="40" rx="6" fill="#fff" />
    <rect x="30" y="40" width="60" height="14" rx="6" fill="#ef4444" />
    {/* Hello text */}
    <text x="60" y="50" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">HELLO</text>
    {/* Random name placeholder */}
    <text x="60" y="70" textAnchor="middle" fill="#7c3aed" fontSize="14" fontWeight="bold">???</text>
    {/* Sparkles */}
    <circle cx="25" cy="35" r="3" fill="#fbbf24" />
    <circle cx="95" cy="35" r="2" fill="#fbbf24" />
    <circle cx="90" cy="85" r="3" fill="#fbbf24" />
  </svg>
);


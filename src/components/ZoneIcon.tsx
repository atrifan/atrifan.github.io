interface IconProps {
  size?: number;
}

export const ZoneIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(37, 99, 235, 0.4))' }}>
    <defs>
      <linearGradient id="zoneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2563eb" />
        <stop offset="100%" stopColor="#1e40af" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="54" fill="url(#zoneGrad)" />
    {/* Globe */}
    <circle cx="60" cy="60" r="30" fill="none" stroke="#fff" strokeWidth="2" />
    <ellipse cx="60" cy="60" rx="30" ry="12" fill="none" stroke="#fff" strokeWidth="2" />
    <ellipse cx="60" cy="60" rx="12" ry="30" fill="none" stroke="#fff" strokeWidth="2" />
    <line x1="30" y1="60" x2="90" y2="60" stroke="#fff" strokeWidth="2" />
    {/* Clock hands */}
    <circle cx="60" cy="60" r="4" fill="#fbbf24" />
    <line x1="60" y1="60" x2="60" y2="42" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
    <line x1="60" y1="60" x2="72" y2="60" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
  </svg>
);


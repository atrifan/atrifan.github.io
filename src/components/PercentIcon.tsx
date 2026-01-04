interface IconProps {
  size?: number;
}

export const PercentIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(14, 165, 233, 0.4))' }}>
    <defs>
      <linearGradient id="percentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#0369a1" />
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="108" height="108" rx="20" fill="url(#percentGrad)" />
    {/* Percent symbol */}
    <circle cx="42" cy="42" r="10" fill="none" stroke="#fff" strokeWidth="5" />
    <circle cx="78" cy="78" r="10" fill="none" stroke="#fff" strokeWidth="5" />
    <line x1="80" y1="35" x2="40" y2="85" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
  </svg>
);


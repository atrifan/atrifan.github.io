interface IconProps {
  size?: number;
}

export const ConvertIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(100, 116, 139, 0.4))' }}>
    <defs>
      <linearGradient id="convertGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#64748b" />
        <stop offset="100%" stopColor="#334155" />
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="108" height="108" rx="20" fill="url(#convertGrad)" />
    {/* Arrows forming a cycle */}
    <path d="M75 45 L85 55 L75 65" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M35 55 L85 55" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    <path d="M45 75 L35 65 L45 55" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M85 65 L35 65" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    {/* Unit labels */}
    <text x="35" y="42" fill="#fbbf24" fontSize="12" fontWeight="bold">kg</text>
    <text x="75" y="88" fill="#fbbf24" fontSize="12" fontWeight="bold">lb</text>
  </svg>
);


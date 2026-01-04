interface IconProps {
  size?: number;
}

export const RankIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(16, 185, 129, 0.4))' }}>
    <defs>
      <linearGradient id="rankGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="50%" stopColor="#059669" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
      <linearGradient id="barGrad1" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#6ee7b7" />
      </linearGradient>
      <linearGradient id="barGrad2" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#34d399" />
      </linearGradient>
      <linearGradient id="barGrad3" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stopColor="#059669" />
        <stop offset="100%" stopColor="#10b981" />
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="108" height="108" rx="20" fill="url(#rankGrad)" />
    {/* Chart bars representing percentiles */}
    <rect x="28" y="65" width="14" height="25" rx="3" fill="url(#barGrad1)" />
    <rect x="46" y="50" width="14" height="40" rx="3" fill="url(#barGrad2)" />
    <rect x="64" y="35" width="14" height="55" rx="3" fill="url(#barGrad3)" />
    <rect x="82" y="55" width="14" height="35" rx="3" fill="url(#barGrad2)" />
    {/* Trend line */}
    <path d="M35 62 L53 47 L71 32 L89 52" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    {/* Dots on trend line */}
    <circle cx="35" cy="62" r="4" fill="#fff" />
    <circle cx="53" cy="47" r="4" fill="#fff" />
    <circle cx="71" cy="32" r="5" fill="#fbbf24" stroke="#fff" strokeWidth="2" />
    <circle cx="89" cy="52" r="4" fill="#fff" />
  </svg>
);


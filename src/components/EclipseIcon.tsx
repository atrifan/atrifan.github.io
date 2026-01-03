interface IconProps {
  size?: number;
}

export const EclipseIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(139, 92, 246, 0.5))' }}>
    <defs>
      <linearGradient id="eclipseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1e1b4b" />
        <stop offset="50%" stopColor="#312e81" />
        <stop offset="100%" stopColor="#4c1d95" />
      </linearGradient>
      <radialGradient id="coronaGrad" cx="50%" cy="50%" r="50%">
        <stop offset="60%" stopColor="transparent" />
        <stop offset="75%" stopColor="rgba(251, 191, 36, 0.3)" />
        <stop offset="90%" stopColor="rgba(251, 191, 36, 0.6)" />
        <stop offset="100%" stopColor="rgba(251, 191, 36, 0.2)" />
      </radialGradient>
      <filter id="eclipseGlow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    {/* Background */}
    <circle cx="60" cy="60" r="54" fill="url(#eclipseGrad)" />
    {/* Corona glow */}
    <circle cx="60" cy="60" r="38" fill="url(#coronaGrad)" filter="url(#eclipseGlow)" />
    {/* Sun behind (partial visible) */}
    <circle cx="60" cy="60" r="28" fill="#fbbf24" opacity="0.9" />
    {/* Moon covering sun */}
    <circle cx="55" cy="55" r="26" fill="#1e1b4b" />
    {/* Moon surface details */}
    <circle cx="48" cy="50" r="4" fill="#312e81" opacity="0.5" />
    <circle cx="62" cy="45" r="3" fill="#312e81" opacity="0.4" />
    <circle cx="52" cy="62" r="2.5" fill="#312e81" opacity="0.5" />
    <circle cx="45" cy="58" r="2" fill="#312e81" opacity="0.3" />
    {/* Corona rays */}
    <g stroke="#fbbf24" strokeWidth="1.5" opacity="0.7" filter="url(#eclipseGlow)">
      <line x1="88" y1="60" x2="95" y2="60" />
      <line x1="82" y1="40" x2="88" y2="35" />
      <line x1="82" y1="80" x2="88" y2="85" />
      <line x1="75" y1="85" x2="78" y2="92" />
      <line x1="75" y1="35" x2="78" y2="28" />
    </g>
    {/* Stars */}
    <circle cx="25" cy="30" r="1.5" fill="#fff" opacity="0.8" />
    <circle cx="90" cy="25" r="1" fill="#fff" opacity="0.6" />
    <circle cx="30" cy="85" r="1.2" fill="#fff" opacity="0.7" />
    <circle cx="85" cy="90" r="1" fill="#fff" opacity="0.5" />
    <circle cx="20" cy="55" r="0.8" fill="#fff" opacity="0.6" />
  </svg>
);


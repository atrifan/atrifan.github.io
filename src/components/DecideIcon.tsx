interface IconProps {
  size?: number;
}

export const DecideIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(34, 197, 94, 0.4))' }}>
    <defs>
      <linearGradient id="decideGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#22c55e" />
        <stop offset="100%" stopColor="#15803d" />
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="108" height="108" rx="20" fill="url(#decideGrad)" />
    {/* Thinking face */}
    <circle cx="60" cy="55" r="28" fill="#fef3c7" />
    {/* Eyes */}
    <circle cx="50" cy="50" r="4" fill="#1f2937" />
    <circle cx="70" cy="50" r="4" fill="#1f2937" />
    {/* Raised eyebrow */}
    <path d="M45 42 Q50 38 55 42" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
    {/* Thinking mouth */}
    <path d="M50 65 Q60 62 70 65" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
    {/* Question marks */}
    <text x="30" y="40" fill="#fff" fontSize="16" fontWeight="bold">?</text>
    <text x="85" y="45" fill="#fff" fontSize="12" fontWeight="bold">?</text>
    {/* Thought bubble */}
    <circle cx="88" cy="30" r="4" fill="#fff" opacity="0.8" />
    <circle cx="95" cy="22" r="3" fill="#fff" opacity="0.6" />
  </svg>
);


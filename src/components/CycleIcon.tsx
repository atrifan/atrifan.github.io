interface IconProps {
  size?: number;
}

export const CycleIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(236, 72, 153, 0.4))' }}>
    <defs>
      <linearGradient id="cycleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ec4899" />
        <stop offset="50%" stopColor="#f472b6" />
        <stop offset="100%" stopColor="#fb7185" />
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="108" height="108" rx="20" fill="url(#cycleGrad)" />
    {/* Calendar icon */}
    <rect x="30" y="35" width="60" height="50" rx="6" fill="#fff" opacity="0.95" />
    <rect x="30" y="35" width="60" height="14" rx="6" fill="#be185d" />
    {/* Calendar hooks */}
    <rect x="42" y="30" width="4" height="12" rx="2" fill="#fff" />
    <rect x="74" y="30" width="4" height="12" rx="2" fill="#fff" />
    {/* Heart in calendar */}
    <path d="M60 62 C55 57 47 57 47 65 C47 73 60 82 60 82 C60 82 73 73 73 65 C73 57 65 57 60 62Z" fill="#ec4899" />
    {/* Cycle arrow around */}
    <path d="M95 60 A35 35 0 0 1 60 95" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.6" />
    <polygon points="58,92 60,98 66,94" fill="#fff" opacity="0.6" />
  </svg>
);


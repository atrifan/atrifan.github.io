interface IconProps {
  size?: number;
}

export const SpinIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(239, 68, 68, 0.4))' }}>
    <defs>
      <linearGradient id="spinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="100%" stopColor="#b91c1c" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="54" fill="url(#spinGrad)" />
    {/* Wheel segments */}
    <circle cx="60" cy="60" r="32" fill="#fff" />
    <path d="M60 60 L60 28 A32 32 0 0 1 87.7 44 Z" fill="#fbbf24" />
    <path d="M60 60 L87.7 44 A32 32 0 0 1 87.7 76 Z" fill="#22c55e" />
    <path d="M60 60 L87.7 76 A32 32 0 0 1 60 92 Z" fill="#3b82f6" />
    <path d="M60 60 L60 92 A32 32 0 0 1 32.3 76 Z" fill="#f472b6" />
    <path d="M60 60 L32.3 76 A32 32 0 0 1 32.3 44 Z" fill="#a855f7" />
    <path d="M60 60 L32.3 44 A32 32 0 0 1 60 28 Z" fill="#f97316" />
    {/* Center */}
    <circle cx="60" cy="60" r="8" fill="#1f2937" />
    {/* Pointer */}
    <polygon points="60,22 55,12 65,12" fill="#1f2937" />
  </svg>
);


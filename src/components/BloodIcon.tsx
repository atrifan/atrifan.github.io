interface IconProps {
  size?: number;
}

export const BloodIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(239, 68, 68, 0.4))' }}>
    <defs>
      <linearGradient id="bloodGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="50%" stopColor="#dc2626" />
        <stop offset="100%" stopColor="#b91c1c" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="54" fill="url(#bloodGrad)" />
    {/* Blood drop */}
    <path
      d="M60 28 C60 28 42 50 42 66 C42 78 50 88 60 88 C70 88 78 78 78 66 C78 50 60 28 60 28Z"
      fill="#fff"
      opacity="0.95"
    />
    {/* Inner blood drop */}
    <path
      d="M60 38 C60 38 50 54 50 64 C50 72 54 78 60 78 C66 78 70 72 70 64 C70 54 60 38 60 38Z"
      fill="#ef4444"
    />
    {/* Shine on drop */}
    <ellipse cx="54" cy="58" rx="3" ry="5" fill="#fff" opacity="0.5" />
    {/* Plus sign */}
    <path d="M57 66 L63 66 M60 63 L60 69" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);


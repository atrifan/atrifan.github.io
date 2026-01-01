interface IconProps {
  size?: number;
}

export const SleepIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.4))' }}>
    <defs>
      <linearGradient id="sleepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#a855f7" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="54" fill="url(#sleepGrad)" />
    {/* Moon */}
    <path d="M70 30 C50 30 35 50 35 70 C35 90 55 100 70 95 C55 90 50 75 50 60 C50 45 60 35 70 30Z" fill="#fef3c7" />
    {/* Z's */}
    <text x="75" y="45" fill="#fff" fontSize="18" fontWeight="bold">Z</text>
    <text x="85" y="35" fill="#fff" fontSize="14" fontWeight="bold">z</text>
    <text x="92" y="28" fill="#fff" fontSize="10" fontWeight="bold">z</text>
  </svg>
);


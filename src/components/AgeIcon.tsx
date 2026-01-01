interface IconProps {
  size?: number;
}

export const AgeIcon: React.FC<IconProps> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(244, 114, 182, 0.4))' }}>
    <defs>
      <linearGradient id="ageGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f472b6" />
        <stop offset="100%" stopColor="#db2777" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="54" fill="url(#ageGrad)" />
    {/* Cake */}
    <rect x="35" y="55" width="50" height="30" rx="4" fill="#fef3c7" />
    <rect x="35" y="50" width="50" height="10" rx="2" fill="#fbbf24" />
    {/* Candles */}
    <rect x="50" y="35" width="4" height="15" fill="#60a5fa" />
    <rect x="60" y="35" width="4" height="15" fill="#f472b6" />
    <rect x="70" y="35" width="4" height="15" fill="#34d399" />
    {/* Flames */}
    <ellipse cx="52" cy="32" rx="3" ry="5" fill="#fbbf24" />
    <ellipse cx="62" cy="32" rx="3" ry="5" fill="#fbbf24" />
    <ellipse cx="72" cy="32" rx="3" ry="5" fill="#fbbf24" />
  </svg>
);


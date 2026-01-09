import React from 'react';

interface ChatIconProps {
  size?: number;
}

export const ChatIcon: React.FC<ChatIconProps> = ({ size = 160 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 12px 40px rgba(139, 92, 246, 0.5))' }}
    >
      <defs>
        <linearGradient id="chatMainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="chatBubbleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#e0e7ff" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* Background rounded rectangle */}
      <rect x="5" y="5" width="150" height="150" rx="28" fill="url(#chatMainGradient)" />

      {/* Main chat bubble */}
      <path
        d="M40 50C40 43.4 45.4 38 52 38H108C114.6 38 120 43.4 120 50V86C120 92.6 114.6 98 108 98H64L44 114V98H52C45.4 98 40 92.6 40 86V50Z"
        fill="url(#chatBubbleGradient)"
      />

      {/* AI sparkle dots */}
      <circle cx="64" cy="68" r="6" fill="url(#chatMainGradient)">
        <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="80" cy="68" r="6" fill="url(#chatMainGradient)">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="96" cy="68" r="6" fill="url(#chatMainGradient)">
        <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" begin="0.3s" />
      </circle>

      {/* AI sparkle star */}
      <path
        d="M115 30L119 38L127 42L119 46L115 54L111 46L103 42L111 38L115 30Z"
        fill="#fbbf24"
        opacity="0.9"
      >
        <animate attributeName="opacity" values="0.9;0.4;0.9" dur="2s" repeatCount="indefinite" />
      </path>

      {/* Small sparkles */}
      <circle cx="30" cy="45" r="3" fill="#fff" opacity="0.6" />
      <circle cx="140" cy="130" r="2" fill="#fff" opacity="0.5" />
    </svg>
  );
};


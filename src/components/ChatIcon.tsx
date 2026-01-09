import React from 'react';

interface ChatIconProps {
  size?: number;
}

export const ChatIcon: React.FC<ChatIconProps> = ({ size = 80 }) => {
  const scale = size / 80;
  
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 4px 8px rgba(139, 92, 246, 0.4))' }}
    >
      <defs>
        <linearGradient id="chatGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="chatBubbleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#e0e7ff" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      
      {/* Background circle */}
      <circle cx="40" cy="40" r="36" fill="url(#chatGradient)" opacity="0.2" />
      
      {/* Main chat bubble */}
      <path
        d="M20 25C20 21.6863 22.6863 19 26 19H54C57.3137 19 60 21.6863 60 25V43C60 46.3137 57.3137 49 54 49H32L22 57V49H26C22.6863 49 20 46.3137 20 43V25Z"
        fill="url(#chatBubbleGradient)"
        stroke="url(#chatGradient)"
        strokeWidth="2"
      />
      
      {/* AI sparkle dots */}
      <circle cx="32" cy="34" r="3" fill="url(#chatGradient)">
        <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="40" cy="34" r="3" fill="url(#chatGradient)">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="48" cy="34" r="3" fill="url(#chatGradient)">
        <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" begin="0.3s" />
      </circle>
      
      {/* AI sparkle */}
      <path
        d="M55 15L57 19L61 21L57 23L55 27L53 23L49 21L53 19L55 15Z"
        fill="#fbbf24"
        opacity="0.9"
      >
        <animate attributeName="opacity" values="0.9;0.4;0.9" dur="2s" repeatCount="indefinite" />
      </path>
    </svg>
  );
};


import React from 'react';
import { View } from '@adobe/react-spectrum';

interface DisclaimerBannerProps {
  title?: string;
  message?: string;
  color?: string;
}

/**
 * Disclaimer Banner Component - Beautiful Glass Design
 */
export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({
  title = 'Medical Disclaimer',
  message = 'This calculator is for informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always consult with a qualified healthcare provider before starting any diet, exercise, or fasting program. Individual results may vary.',
  color = '#fbbf24'
}) => {
  return (
    <View
      marginBottom="size-500"
      UNSAFE_style={{
        background: `linear-gradient(135deg, ${color}26 0%, ${color}1a 100%)`,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${color}4d`,
        borderRadius: '20px',
        padding: '1.5rem 2rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
        <span style={{
          fontSize: '2.5rem',
          flexShrink: 0,
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
        }}>
          ⚠️
        </span>
        <div>
          <h3 style={{
            color: color,
            fontSize: '1.3rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            margin: 0,
          }}>
            {title}
          </h3>
          <p style={{
            color: 'rgba(255, 255, 255, 0.85)',
            fontSize: '1rem',
            lineHeight: 1.6,
            margin: 0,
          }}>
            {message}
          </p>
        </div>
      </div>
    </View>
  );
};


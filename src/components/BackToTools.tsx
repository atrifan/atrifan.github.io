import Link from 'next/link';
import { TulzoLogo } from './TulzoLogo';

/**
 * Back to Tools Button - Consistent navigation across all tool pages
 * Now includes clickable logo with planetary navigation
 */
export const BackToTools: React.FC = () => {
  return (
    <div style={{ width: '100%', maxWidth: '600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
      {/* Clickable Logo */}
      <TulzoLogo />

      {/* Back to Home Link */}
      <Link href="/" style={{ textDecoration: 'none' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: 'rgba(255, 255, 255, 0.8)',
          fontSize: '1rem',
          padding: '0.5rem 1rem',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '50px',
          transition: 'all 0.3s ease',
          fontWeight: 500,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.transform = 'translateX(-5px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.transform = 'translateX(0)';
        }}
        >
          <span style={{ fontSize: '1.2rem' }}>←</span>
          <span>Back to Tools</span>
        </div>
      </Link>
    </div>
  );
};


import { Link } from 'react-router-dom';

/**
 * Back to Tools Button - Consistent navigation across all tool pages
 */
export const BackToTools: React.FC = () => {
  return (
    <Link to="/" style={{ textDecoration: 'none' }}>
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
      }}>
        <span style={{ fontSize: '1.2rem' }}>←</span>
        <span>Back to Tools</span>
      </div>
    </Link>
  );
};


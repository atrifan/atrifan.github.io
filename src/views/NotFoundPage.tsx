import { View, Flex } from '@adobe/react-spectrum';
import Link from 'next/link';

/**
 * 404 Not Found Page
 * No ads are shown on this page to comply with AdSense policies
 * (ads should not appear on pages without meaningful content)
 */
export const NotFoundPage = () => {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      padding: 'clamp(1rem, 3vw, 2rem)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <Flex direction="column" alignItems="center" gap="size-400">
        <View UNSAFE_style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '6rem', marginBottom: '1rem' }}>🔍</div>
          <h1 style={{
            fontSize: 'clamp(2rem, 6vw, 4rem)',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: 0
          }}>
            404
          </h1>
          <p style={{
            fontSize: 'clamp(1rem, 3vw, 1.5rem)',
            color: 'rgba(255,255,255,0.8)',
            marginTop: '0.5rem'
          }}>
            Page Not Found
          </p>
          <p style={{
            fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)',
            color: 'rgba(255,255,255,0.6)',
            marginTop: '1rem',
            maxWidth: '400px'
          }}>
            The page you're looking for doesn't exist or has been moved.
          </p>
        </View>

        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '1rem 2rem',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '12px',
            fontWeight: 600,
            fontSize: '1.1rem',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
          }}
        >
          ← Back to Home
        </Link>
      </Flex>
    </div>
  );
};


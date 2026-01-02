import { View } from '@adobe/react-spectrum';

/**
 * Footer Component - Consistent copyright across all tool pages
 * "Made with love for your POCKET"
 */
export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  const linkStyle = {
    color: 'rgba(255, 255, 255, 0.5)',
    textDecoration: 'none',
    margin: '0 0.5rem',
  };

  return (
    <View UNSAFE_style={{ textAlign: 'center', padding: 'clamp(1rem, 3vw, 2rem) 0' }}>
      <p style={{
        margin: 0,
        fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
        color: 'rgba(255, 255, 255, 0.7)',
        fontWeight: 500,
      }}>
        Made with 💜 for your <span style={{ fontWeight: 700 }}>POCKET</span>
      </p>
      <p style={{
        margin: '0.35rem 0 0 0',
        fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
        color: 'rgba(255, 255, 255, 0.4)',
      }}>
        © {currentYear} <a href="https://tulzo.com" style={{ color: 'rgba(255, 255, 255, 0.5)', textDecoration: 'none' }}>Tulzo</a> — Free tools, no BS
      </p>
      <p style={{
        margin: '0.5rem 0 0 0',
        fontSize: 'clamp(0.65rem, 1.8vw, 0.75rem)',
      }}>
        <a href="https://www.iubenda.com/privacy-policy/11077306" className="iubenda-white iubenda-noiframe iubenda-embed iubenda-noiframe" title="Privacy Policy" style={linkStyle}>Privacy Policy</a>
        <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>•</span>
        <a href="https://www.iubenda.com/privacy-policy/11077306/cookie-policy" className="iubenda-white iubenda-noiframe iubenda-embed iubenda-noiframe" title="Cookie Policy" style={linkStyle}>Cookie Policy</a>
        <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>•</span>
        <a href="https://www.iubenda.com/terms-and-conditions/11077306" className="iubenda-white iubenda-noiframe iubenda-embed iubenda-noiframe" title="Terms and Conditions" style={linkStyle}>Terms</a>
      </p>
    </View>
  );
};


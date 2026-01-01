import { View } from '@adobe/react-spectrum';

/**
 * Footer Component - Consistent copyright across all tool pages
 * "Made with love for your POCKET"
 */
export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <View UNSAFE_style={{ textAlign: 'center', padding: '2rem 0' }}>
      <p style={{ 
        margin: 0, 
        fontSize: '1rem', 
        color: 'rgba(255, 255, 255, 0.7)',
        fontWeight: 500,
      }}>
        Made with 💜 for your <span style={{ fontWeight: 700 }}>POCKET</span>
      </p>
      <p style={{
        margin: '0.5rem 0 0 0',
        fontSize: '0.85rem',
        color: 'rgba(255, 255, 255, 0.4)',
      }}>
        © {currentYear} <a href="https://tulzo.com" style={{ color: 'rgba(255, 255, 255, 0.5)', textDecoration: 'none' }}>Tulzo</a> — Free tools, no BS
      </p>
    </View>
  );
};


import { Component } from 'react';
import { Link } from 'react-router-dom';
import { TOOLS } from '../config/tools.config';

interface PlanetaryNavProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Planetary Navigation Component
 * Shows tools as orbiting planets around the logo
 */
export class PlanetaryNav extends Component<PlanetaryNavProps> {
  componentDidMount() {
    // Close on escape key
    document.addEventListener('keydown', this.handleEscape);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleEscape);
  }

  private handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.props.isOpen) {
      this.props.onClose();
    }
  };

  render() {
    const { isOpen, onClose } = this.props;

    if (!isOpen) return null;

    // Calculate positions for planets in orbit
    const radius = 180; // Distance from center
    const angleStep = (2 * Math.PI) / TOOLS.length;

    return (
      <>
        {/* Backdrop */}
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            zIndex: 9998,
            animation: 'fadeIn 0.3s ease-out',
          }}
        />

        {/* Planetary System */}
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 9999,
            animation: 'scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {/* Central Sun (Logo) */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              animation: 'rotate 20s linear infinite',
            }}
          >
            <svg
              width="100"
              height="100"
              viewBox="0 0 120 120"
              style={{ filter: 'drop-shadow(0 0 30px rgba(102, 126, 234, 0.8))' }}
            >
              <defs>
                <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#667eea" />
                  <stop offset="50%" stopColor="#764ba2" />
                  <stop offset="100%" stopColor="#f472b6" />
                </linearGradient>
                <linearGradient id="boltGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
              <circle cx="60" cy="60" r="56" fill="url(#logoGradient)" />
              <path
                d="M68 25 L45 58 L58 58 L52 95 L75 55 L62 55 L68 25Z"
                fill="url(#boltGradient)"
                stroke="#fff"
                strokeWidth="2"
              />
            </svg>
          </div>

          {/* Orbit Ring */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: radius * 2,
              height: radius * 2,
              border: '2px dashed rgba(255, 255, 255, 0.2)',
              borderRadius: '50%',
              animation: 'rotate 30s linear infinite reverse',
            }}
          />

          {/* Planet Tools */}
          {TOOLS.map((tool, index) => {
            const angle = index * angleStep - Math.PI / 2; // Start from top
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const delay = index * 0.1;

            return (
              <Link
                key={tool.id}
                to={tool.path}
                onClick={onClose}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                  textDecoration: 'none',
                  animation: `planetAppear 0.5s ease-out ${delay}s both`,
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: tool.gradient,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: `0 8px 32px ${tool.color}66`,
                    border: '3px solid rgba(255, 255, 255, 0.3)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.2)';
                    e.currentTarget.style.boxShadow = `0 12px 48px ${tool.color}99`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = `0 8px 32px ${tool.color}66`;
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>{tool.icon}</div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff' }}>
                    {tool.name}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes scaleIn {
            from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
            to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          }
          @keyframes rotate {
            from { transform: translate(-50%, -50%) rotate(0deg); }
            to { transform: translate(-50%, -50%) rotate(360deg); }
          }
          @keyframes planetAppear {
            from { transform: translate(calc(-50% + ${0}px), calc(-50% + ${0}px)) scale(0); opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      </>
    );
  }
}


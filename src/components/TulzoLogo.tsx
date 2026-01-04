import { Component } from 'react';
import { PlanetaryNav } from './PlanetaryNav';

interface TulzoLogoState {
  showNav: boolean;
}

/**
 * Tulzo Logo Component
 * Clickable logo that opens planetary navigation
 */
export class TulzoLogo extends Component<{}, TulzoLogoState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      showNav: false,
    };
  }

  private toggleNav = () => {
    this.setState({ showNav: !this.state.showNav });
  };

  render() {
    const { showNav } = this.state;

    return (
      <>
        <div
          onClick={this.toggleNav}
          style={{
            cursor: 'pointer',
            display: 'inline-block',
            transition: 'transform 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
          }}
          title="Click to see all tools"
        >
          <svg
            width="60"
            height="60"
            viewBox="0 0 120 120"
            style={{ filter: 'drop-shadow(0 8px 24px rgba(102, 126, 234, 0.5))' }}
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
            <rect x="4" y="4" width="112" height="112" rx="20" fill="url(#logoGradient)" />
            <path
              d="M68 25 L45 58 L58 58 L52 95 L75 55 L62 55 L68 25Z"
              fill="url(#boltGradient)"
              stroke="#fff"
              strokeWidth="2"
            />
          </svg>
        </div>

        <PlanetaryNav isOpen={showNav} onClose={() => this.setState({ showNav: false })} />
      </>
    );
  }
}


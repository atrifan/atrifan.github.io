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
          <img
            src="/tulzo-logo.png"
            alt="Tulzo"
            width={60}
            height={60}
            style={{
              filter: 'drop-shadow(0 8px 24px rgba(102, 126, 234, 0.5))',
              borderRadius: '12px',
            }}
          />
        </div>

        <PlanetaryNav isOpen={showNav} onClose={() => this.setState({ showNav: false })} />
      </>
    );
  }
}


import { Component } from 'react';
import { Link } from 'react-router-dom';
import { View, Heading } from '@adobe/react-spectrum';
import { TOOLS, ToolConfig } from '../config/tools.config';
import { AdBanner } from '../components/AdBanner';
import { ADS_CONFIG } from '../config/ads.config';
import { CutIcon } from '../components/CutIcon';
import { StackIcon } from '../components/StackIcon';
import { WhenIcon } from '../components/WhenIcon';

interface HomePageState {
  hoveredTool: string | null;
}

/**
 * Beautiful Home Page with Tool Grid
 */
export class HomePage extends Component<{}, HomePageState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      hoveredTool: null
    };
  }

  componentDidMount() {
    // Reset to default SEO when returning to home
    document.title = 'Tulzo - Free Online Calculators: Weight Loss, Budget Planner, Date Calculator';

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Free online calculators and tools: Weight loss calculator with fasting plans, budget & savings planner, day of week finder. Calculate calories, plan finances, find dates. 100% free, no signup required.');
    }

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', 'Tulzo - Free Online Calculators for Health, Money & Dates');

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', 'Free calculators: Weight loss & fasting planner, budget & savings calculator, day of week finder. Simple, beautiful, 100% free.');
  }

  private renderToolCard = (tool: ToolConfig, index: number): JSX.Element => {
    const isAvailable = tool.available;
    const delay = index * 0.1;

    // For coming soon tools, render blurred placeholder
    if (!isAvailable) {
      return (
        <div
          key={tool.id}
          className="fade-in-up"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '32px',
            padding: '3rem 2rem',
            textAlign: 'center',
            cursor: 'not-allowed',
            minHeight: '280px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.5rem',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            animationDelay: `${delay}s`,
            position: 'relative',
            overflow: 'hidden',
            filter: 'blur(2px)',
          }}
        >
          {/* Blurred placeholder icon */}
          <span style={{ fontSize: '5rem', opacity: 0.3 }}>❓</span>

          {/* Coming Soon text */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            padding: '1rem 2rem',
            borderRadius: '50px',
            fontSize: '1.2rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            filter: 'blur(0)',
            backdropFilter: 'blur(0)',
          }}>
            Coming Soon
          </div>
        </div>
      );
    }

    return (
      <Link
        key={tool.id}
        to={tool.path}
        style={{ textDecoration: 'none' }}
      >
        <div
          className="hover-lift fade-in-up"
          style={{
            background: tool.gradient,
            borderRadius: '32px',
            padding: '3rem 2rem',
            textAlign: 'center',
            cursor: 'pointer',
            minHeight: '280px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.5rem',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            animationDelay: `${delay}s`,
            position: 'relative',
            overflow: 'hidden',
          }}
          onMouseEnter={() => this.setState({ hoveredTool: tool.id })}
          onMouseLeave={() => this.setState({ hoveredTool: null })}
        >
          {/* Glow effect */}
          <div style={{
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
            opacity: this.state.hoveredTool === tool.id ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }} />

          {/* Icon */}
          <div className="animate-float" style={{ animationDelay: `${delay}s` }}>
            {tool.id === 'cut' ? (
              <CutIcon size={120} />
            ) : tool.id === 'stack' ? (
              <StackIcon size={120} />
            ) : tool.id === 'when' ? (
              <WhenIcon size={120} />
            ) : (
              <span className="big-icon">{tool.icon}</span>
            )}
          </div>

          {/* Name */}
          <h2 style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            color: '#ffffff',
            margin: 0,
            textShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            letterSpacing: '0.05em',
          }}>
            {tool.name}
          </h2>

          {/* Description */}
          <p style={{
            fontSize: '1.1rem',
            color: 'rgba(255, 255, 255, 0.9)',
            margin: 0,
            maxWidth: '250px',
            lineHeight: 1.5,
          }}>
            {tool.description}
          </p>
        </div>
      </Link>
    );
  };

  render() {
    return (
      <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
        <View maxWidth="1400px" marginX="auto">
          {/* Hero Section */}
          <View UNSAFE_style={{ textAlign: 'center', paddingTop: '4rem', paddingBottom: '3rem' }}>
            {/* SVG Logo */}
            <div className="animate-float" style={{ marginBottom: '2rem' }}>
              <svg
                width="120"
                height="120"
                viewBox="0 0 120 120"
                style={{ filter: 'drop-shadow(0 8px 24px rgba(102, 126, 234, 0.5))' }}
              >
                {/* Background circle with gradient */}
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
                {/* Lightning bolt - speed symbol */}
                <path
                  d="M68 25 L45 58 L58 58 L52 95 L75 55 L62 55 L68 25Z"
                  fill="url(#boltGradient)"
                  stroke="#fff"
                  strokeWidth="2"
                />
              </svg>
            </div>

            {/* Title - Tulzo */}
            <h1 style={{
              fontSize: 'clamp(4rem, 12vw, 7rem)',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #fff 0%, #a78bfa 50%, #f472b6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '1rem',
              letterSpacing: '0.1em',
            }}>
              TULZO
            </h1>

            {/* Motto */}
            <p style={{
              fontSize: 'clamp(1.3rem, 3vw, 1.8rem)',
              color: 'rgba(255, 255, 255, 0.95)',
              fontWeight: 600,
              fontStyle: 'italic',
              margin: '0 auto 3rem',
            }}>
              Tools for your day.
            </p>
          </View>

          {/* Ad Banner - Home Hero */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
            <AdBanner slot={ADS_CONFIG.slots.homeHero} format="horizontal" />
          </View>

          {/* Tools Grid */}
          <View marginTop="size-600" marginBottom="size-600">
            <Heading level={2} UNSAFE_style={{
              textAlign: 'center',
              color: '#fff',
              marginBottom: '3rem',
              fontSize: '1.8rem',
              fontWeight: 600,
              opacity: 0.9,
            }}>
              Your day to day tools
            </Heading>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '2rem',
              padding: '0 1rem',
            }}>
              {TOOLS.map((tool, index) => this.renderToolCard(tool, index))}
            </div>
          </View>

          {/* Bottom Ad - Home Footer */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
            <AdBanner slot={ADS_CONFIG.slots.homeFooter} format="horizontal" />
          </View>
        </View>
      </View>
    );
  }
}


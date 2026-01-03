import { Component } from 'react';
import Link from 'next/link';
import { View } from '@adobe/react-spectrum';
import { ToolConfig, CATEGORY_LABELS, getToolsByCategory, getCategoryOrder } from '../config/tools.config';
import { AdBanner } from '../components/AdBanner';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';
import { CutIcon } from '../components/CutIcon';
import { StackIcon } from '../components/StackIcon';
import { WhenIcon } from '../components/WhenIcon';
import { TapIcon } from '../components/TapIcon';
import { LuckIcon } from '../components/LuckIcon';
import { MatchIcon } from '../components/MatchIcon';
import { PlanetaryNav } from '../components/PlanetaryNav';
// New tool icons
import { SleepIcon } from '../components/SleepIcon';
import { AgeIcon } from '../components/AgeIcon';
import { TipIcon } from '../components/TipIcon';
import { PercentIcon } from '../components/PercentIcon';
import { DaysIcon } from '../components/DaysIcon';
import { ZoneIcon } from '../components/ZoneIcon';
import { ConvertIcon } from '../components/ConvertIcon';
import { NamesIcon } from '../components/NamesIcon';
import { FlipIcon } from '../components/FlipIcon';
import { SpinIcon } from '../components/SpinIcon';
import { DecideIcon } from '../components/DecideIcon';
import { RankIcon } from '../components/RankIcon';
import { BrainIcon } from '../components/BrainIcon';
import { VibeIcon } from '../components/VibeIcon';
import { CycleIcon } from '../components/CycleIcon';
import { RiskIcon } from '../components/RiskIcon';
import { WeatherTimeCardWrapper } from '../components/WeatherTimeCardWrapper';
import { Footer } from '../components/Footer';

interface HomePageState {
  hoveredTool: string | null;
  showPlanetaryNav: boolean;
}

/**
 * Beautiful Home Page with Tool Grid
 */
export class HomePage extends Component<{}, HomePageState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      hoveredTool: null,
      showPlanetaryNav: false,
    };
  }

  componentDidMount() {
    applySEO('home');
  }

  private renderToolIcon = (toolId: string, size: number): JSX.Element => {
    const iconMap: Record<string, JSX.Element> = {
      cut: <CutIcon size={size} />,
      stack: <StackIcon size={size} />,
      when: <WhenIcon size={size} />,
      tap: <TapIcon size={size} />,
      luck: <LuckIcon size={size} />,
      match: <MatchIcon size={size} />,
      sleep: <SleepIcon size={size} />,
      unique: <RankIcon size={size} />,
      cycle: <CycleIcon size={size} />,
      age: <AgeIcon size={size} />,
      tip: <TipIcon size={size} />,
      risk: <RiskIcon size={size} />,
      percent: <PercentIcon size={size} />,
      days: <DaysIcon size={size} />,
      zone: <ZoneIcon size={size} />,
      convert: <ConvertIcon size={size} />,
      names: <NamesIcon size={size} />,
      flip: <FlipIcon size={size} />,
      spin: <SpinIcon size={size} />,
      decide: <DecideIcon size={size} />,
      brain: <BrainIcon size={size} />,
      vibe: <VibeIcon size={size} />,
    };
    return iconMap[toolId] || <span className="big-icon">🔧</span>;
  };

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
        href={tool.path}
        style={{ textDecoration: 'none' }}
      >
        <div
          className="hover-lift fade-in-up"
          style={{
            background: tool.gradient,
            borderRadius: '24px',
            padding: '2rem 1.5rem',
            textAlign: 'center',
            cursor: 'pointer',
            height: '280px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: '0.75rem',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            animationDelay: `${delay}s`,
            position: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={(e) => {
            this.setState({ hoveredTool: tool.id });
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.35)';
          }}
          onMouseLeave={(e) => {
            this.setState({ hoveredTool: null });
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.25)';
          }}
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
          <div className="animate-float" style={{ animationDelay: `${delay}s`, flexShrink: 0 }}>
            {this.renderToolIcon(tool.id, 80)}
          </div>

          {/* Brand Name */}
          <h2 style={{
            fontSize: '1.8rem',
            fontWeight: 800,
            color: '#ffffff',
            margin: 0,
            textShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}>
            {tool.name}
          </h2>

          {/* Descriptive Name - SEO visible */}
          <h3 style={{
            fontSize: '1rem',
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.95)',
            margin: 0,
            flexShrink: 0,
          }}>
            {tool.descriptiveName}
          </h3>

          {/* Short Description - takes remaining space */}
          <p style={{
            fontSize: '0.9rem',
            color: 'rgba(255, 255, 255, 0.8)',
            margin: 0,
            maxWidth: '250px',
            lineHeight: 1.4,
            flex: 1,
            display: 'flex',
            alignItems: 'center',
          }}>
            {tool.shortDescription}
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
            {/* SVG Logo - Clickable */}
            <div
              className="animate-float"
              style={{
                marginBottom: '2rem',
                cursor: 'pointer',
                display: 'inline-block',
                transition: 'transform 0.3s ease',
              }}
              onClick={() => this.setState({ showPlanetaryNav: true })}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
              }}
              title="Click to see planetary navigation"
            >
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

            {/* Brand - Tulzo */}
            <div style={{
              fontSize: 'clamp(2.5rem, 8vw, 4rem)',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #fff 0%, #a78bfa 50%, #f472b6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '1.5rem',
              letterSpacing: '0.1em',
            }}>
              TULZO
            </div>

            {/* H1 - Main headline */}
            <h1 style={{
              fontSize: 'clamp(1.8rem, 5vw, 3rem)',
              fontWeight: 700,
              color: '#fff',
              margin: '0 0 1rem 0',
              lineHeight: 1.2,
            }}>
              Handy Tools for Everyday Tasks
            </h1>

            {/* Sub-headline */}
            <p style={{
              fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)',
              color: 'rgba(255, 255, 255, 0.9)',
              fontWeight: 400,
              margin: '0 auto 1.5rem',
              maxWidth: '600px',
              lineHeight: 1.5,
            }}>
              Fast, free utilities for health, money, time, and simple decisions — all in one place.
            </p>

            {/* Micro-line */}
            <p style={{
              fontSize: 'clamp(0.85rem, 2vw, 1rem)',
              color: 'rgba(255, 255, 255, 0.6)',
              fontWeight: 500,
              margin: '0 auto 2rem',
            }}>
              No sign-ups • Instant results • Works on any device
            </p>
          </View>

          {/* Weather & Time Card */}
          <WeatherTimeCardWrapper />

          {/* Ad Banner - Home Hero */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
            <AdBanner slot={ADS_CONFIG.slots.homeHero} format="horizontal" />
          </View>

          {/* Tools Grid - Grouped by Category */}
          <View marginTop="size-600" marginBottom="size-600">
            {getCategoryOrder().map((category) => {
              const toolsInCategory = getToolsByCategory()[category];
              if (toolsInCategory.length === 0) return null;

              return (
                <div key={category} style={{ marginBottom: '3rem' }}>
                  {/* Category Header */}
                  <h2 style={{
                    fontSize: '1.4rem',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.8)',
                    marginBottom: '1.5rem',
                    paddingLeft: '1rem',
                    borderLeft: '4px solid rgba(255, 255, 255, 0.3)',
                  }}>
                    {CATEGORY_LABELS[category]}
                  </h2>

                  {/* Tools in this category */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '1.5rem',
                    padding: '0 1rem',
                  }}>
                    {toolsInCategory.map((tool, index) => this.renderToolCard(tool, index))}
                  </div>
                </div>
              );
            })}
          </View>

          {/* About Tulzo - SEO Context Block */}
          <View UNSAFE_style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            padding: 'clamp(1.5rem, 4vw, 2.5rem)',
            marginBottom: '2rem',
            maxWidth: '800px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '1.5rem',
            }}>
              <span style={{ fontSize: '1.75rem' }}>⚡</span>
              <h2 style={{
                fontSize: 'clamp(1.25rem, 3vw, 1.5rem)',
                fontWeight: 700,
                color: '#fff',
                margin: 0,
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                About Tulzo
              </h2>
            </div>

            {/* Description */}
            <p style={{
              fontSize: 'clamp(0.95rem, 2.5vw, 1.05rem)',
              color: 'rgba(255, 255, 255, 0.75)',
              lineHeight: 1.7,
              margin: '0 0 1.5rem',
            }}>
              Tulzo is a collection of fast, free handy tools designed for everyday tasks. Whether you&apos;re planning
              weight loss goals, tracking your budget, finding what day a date falls on, counting clicks or reps,
              generating random numbers, or checking zodiac compatibility — we&apos;ve got you covered.
            </p>

            {/* Feature Pills */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '1.5rem',
            }}>
              {[
                { icon: '🚀', text: 'Instant & Fast' },
                { icon: '🆓', text: '100% Free' },
                { icon: '🔒', text: 'Privacy First' },
                { icon: '📱', text: 'Mobile Friendly' },
                { icon: '🤖', text: 'AI-Ready' },
              ].map((item) => (
                <span
                  key={item.text}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
                    color: 'rgba(255, 255, 255, 0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  {item.icon} {item.text}
                </span>
              ))}
            </div>

            {/* Bottom text */}
            <p style={{
              fontSize: 'clamp(0.85rem, 2vw, 0.95rem)',
              color: 'rgba(255, 255, 255, 0.6)',
              lineHeight: 1.6,
              margin: 0,
            }}>
              Each tool is built to be simple, instant, and accessible on any device. No accounts required, no sign-ups, no hassle.
              Just open and use. We believe useful tools should be free and easy to access for everyone.
            </p>
          </View>

          {/* Bottom Ad - Home Footer */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
            <AdBanner slot={ADS_CONFIG.slots.homeFooter} format="horizontal" />
          </View>

          <Footer />
        </View>

        {/* Planetary Navigation */}
        <PlanetaryNav
          isOpen={this.state.showPlanetaryNav}
          onClose={() => this.setState({ showPlanetaryNav: false })}
        />
      </View>
    );
  }
}


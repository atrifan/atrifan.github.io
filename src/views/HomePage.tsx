import { Component } from 'react';
import Link from 'next/link';
import { View } from '@adobe/react-spectrum';
import { ToolConfig, CATEGORY_LABELS, getToolsByCategory, getCategoryOrder, TOTAL_UI_TOOL_COUNT } from '../config/tools.config';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
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
import { BloodIcon } from '../components/BloodIcon';
import { EclipseIcon } from '../components/EclipseIcon';
import { ChatIcon } from '../components/ChatIcon';
import { AutomationIcon } from '../components/AutomationIcon';
import { WeatherTimeCardWrapper } from '../components/WeatherTimeCardWrapper';
import { Footer } from '../components/Footer';

interface HomePageState {
  hoveredTool: string | null;
  showPlanetaryNav: boolean;
  collapsedCategories: Set<string>;
  isTouchDevice: boolean;
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
      collapsedCategories: new Set<string>(),
      isTouchDevice: false,
    };
  }

  componentDidMount() {
    // Detect touch device
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.setState({ isTouchDevice });
  }

  private toggleCategory = (category: string) => {
    this.setState(prevState => {
      const newCollapsed = new Set(prevState.collapsedCategories);
      if (newCollapsed.has(category)) {
        newCollapsed.delete(category);
      } else {
        newCollapsed.add(category);
      }
      return { collapsedCategories: newCollapsed };
    });
  };

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
      blood: <BloodIcon size={size} />,
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
      eclipse: <EclipseIcon size={size} />,
      chat: <ChatIcon size={size} />,
      automation: <AutomationIcon size={size} />,
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
            if (this.state.isTouchDevice) return;
            this.setState({ hoveredTool: tool.id });
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.35)';
          }}
          onMouseLeave={(e) => {
            if (this.state.isTouchDevice) return;
            this.setState({ hoveredTool: null });
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.25)';
          }}
        >
          {/* Pro Ribbon for AI tools */}
          {tool.isPro && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '-32px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#fff',
              padding: '0.25rem 2.5rem',
              fontSize: '0.65rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              transform: 'rotate(45deg)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              zIndex: 10,
            }}>
              PRO
            </div>
          )}

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
            maxWidth: '16rem',
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
        {/* Side Ads - Desktop Only */}
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />

        <View maxWidth="56rem" marginX="auto">
          {/* Ad Banner - Home Top (above logo) */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '50rem', margin: '0 auto', paddingTop: '1rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.homeTop} format="horizontal" />
          </View>

          {/* Hero Section */}
          <View UNSAFE_style={{ textAlign: 'center', paddingTop: '2rem', paddingBottom: '3rem' }}>
            {/* Logo - Clickable */}
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
                if (this.state.isTouchDevice) return;
                e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)';
              }}
              onMouseLeave={(e) => {
                if (this.state.isTouchDevice) return;
                e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
              }}
              title="Click to see planetary navigation"
            >
              <img
                src="/tulzo-logo.png"
                alt="Tulzo"
                width={120}
                height={120}
                style={{
                  filter: 'drop-shadow(0 8px 24px rgba(102, 126, 234, 0.5))',
                  borderRadius: '20px',
                }}
              />
            </div>

            {/* Brand - Tulzo */}
            <div style={{
              fontSize: 'clamp(2.5rem, 8vw, 4rem)',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #fff 0%, #a78bfa 50%, #f472b6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '1.5rem',
              letterSpacing: '0.05em',
            }}>
              Tulzo
            </div>

            {/* H1 - Main headline */}
            <h1 style={{
              fontSize: 'clamp(1.8rem, 5vw, 3rem)',
              fontWeight: 700,
              color: '#fff',
              margin: '0 0 1rem 0',
              lineHeight: 1.2,
            }}>
              Tools for You. And Your AI.
            </h1>

            {/* Sub-headline */}
            <p style={{
              fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)',
              color: 'rgba(255, 255, 255, 0.9)',
              fontWeight: 400,
              margin: '0 auto 1.5rem',
              maxWidth: '40rem',
              lineHeight: 1.5,
            }}>
              20+ instant utilities for health, money, time, and decisions. Free in your browser — upgrade to connect your AI assistant.
            </p>

            {/* Micro-line */}
            <p style={{
              fontSize: 'clamp(0.85rem, 2vw, 1rem)',
              color: 'rgba(255, 255, 255, 0.6)',
              fontWeight: 500,
              margin: '0 auto 2rem',
            }}>
              No sign-ups • Instant results • Pro unlocks Claude, ChatGPT & more
            </p>
          </View>

          {/* Weather & Time Card */}
          <WeatherTimeCardWrapper />

          {/* Ad Banner - Home Hero */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '50rem', margin: '0 auto' }}>
            <AdBanner slot={ADS_CONFIG.slots.homeHero} format="horizontal" />
          </View>

          {/* Tools Grid - Grouped by Category */}
          <View marginTop="size-600" marginBottom="size-600">
            {getCategoryOrder().map((category) => {
              const toolsInCategory = getToolsByCategory()[category];
              if (toolsInCategory.length === 0) return null;
              const isCollapsed = this.state.collapsedCategories.has(category);

              return (
                <div key={category} style={{ marginBottom: '2rem' }}>
                  {/* Category Header - Clickable */}
                  <button
                    onClick={() => this.toggleCategory(category)}
                    className="category-toggle-btn"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '1rem',
                      borderLeft: '4px solid rgba(255, 255, 255, 0.3)',
                      borderRadius: '0 0.5rem 0.5rem 0',
                      transition: 'background 0.2s',
                      minHeight: '3.5rem',
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'rgba(255, 255, 255, 0.1)',
                    }}
                    onMouseEnter={(e) => { if (!this.state.isTouchDevice) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
                    onMouseLeave={(e) => { if (!this.state.isTouchDevice) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'; }}
                  >
                    <span style={{
                      fontSize: '1rem',
                      color: 'rgba(255, 255, 255, 0.6)',
                      transition: 'transform 0.3s',
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      flexShrink: 0,
                    }}>
                      ▼
                    </span>
                    <h2 style={{
                      fontSize: 'clamp(1.1rem, 4vw, 1.4rem)',
                      fontWeight: 600,
                      color: 'rgba(255, 255, 255, 0.8)',
                      margin: 0,
                      textAlign: 'left',
                    }}>
                      {CATEGORY_LABELS[category]}
                    </h2>
                    <span className="tool-count" style={{
                      fontSize: '0.8rem',
                      color: 'rgba(255, 255, 255, 0.4)',
                      marginLeft: 'auto',
                      flexShrink: 0,
                      background: 'rgba(255, 255, 255, 0.1)',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '1rem',
                    }}>
                      {toolsInCategory.length}
                    </span>
                  </button>

                  {/* Tools in this category - Collapsible */}
                  <div style={{
                    display: isCollapsed ? 'none' : 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
                    gap: '1rem',
                    padding: '1rem 0.5rem 0',
                    overflow: 'hidden',
                  }}>
                    {toolsInCategory.map((tool, index) => this.renderToolCard(tool, index))}
                  </div>
                </div>
              );
            })}
          </View>

          {/* Mobile-friendly styles for category toggles */}
          <style>{`
            @media (max-width: 480px) {
              .category-toggle-btn {
                padding: 0.875rem 0.75rem !important;
                gap: 0.5rem !important;
              }
              .tool-count {
                font-size: 0.7rem !important;
                padding: 0.2rem 0.4rem !important;
              }
            }
            .category-toggle-btn:active {
              background: rgba(255, 255, 255, 0.12) !important;
            }
          `}</style>

          {/* About Tulzo - SEO Context Block */}
          <View UNSAFE_style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            padding: 'clamp(1.5rem, 4vw, 2.5rem)',
            marginBottom: '2rem',
            maxWidth: '56rem',
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

            {/* Main Description */}
            <p style={{
              fontSize: 'clamp(0.95rem, 2.5vw, 1.05rem)',
              color: 'rgba(255, 255, 255, 0.85)',
              lineHeight: 1.7,
              margin: '0 0 1.25rem',
            }}>
              Tulzo is your go-to collection of <strong style={{ color: '#a78bfa' }}>{TOTAL_UI_TOOL_COUNT}+ online tools</strong> for health, finance, time, and fun.
              Web tools work instantly in your browser — no downloads, no sign-ups. <strong style={{ color: '#a78bfa' }}>Pro & Plus subscriptions</strong> unlock AI-powered MCP integration for use with Claude, ChatGPT, and other AI assistants.
            </p>

            {/* Tool Categories */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}>
              {/* Health Tools */}
              <div style={{
                background: 'rgba(236, 72, 153, 0.1)',
                border: '1px solid rgba(236, 72, 153, 0.2)',
                borderRadius: '12px',
                padding: '1rem',
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ec4899', marginBottom: '0.5rem' }}>
                  💪 Health & Body
                </div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                  Weight loss planner, sleep cycle calculator, period tracker, donation calculator, blood compatibility, baby blood predictor
                </div>
              </div>

              {/* Money Tools */}
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: '12px',
                padding: '1rem',
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#10b981', marginBottom: '0.5rem' }}>
                  💰 Money & Finance
                </div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                  Budget calculator, tip calculator, percentage calculator, trading position size & risk calculator
                </div>
              </div>

              {/* Time Tools */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '12px',
                padding: '1rem',
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#3b82f6', marginBottom: '0.5rem' }}>
                  ⏰ Time & Dates
                </div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                  Date finder, countdown timer, time zone converter, age calculator
                </div>
              </div>

              {/* Fun Tools */}
              <div style={{
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                borderRadius: '12px',
                padding: '1rem',
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#8b5cf6', marginBottom: '0.5rem' }}>
                  🎲 Fun & Random
                </div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                  Coin flip, dice roller, wheel spinner, decision maker, zodiac compatibility, name generator, cat/dog quiz
                </div>
              </div>
            </div>

            {/* Feature Pills */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '1.5rem',
            }}>
              {[
                { icon: '🚀', text: 'Instant Results' },
                { icon: '🆓', text: 'Free Web Tools' },
                { icon: '🔒', text: 'No Data Collection' },
                { icon: '📱', text: 'Works on Any Device' },
                { icon: '🤖', text: 'AI & MCP Ready (Pro)' },
                { icon: '🌙', text: 'Dark Mode' },
              ].map((item) => (
                <span
                  key={item.text}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: 'clamp(0.75rem, 2vw, 0.85rem)',
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

            {/* MCP Integration Note */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15))',
              border: '1px solid rgba(102, 126, 234, 0.3)',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
            }}>
              <p style={{
                fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
                color: 'rgba(255, 255, 255, 0.85)',
                lineHeight: 1.5,
                margin: 0,
              }}>
                <strong style={{ color: '#a78bfa' }}>🤖 AI Integration:</strong> All Tulzo tools are available as an{' '}
                <strong>MCP (Model Context Protocol) server</strong> — connect Claude, ChatGPT, or any AI assistant to use these tools directly in your conversations.
              </p>
            </div>

            {/* Bottom text */}
            <p style={{
              fontSize: 'clamp(0.85rem, 2vw, 0.95rem)',
              color: 'rgba(255, 255, 255, 0.6)',
              lineHeight: 1.6,
              margin: 0,
            }}>
              Built for speed and simplicity. Web tools require no accounts or sign-ups — just open and use.
              Pro & Plus subscribers get AI-powered MCP integration for seamless use with AI assistants.
            </p>
          </View>

          {/* Bottom Ad - Home Footer */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '50rem', margin: '0 auto' }}>
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


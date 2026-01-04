import { Component } from 'react';
import Link from 'next/link';
import { SignedIn } from '@clerk/nextjs';
import { CATEGORY_LABELS, ToolCategory, getToolsByCategory, getCategoryOrder } from '../config/tools.config';
// Tool icons
import { CutIcon } from './CutIcon';
import { StackIcon } from './StackIcon';
import { WhenIcon } from './WhenIcon';
import { TapIcon } from './TapIcon';
import { LuckIcon } from './LuckIcon';
import { MatchIcon } from './MatchIcon';
import { SleepIcon } from './SleepIcon';
import { AgeIcon } from './AgeIcon';
import { TipIcon } from './TipIcon';
import { PercentIcon } from './PercentIcon';
import { DaysIcon } from './DaysIcon';
import { ZoneIcon } from './ZoneIcon';
import { ConvertIcon } from './ConvertIcon';
import { NamesIcon } from './NamesIcon';
import { FlipIcon } from './FlipIcon';
import { SpinIcon } from './SpinIcon';
import { DecideIcon } from './DecideIcon';
import { RankIcon } from './RankIcon';
import { BrainIcon } from './BrainIcon';
import { VibeIcon } from './VibeIcon';
import { CycleIcon } from './CycleIcon';
import { RiskIcon } from './RiskIcon';
import { BloodIcon } from './BloodIcon';
import { EclipseIcon } from './EclipseIcon';

interface PlanetaryNavProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PlanetaryNavState {
  activeCategory: ToolCategory | null;
  isMobile: boolean;
  searchQuery: string;
}

/**
 * Quick Access Navigation Component
 * Responsive grid menu for fast tool access
 */
export class PlanetaryNav extends Component<PlanetaryNavProps, PlanetaryNavState> {
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(props: PlanetaryNavProps) {
    super(props);
    this.state = {
      activeCategory: null,
      isMobile: false, // Default for SSR, will be updated in componentDidMount
      searchQuery: '',
    };
  }

  componentDidMount() {
    // Set isMobile on client side to avoid hydration mismatch
    this.setState({ isMobile: window.innerWidth < 768 });
    document.addEventListener('keydown', this.handleEscape);
    window.addEventListener('resize', this.handleResize);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleEscape);
    window.removeEventListener('resize', this.handleResize);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  private handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.props.isOpen) {
      this.props.onClose();
    }
  };

  private handleResize = () => {
    this.setState({ isMobile: window.innerWidth < 768 });
  };

  private handleSearchChange = (value: string) => {
    this.setState({ searchQuery: value });
  };

  private clearSearch = () => {
    this.setState({ searchQuery: '' });
  };

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
      brain: <BrainIcon size={size} />,
      vibe: <VibeIcon size={size} />,
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
      eclipse: <EclipseIcon size={size} />,
    };
    return iconMap[toolId] || <span style={{ fontSize: `${size}px` }}>🔧</span>;
  };

  render() {
    const { isOpen, onClose } = this.props;
    const { activeCategory, isMobile, searchQuery } = this.state;

    if (!isOpen) return null;

    const toolsByCategory = getToolsByCategory();
    const categories = getCategoryOrder();

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
            background: 'rgba(0, 0, 0, 0.9)',
            backdropFilter: 'blur(10px)',
            zIndex: 9998,
            animation: 'fadeIn 0.2s ease-out',
          }}
        />

        {/* Menu Container */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            padding: isMobile ? '1rem' : '2rem',
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            flexShrink: 0,
            gap: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
              <Link href="/" onClick={onClose} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="24" height="24" viewBox="0 0 120 120">
                  <defs>
                    <linearGradient id="navLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#667eea" />
                      <stop offset="50%" stopColor="#764ba2" />
                      <stop offset="100%" stopColor="#f472b6" />
                    </linearGradient>
                  </defs>
                  <rect x="4" y="4" width="112" height="112" rx="20" fill="url(#navLogoGrad)" />
                  <path d="M68 25 L45 58 L58 58 L52 95 L75 55 L62 55 L68 25Z" fill="#fbbf24" stroke="#fff" strokeWidth="2" />
                </svg>
                <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 600 }}>Tulzo</span>
              </Link>
              <SignedIn>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '1rem', fontWeight: 300 }}>|</span>
                <Link href="/dashboard" onClick={onClose} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 600 }}>Dashboard</span>
                </Link>
              </SignedIn>
            </div>

            {/* Search Bar */}
            <div style={{ flex: 1, maxWidth: '400px', position: 'relative' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => this.handleSearchChange(e.target.value)}
                placeholder="Filter tools..."
                style={{
                  width: '100%',
                  padding: searchQuery ? '0.5rem 2.25rem 0.5rem 2.25rem' : '0.5rem 0.75rem 0.5rem 2.25rem',
                  borderRadius: '50px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  outline: 'none',
                  transition: 'border-color 0.2s, background 0.2s',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
              />
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              {searchQuery && (
                <button
                  type="button"
                  onClick={this.clearSearch}
                  style={{
                    position: 'absolute',
                    right: '0.4rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(255, 255, 255, 0.25)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  aria-label="Clear search"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          {/* Category Tabs - Desktop */}
          {!isMobile && (
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              marginBottom: '1.5rem',
              flexWrap: 'wrap',
              flexShrink: 0,
            }}>
              <button
                onClick={() => this.setState({ activeCategory: null })}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '20px',
                  border: 'none',
                  background: activeCategory === null ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                All Tools
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => this.setState({ activeCategory: cat })}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '20px',
                    border: 'none',
                    background: activeCategory === cat ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}

          {/* Tools Grid */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {(activeCategory ? [activeCategory] : categories).map(category => {
              // Filter tools based on search query
              const filteredTools = searchQuery.trim()
                ? toolsByCategory[category].filter(tool =>
                    tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    tool.descriptiveName.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                : toolsByCategory[category];

              // Don't render category if no tools match
              if (filteredTools.length === 0) return null;

              return (
                <div key={category} style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginBottom: '0.75rem',
                  }}>
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(100px, 1fr))',
                    gap: isMobile ? '0.5rem' : '0.75rem',
                  }}>
                    {filteredTools.map((tool, index) => (
                      <Link
                        key={tool.id}
                        href={tool.path}
                        onClick={onClose}
                        style={{
                          textDecoration: 'none',
                          animation: `toolAppear 0.3s ease-out ${index * 0.03}s both`,
                        }}
                      >
                        <div
                          style={{
                            background: tool.gradient,
                            borderRadius: '12px',
                            padding: isMobile ? '0.75rem 0.5rem' : '1rem',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                            boxShadow: `0 4px 16px ${tool.color}33`,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                            e.currentTarget.style.boxShadow = `0 8px 24px ${tool.color}66`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0) scale(1)';
                            e.currentTarget.style.boxShadow = `0 4px 16px ${tool.color}33`;
                          }}
                        >
                          <div style={{ marginBottom: '0.25rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            {this.renderToolIcon(tool.id, isMobile ? 28 : 36)}
                          </div>
                          <div style={{
                            fontSize: isMobile ? '0.65rem' : '0.75rem',
                            fontWeight: 700,
                            color: '#fff',
                            textTransform: 'uppercase',
                          }}>
                            {tool.name}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* No results message */}
            {searchQuery.trim() && categories.every(cat =>
              toolsByCategory[cat].filter(tool =>
                tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                tool.descriptiveName.toLowerCase().includes(searchQuery.toLowerCase())
              ).length === 0
            ) && (
              <div style={{
                textAlign: 'center',
                padding: '3rem 1rem',
                color: 'rgba(255,255,255,0.5)',
              }}>
                <p style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>🔍 No tools found</p>
                <p style={{ fontSize: '0.9rem' }}>Try a different search term</p>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div style={{
            textAlign: 'center',
            color: 'rgba(255,255,255,0.4)',
            fontSize: '0.8rem',
            paddingTop: '1rem',
            flexShrink: 0,
          }}>
            Press ESC or tap outside to close
          </div>
        </div>

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes toolAppear {
            from { opacity: 0; transform: scale(0.8); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </>
    );
  }
}


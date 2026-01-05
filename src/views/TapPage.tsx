import { Component, createRef } from 'react';
import { View } from '@adobe/react-spectrum';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { TapIcon } from '../components/TapIcon';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

interface TapRecord {
  tapNumber: number;
  timestamp: number;
  interval: number | null; // ms since previous tap
  diff: number | null; // difference from previous interval
}

interface TapPageState {
  isStarted: boolean;
  startTime: number | null;
  elapsedTime: number;
  taps: TapRecord[];
  isAnimating: boolean;
}

export class TapPage extends Component<object, TapPageState> {
  private timerInterval: number | null = null;
  private containerRef = createRef<HTMLDivElement>();

  constructor(props: object) {
    super(props);
    this.state = {
      isStarted: false,
      startTime: null,
      elapsedTime: 0,
      taps: [],
      isAnimating: false,
    };
  }

  componentDidMount() {
    applySEO('tap');
    document.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!this.state.isStarted) {
        this.handleStart();
      } else {
        this.handleTap();
      }
    }
  };

  private handleStart = () => {
    const now = Date.now();
    this.setState({
      isStarted: true,
      startTime: now,
      elapsedTime: 0,
      taps: [],
    });

    // Start timer
    this.timerInterval = window.setInterval(() => {
      this.setState(prev => ({
        elapsedTime: prev.startTime ? Date.now() - prev.startTime : 0,
      }));
    }, 100);

    // Focus container for spacebar
    this.containerRef.current?.focus();
  };

  private handleTap = () => {
    const now = Date.now();
    const { taps } = this.state;

    const lastTap = taps.length > 0 ? taps[taps.length - 1] : null;
    const interval = lastTap ? now - lastTap.timestamp : null;

    // Calculate diff from previous interval
    let diff: number | null = null;
    if (interval !== null && lastTap && lastTap.interval !== null) {
      diff = interval - lastTap.interval;
    }

    const newTap: TapRecord = {
      tapNumber: taps.length + 1,
      timestamp: now,
      interval,
      diff,
    };

    this.setState(prev => ({
      taps: [...prev.taps, newTap],
      isAnimating: true,
    }));

    setTimeout(() => this.setState({ isAnimating: false }), 100);
  };

  private handleReset = () => {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.setState({
      isStarted: false,
      startTime: null,
      elapsedTime: 0,
      taps: [],
      isAnimating: false,
    });
  };

  private formatTime = (ms: number): string => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
  };

  private formatInterval = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  private getStats = () => {
    const { taps, elapsedTime } = this.state;
    const intervals = taps.filter(t => t.interval !== null).map(t => t.interval as number);

    const count = taps.length;
    const avgInterval = intervals.length > 0
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : 0;

    const elapsedSecs = elapsedTime / 1000;
    const elapsedMins = elapsedTime / 60000;

    const tapsPerSecond = elapsedSecs > 0 ? count / elapsedSecs : 0;
    const tapsPerMinute = elapsedMins > 0 ? count / elapsedMins : 0;

    return { count, avgInterval, tapsPerSecond, tapsPerMinute };
  };

  render() {
    const { isStarted, elapsedTime, taps, isAnimating } = this.state;
    const stats = this.getStats();

    return (
      <View
        minHeight="100vh"
        UNSAFE_style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          padding: 'clamp(1rem, 3vw, 2rem)',
        }}
      >
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
        <div
          ref={this.containerRef}
          tabIndex={-1}
          style={{ outline: 'none' }}
        >
          <View maxWidth="50rem" marginX="auto">
            <View marginBottom="size-400">
              <BackToTools />
            </View>

            <AdBanner slot={ADS_CONFIG.slots.tapTop} format="horizontal" />

            {this.renderHeader()}

            {/* Timer */}
            {isStarted && (
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <span style={{
                  fontSize: 'clamp(2rem, 6vw, 3rem)',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: '#fff',
                }}>
                  {this.formatTime(elapsedTime)}
                </span>
              </div>
            )}

            {this.renderMainButton(isStarted, isAnimating, stats.count)}

            {isStarted && this.renderStats(stats)}

            {taps.length > 0 && this.renderHistory(taps)}

            <AdBanner slot={ADS_CONFIG.slots.tapFooter} format="horizontal" />
            <Footer />
          </View>
        </div>
      </View>
    );
  }
  private renderHeader() {
    return (
      <View UNSAFE_style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div className="animate-float" style={{ marginBottom: '0.5rem' }}>
          <TapIcon size={80} />
        </div>
        <h1 style={{
          fontSize: 'clamp(2rem, 6vw, 3rem)',
          fontWeight: 900,
          background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          margin: 0,
        }}>
          TAP
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '0.25rem', fontSize: '0.9rem' }}>
          Tap, click, or press spacebar
        </p>
      </View>
    );
  }

  private renderMainButton(isStarted: boolean, isAnimating: boolean, count: number) {
    const baseStyle: React.CSSProperties = {
      width: 'min(260px, 65vw)',
      height: 'min(260px, 65vw)',
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      transition: 'all 0.1s ease-out',
      margin: '0 auto',
    };

    if (!isStarted) {
      // START button
      return (
        <View UNSAFE_style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <button
            onClick={this.handleStart}
            style={{
              ...baseStyle,
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              boxShadow: '0 20px 60px rgba(34, 197, 94, 0.4)',
            }}
          >
            <span style={{
              fontSize: 'clamp(2rem, 8vw, 3rem)',
              fontWeight: 900,
              color: '#fff',
              textShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}>
              START
            </span>
            <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.5rem' }}>
              or press space
            </span>
          </button>
        </View>
      );
    }

    // TAP button
    return (
      <View UNSAFE_style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <button
          onClick={this.handleTap}
          style={{
            ...baseStyle,
            background: isAnimating
              ? 'linear-gradient(135deg, #fbbf24 0%, #fb923c 50%, #f87171 100%)'
              : 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%)',
            boxShadow: isAnimating
              ? '0 0 80px rgba(245, 158, 11, 0.7)'
              : '0 20px 60px rgba(245, 158, 11, 0.3)',
            transform: isAnimating ? 'scale(0.92)' : 'scale(1)',
          }}
        >
          <span style={{
            fontSize: 'clamp(4rem, 15vw, 6rem)',
            fontWeight: 900,
            color: '#fff',
            textShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            {count}
          </span>
        </button>

        {/* Reset button */}
        <button
          onClick={this.handleReset}
          style={{
            marginTop: '1.5rem',
            padding: '0.75rem 2rem',
            fontSize: '1rem',
            fontWeight: 600,
            background: 'rgba(239, 68, 68, 0.2)',
            border: '2px solid #ef4444',
            borderRadius: '12px',
            color: '#ef4444',
            cursor: 'pointer',
          }}
        >
          🔄 Reset
        </button>
      </View>
    );
  }

  private renderStats(stats: { count: number; avgInterval: number; tapsPerSecond: number; tapsPerMinute: number }) {
    const statBoxStyle: React.CSSProperties = {
      background: 'rgba(255,255,255,0.1)',
      padding: '1rem',
      borderRadius: '12px',
      textAlign: 'center',
    };
    const labelStyle: React.CSSProperties = {
      fontSize: '0.75rem',
      color: 'rgba(255,255,255,0.6)',
      marginBottom: '0.25rem',
    };
    const valueStyle: React.CSSProperties = {
      fontSize: '1.2rem',
      fontWeight: 700,
      color: '#fff',
    };

    return (
      <View
        UNSAFE_style={{
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(239, 68, 68, 0.15) 100%)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '20px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
          gap: '0.5rem',
        }}>
          <div style={statBoxStyle}>
            <div style={labelStyle}>Taps</div>
            <div style={valueStyle}>{stats.count}</div>
          </div>
          <div style={statBoxStyle}>
            <div style={labelStyle}>Taps/sec</div>
            <div style={valueStyle}>{stats.tapsPerSecond.toFixed(1)}</div>
          </div>
          <div style={statBoxStyle}>
            <div style={labelStyle}>Taps/min</div>
            <div style={valueStyle}>{stats.tapsPerMinute.toFixed(0)}</div>
          </div>
          <div style={statBoxStyle}>
            <div style={labelStyle}>Avg Gap</div>
            <div style={valueStyle}>{stats.avgInterval ? this.formatInterval(stats.avgInterval) : '-'}</div>
          </div>
        </div>
      </View>
    );
  }

  private renderHistory(taps: TapRecord[]) {
    // Show last 10 taps, newest first
    const recentTaps = [...taps].reverse().slice(0, 10);
    const { startTime } = this.state;

    return (
      <View
        UNSAFE_style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '16px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontSize: '1rem' }}>
          📊 Tap History (last 10)
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {recentTaps.map((tap) => {
            const diffColor = tap.diff === null ? 'rgba(255,255,255,0.5)'
              : tap.diff < 0 ? '#4ade80'
              : tap.diff > 0 ? '#f87171'
              : '#fff';

            // Calculate time since start
            const timeSinceStart = startTime ? tap.timestamp - startTime : 0;

            return (
              <div
                key={tap.tapNumber}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.08)',
                  padding: '0.6rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  gap: '0.5rem',
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, minWidth: '40px' }}>
                  #{tap.tapNumber}
                </span>
                <span style={{ color: '#60a5fa', fontWeight: 600, minWidth: '65px', textAlign: 'center', fontSize: '0.8rem' }}>
                  @{this.formatTime(timeSinceStart)}
                </span>
                <span style={{ color: '#fff', fontWeight: 600, flex: 1, textAlign: 'center' }}>
                  {tap.interval !== null ? this.formatInterval(tap.interval) : 'First tap'}
                </span>
                <span style={{ color: diffColor, fontWeight: 600, minWidth: '70px', textAlign: 'right' }}>
                  {tap.diff !== null ? (
                    <>
                      {tap.diff > 0 ? '+' : ''}{this.formatInterval(Math.abs(tap.diff))}
                      {tap.diff < 0 ? ' ⚡' : tap.diff > 0 ? ' 🐢' : ''}
                    </>
                  ) : '-'}
                </span>
              </div>
            );
          })}
        </div>
      </View>
    );
  }
}


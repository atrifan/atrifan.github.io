import { Component } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { AdBanner } from '../components/AdBanner';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { LuckIcon } from '../components/LuckIcon';
import { ADS_CONFIG } from '../config/ads.config';

interface LuckPageState {
  maxValue: string;
  isHolding: boolean;
  holdStartTime: number | null;
  result: number | null;
  holdDuration: number;
}

const MAX_INT = 2147483647;

export class LuckPage extends Component<{}, LuckPageState> {
  private holdInterval: number | null = null;

  constructor(props: {}) {
    super(props);
    this.state = {
      maxValue: '',
      isHolding: false,
      holdStartTime: null,
      result: null,
      holdDuration: 0,
    };
  }

  componentDidMount() {
    document.title = 'LUCK - Random Number Generator | Hold to Roll | Tulzo';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Free random number generator: Hold to generate truly random numbers. Your hold duration becomes the seed. Set max value or use max int. No signup required.');
    }
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    if (this.holdInterval) clearInterval(this.holdInterval);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !e.repeat && !this.state.isHolding) {
      e.preventDefault();
      this.startHold();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space' && this.state.isHolding) {
      e.preventDefault();
      this.endHold();
    }
  };

  private startHold = () => {
    this.setState({ isHolding: true, holdStartTime: Date.now(), result: null, holdDuration: 0 });
    this.holdInterval = window.setInterval(() => {
      const { holdStartTime } = this.state;
      if (holdStartTime) {
        this.setState({ holdDuration: Date.now() - holdStartTime });
      }
    }, 50);
  };

  private endHold = () => {
    const { holdStartTime, maxValue } = this.state;
    if (this.holdInterval) clearInterval(this.holdInterval);
    
    if (!holdStartTime) return;
    
    const duration = Date.now() - holdStartTime;
    const max = maxValue ? Math.min(parseInt(maxValue, 10) || MAX_INT, MAX_INT) : MAX_INT;
    
    // Use duration as seed for randomness
    const seed = duration * Date.now();
    const random = this.seededRandom(seed);
    const result = Math.floor(random * max) + 1;
    
    this.setState({ isHolding: false, holdStartTime: null, result, holdDuration: duration }, () => {
      setTimeout(() => {
        document.getElementById('luck-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    });
  };

  private seededRandom = (seed: number): number => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  private handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    this.setState({ maxValue: value });
  };

  render() {
    const { maxValue, isHolding, result, holdDuration } = this.state;
    const displayMax = maxValue ? parseInt(maxValue, 10) || MAX_INT : MAX_INT;

    const buttonStyle: React.CSSProperties = {
      width: '200px',
      height: '200px',
      borderRadius: '50%',
      border: 'none',
      background: isHolding
        ? 'linear-gradient(135deg, #d946ef 0%, #f0abfc 100%)'
        : 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      boxShadow: isHolding
        ? '0 0 60px rgba(217, 70, 239, 0.8), inset 0 0 30px rgba(255,255,255,0.3)'
        : '0 15px 50px rgba(139, 92, 246, 0.5)',
      transform: isHolding ? 'scale(0.95)' : 'scale(1)',
      transition: 'all 0.15s ease',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      touchAction: 'manipulation',
    };

    const inputStyle: React.CSSProperties = {
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      padding: '1rem',
      fontSize: '1.1rem',
      fontWeight: 600,
      background: 'rgba(255, 255, 255, 0.95)',
      border: '2px solid transparent',
      borderRadius: '12px',
      color: '#1e1b4b',
      textAlign: 'center',
    };

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #1e1b4b 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <BackToTools />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <AdBanner slot={ADS_CONFIG.slots.luckTop} format="horizontal" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '1rem' }}>
              <LuckIcon size={120} />
            </div>
            <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontWeight: 900, background: 'linear-gradient(135deg, #a855f7 0%, #d946ef 50%, #f0abfc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>LUCK</h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.5rem' }}>Hold to Roll 🎲</p>
          </View>

          {/* Instructions */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1rem', border: '1px solid rgba(255,255,255,0.2)' }}>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.95rem', textAlign: 'center', margin: 0 }}>
              🎯 <strong>Hold</strong> the button, <strong>tap & hold</strong> on mobile, or <strong>hold Space</strong> on keyboard.<br/>
              The longer you hold, the more random your number!
            </p>
          </View>

          {/* Max Value Input */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '300px' }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem', textAlign: 'center' }}>
              Maximum Value (optional)
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder={`Default: ${MAX_INT.toLocaleString()}`}
              value={maxValue}
              onChange={this.handleMaxChange}
              style={inputStyle}
            />
          </View>

          {/* Hold Button */}
          <View UNSAFE_style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <button
              style={buttonStyle}
              onMouseDown={this.startHold}
              onMouseUp={this.endHold}
              onMouseLeave={() => this.state.isHolding && this.endHold()}
              onTouchStart={(e) => { e.preventDefault(); this.startHold(); }}
              onTouchEnd={(e) => { e.preventDefault(); this.endHold(); }}
            >
              <span style={{ fontSize: '3rem', marginBottom: '0.25rem' }}>{isHolding ? '✨' : '🎲'}</span>
              <span style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700 }}>
                {isHolding ? `${(holdDuration / 1000).toFixed(1)}s` : 'HOLD'}
              </span>
            </button>
          </View>

          {/* Results Ad - between form and results */}
          {result !== null && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
              <AdBanner slot={ADS_CONFIG.slots.luckResults} format="horizontal" />
            </View>
          )}

          {/* Result Display */}
          {result !== null && (
            <View id="luck-results" UNSAFE_style={{ width: '100%', maxWidth: '600px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(217, 70, 239, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', margin: '0 0 0.5rem 0' }}>Your lucky number is...</p>
              <p style={{ fontSize: 'clamp(3rem, 12vw, 5rem)', fontWeight: 900, color: '#fff', margin: '0 0 0.5rem 0', wordBreak: 'break-all' }}>{result.toLocaleString()}</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: '0' }}>
                Range: 1 - {displayMax.toLocaleString()} • Held for {(holdDuration / 1000).toFixed(2)}s
              </p>
            </View>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.luckFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
      </View>
    );
  }
}


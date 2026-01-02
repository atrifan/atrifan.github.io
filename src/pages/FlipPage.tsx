import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { FlipIcon } from '../components/FlipIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

interface FlipPageState {
  mode: 'coin' | 'dice';
  diceCount: number;
  isFlipping: boolean;
  coinResult: 'heads' | 'tails' | null;
  diceResults: number[];
  history: string[];
}

export class FlipPage extends Component<{}, FlipPageState> {
  private resultRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    this.state = { mode: 'coin', diceCount: 1, isFlipping: false, coinResult: null, diceResults: [], history: [] };
  }

  componentDidMount() {
    applySEO('flip');
    document.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !this.state.isFlipping) {
      e.preventDefault();
      if (this.state.mode === 'coin') {
        this.flipCoin();
      } else {
        this.rollDice();
      }
    }
  };

  private scrollToResult = () => {
    setTimeout(() => {
      this.resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  private flipCoin = () => {
    this.setState({ isFlipping: true, coinResult: null });
    setTimeout(() => {
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      this.setState(prev => ({
        isFlipping: false, coinResult: result,
        history: [`Coin: ${result.toUpperCase()}`, ...prev.history.slice(0, 9)]
      }), this.scrollToResult);
    }, 1000);
  };

  private rollDice = () => {
    this.setState({ isFlipping: true, diceResults: [] });
    setTimeout(() => {
      const results = Array.from({ length: this.state.diceCount }, () => Math.floor(Math.random() * 6) + 1);
      this.setState(prev => ({
        isFlipping: false, diceResults: results,
        history: [`Dice: ${results.join(', ')} (Total: ${results.reduce((a, b) => a + b, 0)})`, ...prev.history.slice(0, 9)]
      }), this.scrollToResult);
    }, 800);
  };

  private renderCoinHeads = () => (
    <svg width="150" height="150" viewBox="0 0 150 150">
      <defs>
        <linearGradient id="coinGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <filter id="coinShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#92400e" floodOpacity="0.5" />
        </filter>
      </defs>
      <circle cx="75" cy="75" r="70" fill="url(#coinGoldGrad)" filter="url(#coinShadow)" stroke="#b45309" strokeWidth="3" />
      <circle cx="75" cy="75" r="60" fill="none" stroke="#92400e" strokeWidth="2" opacity="0.3" />
      {/* Head profile */}
      <ellipse cx="75" cy="60" rx="20" ry="25" fill="#92400e" opacity="0.8" />
      <ellipse cx="75" cy="50" rx="18" ry="18" fill="#92400e" opacity="0.6" />
      <path d="M55 70 Q75 95 95 70" fill="#92400e" opacity="0.8" />
      <circle cx="68" cy="55" r="3" fill="#fef3c7" opacity="0.5" />
      <text x="75" y="115" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#92400e">HEADS</text>
    </svg>
  );

  private renderCoinTails = () => (
    <svg width="150" height="150" viewBox="0 0 150 150">
      <defs>
        <linearGradient id="coinSilverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f3f4f6" />
          <stop offset="50%" stopColor="#9ca3af" />
          <stop offset="100%" stopColor="#6b7280" />
        </linearGradient>
      </defs>
      <circle cx="75" cy="75" r="70" fill="url(#coinSilverGrad)" filter="url(#coinShadow)" stroke="#4b5563" strokeWidth="3" />
      <circle cx="75" cy="75" r="60" fill="none" stroke="#374151" strokeWidth="2" opacity="0.3" />
      {/* 50 value */}
      <text x="75" y="85" textAnchor="middle" fontSize="48" fontWeight="bold" fill="#374151">50</text>
      <text x="75" y="115" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#374151">TAILS</text>
    </svg>
  );

  private renderCoinUnknown = () => (
    <svg width="150" height="150" viewBox="0 0 150 150">
      <defs>
        <linearGradient id="coinUnknownGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <circle cx="75" cy="75" r="70" fill="url(#coinUnknownGrad)" stroke="#b45309" strokeWidth="3" />
      <text x="75" y="90" textAnchor="middle" fontSize="60" fontWeight="bold" fill="#92400e">?</text>
    </svg>
  );

  private renderDice = (value: number, size: number = 70, isRolling: boolean = false) => {
    const dotPositions: { [key: number]: [number, number][] } = {
      1: [[35, 35]],
      2: [[20, 20], [50, 50]],
      3: [[20, 20], [35, 35], [50, 50]],
      4: [[20, 20], [50, 20], [20, 50], [50, 50]],
      5: [[20, 20], [50, 20], [35, 35], [20, 50], [50, 50]],
      6: [[20, 20], [50, 20], [20, 35], [50, 35], [20, 50], [50, 50]],
    };
    const dots = dotPositions[value] || [];
    return (
      <svg width={size} height={size} viewBox="0 0 70 70" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))', animation: isRolling ? 'spin 0.3s linear infinite' : 'none' }}>
        <defs>
          <linearGradient id={`diceGrad${value}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fefefe" />
            <stop offset="100%" stopColor="#d4d4d4" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="66" height="66" rx="10" fill={`url(#diceGrad${value})`} stroke="#a1a1aa" strokeWidth="2" />
        {dots.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="7" fill="#1f2937" />
        ))}
      </svg>
    );
  };

  render() {
    const { mode, diceCount, isFlipping, coinResult, diceResults, history } = this.state;
    const gradient = 'linear-gradient(135deg, #eab308 0%, #ca8a04 50%, #a16207 100%)';
    const hasResult = coinResult || diceResults.length > 0;

    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #78350f 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.flipTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}><FlipIcon size={70} /></div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>FLIP</h1>
            <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', color: 'rgba(255,255,255,0.8)', marginTop: '0.25rem' }}>Coin Flip & Dice Roller 🎲</p>
            <p style={{ fontSize: 'clamp(0.75rem, 2vw, 0.9rem)', color: 'rgba(255,255,255,0.5)', marginTop: '0.15rem' }}>Press SPACE or tap the {mode === 'coin' ? 'coin' : 'dice'} to {mode === 'coin' ? 'flip' : 'roll'}</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <DisclaimerBanner title="Just for Fun!" message="This is a fun utility tool for entertainment. Not suitable for gambling or high-stakes decisions." color="#eab308" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
              {[{ id: 'coin', label: '🪙 Coin' }, { id: 'dice', label: '🎲 Dice' }].map((m) => (
                <button key={m.id} onClick={(e) => { e.stopPropagation(); this.setState({ mode: m.id as any }); }}
                  style={{ padding: '0.75rem 2rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: mode === m.id ? gradient : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600, fontSize: '1.1rem' }}>
                  {m.label}
                </button>
              ))}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem', textAlign: 'center' }}>
              {mode === 'coin' ? (
                <>
                  <div style={{ margin: '0 auto 1.5rem', animation: isFlipping ? 'coinFlip 0.15s linear infinite' : 'none', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); this.flipCoin(); }} onTouchEnd={(e) => { e.preventDefault(); this.flipCoin(); }}>
                    {coinResult === 'heads' ? this.renderCoinHeads() : coinResult === 'tails' ? this.renderCoinTails() : this.renderCoinUnknown()}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); this.flipCoin(); }} disabled={isFlipping} style={{ padding: '1rem 3rem', fontSize: '1.3rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '50px', cursor: isFlipping ? 'wait' : 'pointer' }}>
                    {isFlipping ? 'Flipping...' : 'Flip Coin 🪙'}
                  </button>
                  {coinResult && <div ref={this.resultRef} style={{ marginTop: '1rem', fontSize: '2rem', fontWeight: 800, color: '#fbbf24' }}>{coinResult.toUpperCase()}!</div>}
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ color: '#fff', marginRight: '1rem' }}>Number of dice:</label>
                    <select value={diceCount} onChange={(e) => this.setState({ diceCount: parseInt(e.target.value) })} onClick={(e) => e.stopPropagation()}
                      style={{ padding: '0.5rem 1rem', fontSize: '1.1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(30,30,50,0.9)', color: '#fff', cursor: 'pointer' }}>
                      {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.5rem', minHeight: '90px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); this.rollDice(); }} onTouchEnd={(e) => { e.preventDefault(); this.rollDice(); }}>
                    {isFlipping
                      ? Array.from({ length: diceCount }, (_, i) => <div key={i}>{this.renderDice(Math.floor(Math.random() * 6) + 1, 80, true)}</div>)
                      : (diceResults.length > 0
                          ? diceResults.map((d, i) => <div key={i}>{this.renderDice(d, 80)}</div>)
                          : Array.from({ length: diceCount }, (_, i) => <div key={i}>{this.renderDice(6, 80)}</div>)
                        )
                    }
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); this.rollDice(); }} disabled={isFlipping} style={{ padding: '1rem 3rem', fontSize: '1.3rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '50px', cursor: isFlipping ? 'wait' : 'pointer' }}>
                    {isFlipping ? 'Rolling...' : 'Roll Dice 🎲'}
                  </button>
                  {diceResults.length > 0 && <div ref={this.resultRef} style={{ marginTop: '1rem', fontSize: '1.5rem', fontWeight: 700, color: '#fbbf24' }}>Total: {diceResults.reduce((a, b) => a + b, 0)}</div>}
                </>
              )}
            </div>
          </View>

          {hasResult && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
              <AdBanner slot={ADS_CONFIG.slots.flipResults} format="horizontal" />
            </View>
          )}

          {history.length > 0 && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', textAlign: 'left' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>History</div>
                {history.map((h, i) => <div key={i} style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', padding: '0.25rem 0' }}>{h}</div>)}
              </div>
            </View>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.flipFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
        <style>{`
          @keyframes coinFlip {
            0% { transform: rotateY(0deg) scale(1); }
            25% { transform: rotateY(90deg) scale(1.1); }
            50% { transform: rotateY(180deg) scale(1); }
            75% { transform: rotateY(270deg) scale(1.1); }
            100% { transform: rotateY(360deg) scale(1); }
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          select option { background: #1f2937; color: #fff; }
        `}</style>
      </div>
    );
  }
}


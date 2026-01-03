import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { SpinIcon } from '../components/SpinIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ShareResults } from '../components/ShareResults';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

interface SpinPageState {
  options: string;
  rotation: number;
  isSpinning: boolean;
  result: string | null;
}

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export class SpinPage extends Component<{}, SpinPageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    this.state = { options: 'Pizza\nBurger\nSushi\nTacos\nSalad\nPasta', rotation: 0, isSpinning: false, result: null };
  }

  componentDidMount() {
    applySEO('spin');
    document.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !this.state.isSpinning) {
      e.preventDefault();
      this.spin();
    }
  };

  private spin = () => {
    const optionList = this.state.options.split('\n').map(o => o.trim()).filter(o => o);
    if (optionList.length < 2) return;

    this.setState({ isSpinning: true, result: null });
    const spins = 5 + Math.random() * 5;
    const finalRotation = this.state.rotation + spins * 360;
    
    setTimeout(() => {
      const normalizedRotation = finalRotation % 360;
      const segmentAngle = 360 / optionList.length;
      const winningIndex = Math.floor((360 - normalizedRotation + segmentAngle / 2) % 360 / segmentAngle);
      this.setState({ rotation: finalRotation, isSpinning: false, result: optionList[winningIndex % optionList.length] });
    }, 4000);

    this.setState({ rotation: finalRotation });
  };

  render() {
    const { options, rotation, isSpinning, result } = this.state;
    const optionList = options.split('\n').map(o => o.trim()).filter(o => o);
    const gradient = 'linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)';

    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #7f1d1d 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.spinTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}><SpinIcon size={70} /></div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>SPIN</h1>
            <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', color: 'rgba(255,255,255,0.8)', marginTop: '0.25rem' }}>Spin the Wheel 🎡</p>
            <p style={{ fontSize: 'clamp(0.75rem, 2vw, 0.9rem)', color: 'rgba(255,255,255,0.5)', marginTop: '0.15rem' }}>Press SPACE or tap the wheel to spin</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <DisclaimerBanner title="Just for Fun!" message="This is a fun utility tool for random selection. Not suitable for gambling or high-stakes decisions." color="#ef4444" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            {/* Wheel */}
            <div style={{ position: 'relative', width: '280px', height: '280px', margin: '0 auto 2rem', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); this.spin(); }} onTouchEnd={(e) => { e.preventDefault(); this.spin(); }}>
              <div style={{ position: 'absolute', top: '-15px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
                <div style={{ width: 0, height: 0, borderLeft: '15px solid transparent', borderRight: '15px solid transparent', borderTop: '25px solid #fff' }} />
              </div>
              <svg width="280" height="280" style={{ transform: `rotate(${rotation}deg)`, transition: isSpinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none' }}>
                {optionList.map((opt, i) => {
                  const angle = 360 / optionList.length;
                  const startAngle = i * angle - 90;
                  const endAngle = startAngle + angle;
                  const x1 = 140 + 130 * Math.cos(startAngle * Math.PI / 180);
                  const y1 = 140 + 130 * Math.sin(startAngle * Math.PI / 180);
                  const x2 = 140 + 130 * Math.cos(endAngle * Math.PI / 180);
                  const y2 = 140 + 130 * Math.sin(endAngle * Math.PI / 180);
                  const largeArc = angle > 180 ? 1 : 0;
                  return (
                    <g key={i}>
                      <path d={`M140,140 L${x1},${y1} A130,130 0 ${largeArc},1 ${x2},${y2} Z`} fill={COLORS[i % COLORS.length]} />
                      <text x={140 + 80 * Math.cos((startAngle + angle / 2) * Math.PI / 180)} y={140 + 80 * Math.sin((startAngle + angle / 2) * Math.PI / 180)}
                        fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle" dominantBaseline="middle"
                        transform={`rotate(${startAngle + angle / 2 + 90}, ${140 + 80 * Math.cos((startAngle + angle / 2) * Math.PI / 180)}, ${140 + 80 * Math.sin((startAngle + angle / 2) * Math.PI / 180)})`}>
                        {opt.length > 10 ? opt.slice(0, 10) + '...' : opt}
                      </text>
                    </g>
                  );
                })}
                <circle cx="140" cy="140" r="20" fill="#1f2937" />
              </svg>
            </div>

            <button onClick={(e) => { e.stopPropagation(); this.spin(); }} disabled={isSpinning || optionList.length < 2}
              style={{ padding: '1rem 3rem', fontSize: '1.3rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '50px', cursor: isSpinning ? 'wait' : 'pointer', marginBottom: '1.5rem' }}>
              {isSpinning ? '🎡 Spinning...' : 'SPIN! 🎡'}
            </button>
          </View>

          {result && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
              <AdBanner slot={ADS_CONFIG.slots.spinResults} format="horizontal" />
            </View>
          )}

          {result && (
            <>
              <div id="spin-results" ref={this.resultsRef} style={{ width: '100%', maxWidth: '600px', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.3) 0%, rgba(220, 38, 38, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem' }}>Winner:</div>
                <div style={{ fontSize: 'clamp(2rem, 8vw, 3rem)', fontWeight: 800, color: '#ef4444' }}>🎉 {result}</div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <ShareResults
                  targetRef={this.resultsRef}
                  title="Wheel Spinner - Tulzo"
                  text={`The wheel chose: ${result}! 🎡`}
                />
              </div>
            </>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
              <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Edit Options (one per line)</label>
              <textarea value={options} onChange={(e) => this.setState({ options: e.target.value })} onClick={(e) => e.stopPropagation()}
                style={{ width: '100%', padding: '1rem', fontSize: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', minHeight: '120px', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.spinFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
        <style>{`textarea::placeholder { color: rgba(255,255,255,0.5); }`}</style>
      </div>
    );
  }
}


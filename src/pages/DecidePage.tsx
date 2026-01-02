import { Component } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { DecideIcon } from '../components/DecideIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

interface DecidePageState {
  mode: 'yesNo' | 'pickOne';
  options: string;
  result: string | null;
  isAnimating: boolean;
}

export class DecidePage extends Component<{}, DecidePageState> {
  constructor(props: {}) {
    super(props);
    this.state = { mode: 'yesNo', options: '', result: null, isAnimating: false };
  }

  componentDidMount() {
    applySEO('decide');
    document.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !this.state.isAnimating) {
      e.preventDefault();
      this.decide();
    }
  };

  private handleTap = () => {
    if (!this.state.isAnimating) {
      this.decide();
    }
  };

  private decide = () => {
    this.setState({ isAnimating: true, result: null });
    
    setTimeout(() => {
      const { mode, options } = this.state;
      let result: string;
      
      if (mode === 'yesNo') {
        const answers = ['YES! ✅', 'NO! ❌', 'Maybe... 🤔', 'Definitely! 💯', 'Not now ⏳', 'Go for it! 🚀'];
        result = answers[Math.floor(Math.random() * answers.length)];
      } else {
        const optionList = options.split('\n').map(o => o.trim()).filter(o => o);
        if (optionList.length < 2) {
          result = 'Add at least 2 options!';
        } else {
          result = optionList[Math.floor(Math.random() * optionList.length)];
        }
      }
      
      this.setState({ result, isAnimating: false });
    }, 1000);
  };

  render() {
    const { mode, options, result, isAnimating } = this.state;
    const gradient = 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)';

    return (
      <div onTouchEnd={this.handleTap} style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #064e3b 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.decideTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '1rem' }}><DecideIcon size={120} /></div>
            <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>DECIDE</h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.5rem' }}>Decision Maker 🎯</p>
            <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.25rem' }}>Press SPACE or tap to decide</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <DisclaimerBanner title="Just for Fun!" message="This is a fun utility tool. For important life decisions, please use your own judgment or consult appropriate professionals." color="#22c55e" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
              {[{ id: 'yesNo', label: 'Yes or No?' }, { id: 'pickOne', label: 'Pick One' }].map((m) => (
                <button key={m.id} onClick={(e) => { e.stopPropagation(); this.setState({ mode: m.id as any, result: null }); }}
                  style={{ padding: '0.75rem 1.5rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: mode === m.id ? gradient : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600 }}>
                  {m.label}
                </button>
              ))}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
              {mode === 'pickOne' && (
                <textarea placeholder="Enter options (one per line)&#10;Option 1&#10;Option 2&#10;Option 3" value={options} onChange={(e) => this.setState({ options: e.target.value })} onClick={(e) => e.stopPropagation()}
                  style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', marginBottom: '1rem', minHeight: '120px', resize: 'vertical', boxSizing: 'border-box' }} />
              )}
              <button onClick={(e) => { e.stopPropagation(); this.decide(); }} disabled={isAnimating}
                style={{ width: '100%', padding: '1.5rem', fontSize: '1.3rem', fontWeight: 700, background: isAnimating ? 'rgba(255,255,255,0.3)' : gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: isAnimating ? 'wait' : 'pointer' }}>
                {isAnimating ? '🤔 Thinking...' : mode === 'yesNo' ? 'Ask the Oracle 🔮' : 'Pick for Me! 🎯'}
              </button>
            </div>
          </View>

          {result && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
              <AdBanner slot={ADS_CONFIG.slots.decideResults} format="horizontal" />
            </View>
          )}

          {result && (
            <View id="decide-results" UNSAFE_style={{ width: '100%', maxWidth: '600px', background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.3) 0%, rgba(22, 163, 74, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', marginBottom: '0.5rem' }}>The answer is...</div>
              <div style={{ fontSize: 'clamp(2rem, 8vw, 3rem)', fontWeight: 800, color: '#22c55e' }}>{result}</div>
            </View>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.decideFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
        <style>{`
          @keyframes fadeIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
          textarea::placeholder { color: rgba(255,255,255,0.5); }
        `}</style>
      </div>
    );
  }
}


import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { PercentIcon } from '../components/PercentIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';
import { calculatePercent, PercentOperation } from '../utils/PercentCalculator';

// Map UI mode to shared calculator operation
const MODE_TO_OPERATION: Record<string, PercentOperation> = {
  whatIs: 'whatIsXPercentOfY',
  percentOf: 'xIsWhatPercentOfY',
  increase: 'increaseByPercent',
  decrease: 'decreaseByPercent',
};

interface PercentPageState {
  mode: 'whatIs' | 'percentOf' | 'increase' | 'decrease';
  value1: string;
  value2: string;
  result: string | null;
  resultIsPercent: boolean;
}

export class PercentPage extends Component<{}, PercentPageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    this.state = { mode: 'whatIs', value1: '', value2: '', result: null, resultIsPercent: false };
  }

  componentDidMount() {
    applySEO('percent');
  }

  private scrollToResults = () => {
    setTimeout(() => {
      this.resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  private reset = () => {
    this.setState({ value1: '', value2: '', result: null, resultIsPercent: false });
  };

  private calculate = () => {
    const { mode, value1, value2 } = this.state;
    const v1 = parseFloat(value1);
    const v2 = parseFloat(value2);
    if (isNaN(v1) || isNaN(v2)) return;

    try {
      const operation = MODE_TO_OPERATION[mode];
      const output = calculatePercent({ operation, value1: v1, value2: v2 });
      this.setState({ result: output.result.toFixed(2), resultIsPercent: output.resultIsPercent }, this.scrollToResults);
    } catch {
      // Handle division by zero or other errors
      this.setState({ result: 'Error', resultIsPercent: false });
    }
  };

  render() {
    const { mode, value1, value2, result, resultIsPercent } = this.state;
    const gradient = 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 50%, #0369a1 100%)';
    const modes = [
      { id: 'whatIs', label: 'What is X% of Y?' },
      { id: 'percentOf', label: 'X is what % of Y?' },
      { id: 'increase', label: 'Increase Y by X%' },
      { id: 'decrease', label: 'Decrease Y by X%' },
    ];

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #0c4a6e 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}><AdBanner slot={ADS_CONFIG.slots.percentTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}><PercentIcon size={80} /></div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>PERCENT</h1>
            <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', color: 'rgba(255,255,255,0.8)', marginTop: '0.25rem' }}>Percentage Calculator 📊</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
            <DisclaimerBanner title="Utility Tool" message="This is a utility tool for quick calculations. For financial decisions, please consult a professional." color="#0ea5e9" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
              {modes.map((m) => (
                <button key={m.id} onClick={() => this.setState({ mode: m.id as any, result: null })}
                  style={{ padding: '0.75rem 1rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: mode === m.id ? gradient : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>
                  {m.label}
                </button>
              ))}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                <input type="number" placeholder={mode === 'percentOf' ? 'Value' : 'Percent'} value={value1} onChange={(e) => this.setState({ value1: e.target.value })}
                  style={{ width: '120px', padding: '1rem', fontSize: '1.2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', textAlign: 'center' }} />
                <span style={{ color: '#fff', fontSize: '1.5rem' }}>{mode === 'percentOf' ? 'is what % of' : '%'}</span>
                <input type="number" placeholder="Value" value={value2} onChange={(e) => this.setState({ value2: e.target.value })}
                  style={{ width: '120px', padding: '1rem', fontSize: '1.2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', textAlign: 'center' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button onClick={this.calculate}
                  style={{ flex: 1, padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                  Calculate
                </button>
                <button onClick={this.reset}
                  style={{ padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '12px', cursor: 'pointer' }}>
                  🔄
                </button>
              </div>
            </div>
          </View>

          {result && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
              <AdBanner slot={ADS_CONFIG.slots.percentResults} format="horizontal" />
            </View>
          )}

          {result && (
            <div ref={this.resultsRef} id="percent-results" style={{ width: '100%', maxWidth: '38rem', background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.3) 0%, rgba(2, 132, 199, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', marginBottom: '0.5rem' }}>Result</div>
              <div style={{ fontSize: 'clamp(2rem, 8vw, 3rem)', fontWeight: 800, color: '#0ea5e9' }}>
                {result}{resultIsPercent ? '%' : ''}
              </div>
            </div>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.percentFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
        <style>{`input::placeholder { color: rgba(255,255,255,0.5); }`}</style>
      </View>
    );
  }
}


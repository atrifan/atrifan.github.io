import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { PercentIcon } from '../components/PercentIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';

interface PercentPageState {
  mode: 'whatIs' | 'percentOf' | 'increase' | 'decrease';
  value1: string;
  value2: string;
  result: string | null;
}

export class PercentPage extends Component<{}, PercentPageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    this.state = { mode: 'whatIs', value1: '', value2: '', result: null };
  }

  componentDidMount() {
    document.title = 'Percentage Calculator – Free Handy Tool | Tulzo';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Calculate percentages instantly with this fast, free handy tool.');
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', 'Percentage Calculator – Free Handy Tool | Tulzo');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', 'Calculate percentages instantly with this fast, free handy tool.');
  }

  private scrollToResults = () => {
    setTimeout(() => {
      this.resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  private calculate = () => {
    const { mode, value1, value2 } = this.state;
    const v1 = parseFloat(value1);
    const v2 = parseFloat(value2);
    if (isNaN(v1) || isNaN(v2)) return;

    let result: number;
    switch (mode) {
      case 'whatIs': result = (v1 / 100) * v2; break;
      case 'percentOf': result = (v1 / v2) * 100; break;
      case 'increase': result = v2 * (1 + v1 / 100); break;
      case 'decrease': result = v2 * (1 - v1 / 100); break;
      default: return;
    }
    this.setState({ result: result.toFixed(2) }, this.scrollToResults);
  };

  render() {
    const { mode, value1, value2, result } = this.state;
    const gradient = 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 50%, #0369a1 100%)';
    const modes = [
      { id: 'whatIs', label: 'What is X% of Y?' },
      { id: 'percentOf', label: 'X is what % of Y?' },
      { id: 'increase', label: 'Increase Y by X%' },
      { id: 'decrease', label: 'Decrease Y by X%' },
    ];

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #0c4a6e 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.percentTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '1rem' }}><PercentIcon size={120} /></div>
            <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>PERCENT</h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.5rem' }}>Percentage Calculator 📊</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <DisclaimerBanner title="Utility Tool" message="This is a utility tool for quick calculations. For financial decisions, please consult a professional." color="#0ea5e9" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
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
              <button onClick={this.calculate}
                style={{ marginTop: '1.5rem', width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                Calculate
              </button>
            </div>
          </View>

          {result && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
              <AdBanner slot={ADS_CONFIG.slots.percentResults} format="horizontal" />
            </View>
          )}

          {result && (
            <div ref={this.resultsRef} id="percent-results" style={{ width: '100%', maxWidth: '600px', background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.3) 0%, rgba(2, 132, 199, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', marginBottom: '0.5rem' }}>Result</div>
              <div style={{ fontSize: 'clamp(2rem, 8vw, 3rem)', fontWeight: 800, color: '#0ea5e9' }}>
                {result}{mode === 'percentOf' ? '%' : ''}
              </div>
            </div>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.percentFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
        <style>{`input::placeholder { color: rgba(255,255,255,0.5); }`}</style>
      </View>
    );
  }
}


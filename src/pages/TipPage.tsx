import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { TipIcon } from '../components/TipIcon';
import { Disclaimer } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';

interface TipPageState {
  mode: 'quick' | 'suggest';
  billAmount: string;
  tipPercent: number;
  splitCount: number;
  // Suggestion mode
  serviceQuality: number;
  mood: number;
  budget: number;
  suggestedTip: number | null;
  isCalculating: boolean;
}

const PRESETS = [10, 15, 18, 20, 25];

export class TipPage extends Component<{}, TipPageState> {
  private resultRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    this.state = {
      mode: 'quick', billAmount: '50.00', tipPercent: 18, splitCount: 1,
      serviceQuality: 3, mood: 3, budget: 3, suggestedTip: null, isCalculating: false
    };
  }

  componentDidMount() {
    document.title = 'Tip Calculator – Free Handy Tool | Tulzo';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Calculate the perfect tip amount for any bill with this fast, free tool.');
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', 'Tip Calculator – Free Handy Tool | Tulzo');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', 'Calculate the perfect tip amount for any bill with this fast, free tool.');
  }

  private scrollToResult = () => {
    setTimeout(() => {
      this.resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  private calculateSuggestedTip = () => {
    this.setState({ isCalculating: true, suggestedTip: null });
    setTimeout(() => {
      const { serviceQuality, mood, budget } = this.state;
      const serviceBase = 5 + (serviceQuality - 1) * 5;
      const moodMod = (mood - 3) * 1.5;
      const budgetMod = budget === 1 ? -5 : budget === 2 ? -2 : budget === 3 ? 0 : budget === 4 ? 1 : 2;
      let suggested = serviceBase + moodMod + budgetMod;
      suggested += (Math.random() * 2 - 1);
      suggested = Math.max(5, Math.min(30, Math.round(suggested)));
      this.setState({ suggestedTip: suggested, isCalculating: false, tipPercent: suggested }, this.scrollToResult);
    }, 1500);
  };

  render() {
    const { mode, billAmount, tipPercent, splitCount, serviceQuality, mood, budget, suggestedTip, isCalculating } = this.state;
    const bill = parseFloat(billAmount) || 0;
    const tipAmount = bill * (tipPercent / 100);
    const total = bill + tipAmount;
    const perPerson = total / splitCount;
    const gradient = 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)';

    const sliderStyle = { width: '100%', accentColor: '#f59e0b' };
    const labels = {
      service: ['Terrible', 'Poor', 'Okay', 'Good', 'Amazing'],
      mood: ['Awful', 'Meh', 'Neutral', 'Happy', 'Great'],
      budget: ['Very Tight', 'Tight', 'Normal', 'Comfortable', 'Generous']
    };

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #78350f 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.tipTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '1rem' }}><TipIcon size={120} /></div>
            <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>TIP</h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.5rem' }}>Tip Calculator 💰</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <Disclaimer text="Tip suggestions are for guidance only. Tipping customs vary by region and establishment." color="#f59e0b" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {[{ id: 'quick', label: '⚡ Quick Calc' }, { id: 'suggest', label: '🤖 Suggest Tip' }].map((m) => (
                <button key={m.id} onClick={() => this.setState({ mode: m.id as any, suggestedTip: null })}
                  style={{ padding: '0.75rem 1.5rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: mode === m.id ? gradient : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600 }}>
                  {m.label}
                </button>
              ))}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem' }}>
              <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem' }}>Bill Amount</label>
              <input type="number" value={billAmount} onChange={(e) => this.setState({ billAmount: e.target.value })}
                style={{ width: '100%', padding: '1rem', fontSize: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', textAlign: 'center', marginBottom: '1rem', boxSizing: 'border-box' }} />

              {mode === 'quick' ? (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {PRESETS.map(p => (
                      <button key={p} onClick={() => this.setState({ tipPercent: p })}
                        style={{ padding: '0.5rem 1rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: tipPercent === p ? '#f59e0b' : 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 600 }}>
                        {p}%
                      </button>
                    ))}
                  </div>
                  <input type="range" min="0" max="50" value={tipPercent} onChange={(e) => this.setState({ tipPercent: parseInt(e.target.value) })} style={sliderStyle} />
                  <div style={{ color: '#fff', fontSize: '1.2rem', marginTop: '0.5rem' }}>{tipPercent}%</div>
                </>
              ) : (
                <>
                  <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                    <label style={{ color: '#fff' }}>How was the service? <span style={{ color: '#f59e0b' }}>{labels.service[serviceQuality - 1]}</span></label>
                    <input type="range" min="1" max="5" value={serviceQuality} onChange={(e) => this.setState({ serviceQuality: parseInt(e.target.value) })} style={sliderStyle} />
                  </div>
                  <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                    <label style={{ color: '#fff' }}>How are you feeling? <span style={{ color: '#f59e0b' }}>{labels.mood[mood - 1]}</span></label>
                    <input type="range" min="1" max="5" value={mood} onChange={(e) => this.setState({ mood: parseInt(e.target.value) })} style={sliderStyle} />
                  </div>
                  <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                    <label style={{ color: '#fff' }}>Budget situation? <span style={{ color: '#f59e0b' }}>{labels.budget[budget - 1]}</span></label>
                    <input type="range" min="1" max="5" value={budget} onChange={(e) => this.setState({ budget: parseInt(e.target.value) })} style={sliderStyle} />
                  </div>
                  <button onClick={this.calculateSuggestedTip} disabled={isCalculating}
                    style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                    {isCalculating ? '🤔 Calculating...' : '✨ Suggest My Tip'}
                  </button>
                  {suggestedTip && (
                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(245,158,11,0.2)', borderRadius: '12px' }}>
                      <div style={{ color: '#f59e0b', fontWeight: 600 }}>I suggest a tip of:</div>
                      <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff' }}>{suggestedTip}%</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <AdBanner slot={ADS_CONFIG.slots.tipResults} format="horizontal" />
          </View>

          <div ref={this.resultRef} id="tip-results" style={{ width: '100%', maxWidth: '600px', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.3) 0%, rgba(217, 119, 6, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Tip Amount</div><div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>${tipAmount.toFixed(2)}</div></div>
              <div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Total</div><div style={{ color: '#f59e0b', fontSize: '1.5rem', fontWeight: 700 }}>${total.toFixed(2)}</div></div>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ color: '#fff' }}>Split by:</span>
              <select value={splitCount} onChange={(e) => this.setState({ splitCount: parseInt(e.target.value) })} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(30,30,50,0.9)', color: '#fff', cursor: 'pointer' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              {splitCount > 1 && <span style={{ color: '#f59e0b', fontWeight: 700 }}>${perPerson.toFixed(2)} each</span>}
            </div>
          </div>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.tipFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
        <style>{`input::placeholder { color: rgba(255,255,255,0.5); } select option { background: #1f2937; color: #fff; }`}</style>
      </View>
    );
  }
}


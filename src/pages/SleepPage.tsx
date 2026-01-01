import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { SleepIcon } from '../components/SleepIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';

interface SleepPageState {
  mode: 'wakeUp' | 'sleepNow';
  wakeTime: string;
  results: string[];
}

export class SleepPage extends Component<{}, SleepPageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    this.state = { mode: 'sleepNow', wakeTime: '07:00', results: [] };
  }

  componentDidMount() {
    document.title = 'Sleep Cycle Calculator – Free Handy Tool | Tulzo';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Calculate optimal sleep and wake times based on sleep cycles.');
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', 'Sleep Cycle Calculator – Free Handy Tool | Tulzo');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', 'Calculate optimal sleep and wake times based on sleep cycles.');
  }

  private scrollToResults = () => {
    setTimeout(() => {
      this.resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  private calculateSleepNow = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 14); // 14 min to fall asleep
    const results: string[] = [];
    for (let cycles = 6; cycles >= 3; cycles--) {
      const wake = new Date(now.getTime() + cycles * 90 * 60 * 1000);
      results.push(`${wake.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${cycles} cycles, ${cycles * 1.5}h)`);
    }
    this.setState({ results }, this.scrollToResults);
  };

  private calculateWakeUp = () => {
    const { wakeTime } = this.state;
    const [hours, minutes] = wakeTime.split(':').map(Number);
    const wake = new Date();
    wake.setHours(hours, minutes, 0, 0);
    if (wake < new Date()) wake.setDate(wake.getDate() + 1);
    
    const results: string[] = [];
    for (let cycles = 6; cycles >= 3; cycles--) {
      const sleep = new Date(wake.getTime() - cycles * 90 * 60 * 1000 - 14 * 60 * 1000);
      results.push(`${sleep.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${cycles} cycles, ${cycles * 1.5}h)`);
    }
    this.setState({ results }, this.scrollToResults);
  };

  render() {
    const { mode, wakeTime, results } = this.state;
    const gradient = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)';

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #312e81 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.sleepTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '1rem' }}><SleepIcon size={120} /></div>
            <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>SLEEP</h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.5rem' }}>Sleep Cycle Calculator 😴</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <DisclaimerBanner title="Sleep Guidance" message="This tool provides general guidance based on average sleep cycles. Individual sleep needs vary. Consult a healthcare professional for sleep-related concerns." color="#6366f1" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {[{ id: 'sleepNow', label: 'I want to sleep now' }, { id: 'wakeUp', label: 'I need to wake up at...' }].map((m) => (
                <button key={m.id} onClick={() => this.setState({ mode: m.id as any, results: [] })}
                  style={{ padding: '0.75rem 1.5rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: mode === m.id ? gradient : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600 }}>
                  {m.label}
                </button>
              ))}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem' }}>
              {mode === 'wakeUp' && (
                <input type="time" value={wakeTime} onChange={(e) => this.setState({ wakeTime: e.target.value })}
                  style={{ width: '100%', padding: '1rem', fontSize: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', marginBottom: '1rem', textAlign: 'center', colorScheme: 'dark', boxSizing: 'border-box' }} />
              )}
              <button onClick={mode === 'sleepNow' ? this.calculateSleepNow : this.calculateWakeUp}
                style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                {mode === 'sleepNow' ? 'Calculate Wake Times 😴' : 'Calculate Sleep Times 🌙'}
              </button>
            </div>
          </View>

          {results.length > 0 && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
              <AdBanner slot={ADS_CONFIG.slots.sleepResults} format="horizontal" />
            </View>
          )}

          {results.length > 0 && (
            <div ref={this.resultsRef} id="sleep-results" style={{ width: '100%', maxWidth: '600px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)' }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', marginBottom: '1rem', textAlign: 'center' }}>
                {mode === 'sleepNow' ? 'Wake up at:' : 'Go to sleep at:'}
              </div>
              {results.map((r, i) => (
                <div key={i} style={{ background: i === 0 ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '12px', marginBottom: '0.5rem', color: '#fff', fontSize: '1.2rem', fontWeight: i === 0 ? 700 : 400, textAlign: 'center' }}>
                  {i === 0 && '⭐ '}{r}
                </div>
              ))}
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginTop: '1rem', textAlign: 'center' }}>
                Each sleep cycle is ~90 minutes. Waking between cycles helps you feel refreshed.
              </p>
            </div>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.sleepFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
        <style>{`input::-webkit-calendar-picker-indicator { filter: invert(1); }`}</style>
      </View>
    );
  }
}


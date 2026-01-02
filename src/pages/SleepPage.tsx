import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { SleepIcon } from '../components/SleepIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

type AgeGroup = 'adult' | 'teen' | 'child' | 'toddler' | 'infant';

interface SleepResult {
  time: string;
  cycles: number;
  hours: number;
  quality: 'optimal' | 'good' | 'fair' | 'poor';
}

interface SleepPageState {
  mode: 'wakeUp' | 'sleepNow' | 'sleepAt';
  wakeTime: string;
  sleepTime: string;
  ageGroup: AgeGroup;
  results: SleepResult[];
}

// Sleep recommendations by age group (hours per day)
const SLEEP_RECOMMENDATIONS: Record<AgeGroup, { min: number; max: number; optimal: number; cycleLength: number; fallAsleep: number }> = {
  adult: { min: 7, max: 9, optimal: 8, cycleLength: 90, fallAsleep: 14 },
  teen: { min: 8, max: 10, optimal: 9, cycleLength: 90, fallAsleep: 15 },
  child: { min: 9, max: 12, optimal: 10, cycleLength: 90, fallAsleep: 20 },
  toddler: { min: 11, max: 14, optimal: 12, cycleLength: 60, fallAsleep: 20 },
  infant: { min: 12, max: 16, optimal: 14, cycleLength: 50, fallAsleep: 15 },
};

const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  adult: 'Adult (18+)',
  teen: 'Teen (13-17)',
  child: 'Child (6-12)',
  toddler: 'Toddler (1-5)',
  infant: 'Infant (0-1)',
};

export class SleepPage extends Component<{}, SleepPageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    this.state = {
      mode: 'sleepNow',
      wakeTime: '07:00',
      sleepTime: '22:00',
      ageGroup: 'adult',
      results: []
    };
  }

  componentDidMount() {
    applySEO('sleep');
  }

  private scrollToResults = () => {
    setTimeout(() => {
      this.resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  private getQuality = (hours: number): SleepResult['quality'] => {
    const { ageGroup } = this.state;
    const rec = SLEEP_RECOMMENDATIONS[ageGroup];

    if (hours >= rec.min && hours <= rec.max) {
      // Within recommended range
      const optimalDiff = Math.abs(hours - rec.optimal);
      if (optimalDiff <= 0.5) return 'optimal';
      if (optimalDiff <= 1) return 'good';
      return 'fair';
    } else if (hours >= rec.min - 1 && hours <= rec.max + 1) {
      return 'fair';
    }
    return 'poor';
  };

  private calculateSleepNow = () => {
    const { ageGroup } = this.state;
    const rec = SLEEP_RECOMMENDATIONS[ageGroup];
    const now = new Date();
    now.setMinutes(now.getMinutes() + rec.fallAsleep);

    const results: SleepResult[] = [];
    // Calculate cycles based on age group
    const maxCycles = Math.ceil((rec.max * 60) / rec.cycleLength);
    const minCycles = Math.floor((rec.min * 60) / rec.cycleLength);

    for (let cycles = maxCycles; cycles >= Math.max(2, minCycles - 2); cycles--) {
      const sleepMinutes = cycles * rec.cycleLength;
      const hours = sleepMinutes / 60;
      const wake = new Date(now.getTime() + sleepMinutes * 60 * 1000);
      results.push({
        time: wake.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cycles,
        hours,
        quality: this.getQuality(hours),
      });
    }
    this.setState({ results }, this.scrollToResults);
  };

  private calculateWakeUp = () => {
    const { wakeTime, ageGroup } = this.state;
    const rec = SLEEP_RECOMMENDATIONS[ageGroup];
    const [hours, minutes] = wakeTime.split(':').map(Number);
    const wake = new Date();
    wake.setHours(hours, minutes, 0, 0);
    if (wake < new Date()) wake.setDate(wake.getDate() + 1);

    const results: SleepResult[] = [];
    const maxCycles = Math.ceil((rec.max * 60) / rec.cycleLength);
    const minCycles = Math.floor((rec.min * 60) / rec.cycleLength);

    for (let cycles = maxCycles; cycles >= Math.max(2, minCycles - 2); cycles--) {
      const sleepMinutes = cycles * rec.cycleLength;
      const sleepHours = sleepMinutes / 60;
      const sleep = new Date(wake.getTime() - sleepMinutes * 60 * 1000 - rec.fallAsleep * 60 * 1000);
      results.push({
        time: sleep.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cycles,
        hours: sleepHours,
        quality: this.getQuality(sleepHours),
      });
    }
    this.setState({ results }, this.scrollToResults);
  };

  private calculateSleepAt = () => {
    const { sleepTime, ageGroup } = this.state;
    const rec = SLEEP_RECOMMENDATIONS[ageGroup];
    const [hours, minutes] = sleepTime.split(':').map(Number);
    const sleep = new Date();
    sleep.setHours(hours, minutes, 0, 0);
    // Add fall asleep time
    sleep.setMinutes(sleep.getMinutes() + rec.fallAsleep);

    const results: SleepResult[] = [];
    const maxCycles = Math.ceil((rec.max * 60) / rec.cycleLength);
    const minCycles = Math.floor((rec.min * 60) / rec.cycleLength);

    for (let cycles = maxCycles; cycles >= Math.max(2, minCycles - 2); cycles--) {
      const sleepMinutes = cycles * rec.cycleLength;
      const sleepHours = sleepMinutes / 60;
      const wake = new Date(sleep.getTime() + sleepMinutes * 60 * 1000);
      results.push({
        time: wake.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cycles,
        hours: sleepHours,
        quality: this.getQuality(sleepHours),
      });
    }
    this.setState({ results }, this.scrollToResults);
  };

  private getQualityColor = (quality: SleepResult['quality']): string => {
    switch (quality) {
      case 'optimal': return '#10b981'; // green
      case 'good': return '#22c55e'; // light green
      case 'fair': return '#eab308'; // yellow
      case 'poor': return '#ef4444'; // red
    }
  };

  private getQualityEmoji = (quality: SleepResult['quality']): string => {
    switch (quality) {
      case 'optimal': return '🌟';
      case 'good': return '✅';
      case 'fair': return '⚠️';
      case 'poor': return '❌';
    }
  };

  private getQualityLabel = (quality: SleepResult['quality']): string => {
    switch (quality) {
      case 'optimal': return 'Optimal';
      case 'good': return 'Good';
      case 'fair': return 'Fair';
      case 'poor': return 'Not Recommended';
    }
  };

  render() {
    const { mode, wakeTime, sleepTime, ageGroup, results } = this.state;
    const gradient = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)';
    const rec = SLEEP_RECOMMENDATIONS[ageGroup];
    const inputStyle = { width: '100%', padding: '1rem', fontSize: '1.2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', marginBottom: '1rem', textAlign: 'center' as const, colorScheme: 'dark' as const, boxSizing: 'border-box' as const };

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
            {/* Age Group Selector */}
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', marginBottom: '1rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', display: 'block', marginBottom: '0.75rem' }}>
                Who is this for?
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {(Object.keys(AGE_GROUP_LABELS) as AgeGroup[]).map((ag) => (
                  <button key={ag} onClick={() => this.setState({ ageGroup: ag, results: [] })}
                    style={{ padding: '0.5rem 1rem', borderRadius: '16px', border: 'none', cursor: 'pointer', background: ageGroup === ag ? gradient : 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: ageGroup === ag ? 600 : 400, fontSize: '0.85rem', transition: 'all 0.2s' }}>
                    {AGE_GROUP_LABELS[ag]}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
                Recommended: {rec.min}-{rec.max}h • Cycle: ~{rec.cycleLength} min
              </div>
            </div>

            {/* Mode Selector */}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {[
                { id: 'sleepNow', label: '😴 Sleep now' },
                { id: 'wakeUp', label: '⏰ Wake at...' },
                { id: 'sleepAt', label: '🌙 Sleep at...' }
              ].map((m) => (
                <button key={m.id} onClick={() => this.setState({ mode: m.id as any, results: [] })}
                  style={{ padding: '0.75rem 1.25rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: mode === m.id ? gradient : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600, fontSize: '0.95rem' }}>
                  {m.label}
                </button>
              ))}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem' }}>
              {mode === 'wakeUp' && (
                <>
                  <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', display: 'block', marginBottom: '0.5rem' }}>
                    I need to wake up at:
                  </label>
                  <input type="time" value={wakeTime} onChange={(e) => this.setState({ wakeTime: e.target.value })} style={inputStyle} />
                </>
              )}
              {mode === 'sleepAt' && (
                <>
                  <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', display: 'block', marginBottom: '0.5rem' }}>
                    I'm going to sleep at:
                  </label>
                  <input type="time" value={sleepTime} onChange={(e) => this.setState({ sleepTime: e.target.value })} style={inputStyle} />
                </>
              )}
              <button onClick={mode === 'sleepNow' ? this.calculateSleepNow : mode === 'wakeUp' ? this.calculateWakeUp : this.calculateSleepAt}
                style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                {mode === 'sleepNow' ? 'Calculate Wake Times' : mode === 'wakeUp' ? 'Calculate Sleep Times' : 'Calculate Wake Times'}
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
                {mode === 'wakeUp' ? 'Go to sleep at:' : 'Wake up at:'}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                <span style={{ color: '#10b981' }}>🌟 Optimal</span>
                <span style={{ color: '#22c55e' }}>✅ Good</span>
                <span style={{ color: '#eab308' }}>⚠️ Fair</span>
                <span style={{ color: '#ef4444' }}>❌ Not Recommended</span>
              </div>

              {results.map((r, i) => {
                const color = this.getQualityColor(r.quality);
                const isOptimal = r.quality === 'optimal';
                return (
                  <div key={i} style={{
                    background: isOptimal ? `${color}33` : 'rgba(255,255,255,0.08)',
                    padding: '1rem',
                    borderRadius: '12px',
                    marginBottom: '0.5rem',
                    border: `2px solid ${color}${isOptimal ? '' : '66'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>{this.getQualityEmoji(r.quality)}</span>
                      <span style={{ color: '#fff', fontSize: '1.3rem', fontWeight: isOptimal ? 700 : 500 }}>{r.time}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color, fontWeight: 600, fontSize: '0.9rem' }}>{this.getQualityLabel(r.quality)}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>
                        {r.cycles} cycles • {r.hours.toFixed(1)}h
                      </div>
                    </div>
                  </div>
                );
              })}

              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginTop: '1rem', textAlign: 'center' }}>
                {ageGroup === 'adult' || ageGroup === 'teen'
                  ? `Each sleep cycle is ~${rec.cycleLength} min. Waking between cycles helps you feel refreshed.`
                  : `Children have shorter sleep cycles (~${rec.cycleLength} min) and need more total sleep.`}
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


import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { SleepIcon } from '../components/SleepIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { Footer } from '../components/Footer';
import { ShareResults } from '../components/ShareResults';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';
import {
  AgeGroup,
  SleepResult,
  SleepQuality,
  calculateSleepNow,
  calculateWakeAt,
  calculateSleepAt,
  getQualityInfo,
  getSleepQuality,
  SLEEP_RECOMMENDATIONS,
  AGE_GROUP_LABELS,
} from '../utils/SleepCalculator';

interface SleepPageState {
  mode: 'wakeUp' | 'sleepNow' | 'sleepAt';
  wakeTime: string;
  sleepTime: string;
  ageGroup: AgeGroup;
  results: SleepResult[];
}

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

  private reset = () => {
    this.setState({ wakeTime: '07:00', sleepTime: '22:00', ageGroup: 'adult', results: [] });
  };

  private getQuality = (hours: number): SleepQuality => {
    return getSleepQuality(hours, this.state.ageGroup);
  };

  private calculateSleepNowHandler = () => {
    const result = calculateSleepNow(this.state.ageGroup);
    this.setState({ results: result.results }, this.scrollToResults);
  };

  private calculateWakeUp = () => {
    const result = calculateWakeAt(this.state.wakeTime, this.state.ageGroup);
    this.setState({ results: result.results }, this.scrollToResults);
  };

  private calculateSleepAtHandler = () => {
    const result = calculateSleepAt(this.state.sleepTime, this.state.ageGroup);
    this.setState({ results: result.results }, this.scrollToResults);
  };

  private getQualityColor = (quality: SleepQuality): string => getQualityInfo(quality).color;
  private getQualityEmoji = (quality: SleepQuality): string => getQualityInfo(quality).emoji;
  private getQualityLabel = (quality: SleepQuality): string => getQualityInfo(quality).label;

  render() {
    const { mode, wakeTime, sleepTime, ageGroup, results } = this.state;
    const gradient = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)';
    const rec = SLEEP_RECOMMENDATIONS[ageGroup];
    const inputStyle = { width: '100%', padding: '1rem', fontSize: '1.2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', marginBottom: '1rem', textAlign: 'center' as const, colorScheme: 'dark' as const, boxSizing: 'border-box' as const };

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #312e81 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
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
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}><AdBanner slot={ADS_CONFIG.slots.sleepTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}><SleepIcon size={80} /></div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>SLEEP</h1>
            <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', color: 'rgba(255,255,255,0.8)', marginTop: '0.25rem' }}>Sleep Cycle Calculator 😴</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
            <DisclaimerBanner title="Sleep Guidance" message="This tool provides general guidance based on average sleep cycles. Individual sleep needs vary. Consult a healthcare professional for sleep-related concerns." color="#6366f1" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
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
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={mode === 'sleepNow' ? this.calculateSleepNowHandler : mode === 'wakeUp' ? this.calculateWakeUp : this.calculateSleepAtHandler}
                  style={{ flex: 1, padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                  {mode === 'sleepNow' ? 'Calculate Wake Times' : mode === 'wakeUp' ? 'Calculate Sleep Times' : 'Calculate Wake Times'}
                </button>
                <button onClick={this.reset}
                  style={{ padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '12px', cursor: 'pointer' }}>
                  🔄
                </button>
              </div>
            </div>
          </View>

          {results.length > 0 && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
              <AdBanner slot={ADS_CONFIG.slots.sleepResults} format="horizontal" />
            </View>
          )}

          {results.length > 0 && (
            <>
            <div ref={this.resultsRef} id="sleep-results" style={{ width: '100%', maxWidth: '38rem', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)' }}>
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
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <ShareResults
                targetRef={this.resultsRef}
                title="My Sleep Schedule - Tulzo"
                text={`Optimal sleep times for ${mode === 'wakeUp' ? 'waking at' : 'sleeping at'} ${mode === 'wakeUp' ? wakeTime : sleepTime} 😴`}
              />
            </div>
          </>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.sleepFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
        <style>{`input::-webkit-calendar-picker-indicator { filter: invert(1); }`}</style>
      </View>
    );
  }
}


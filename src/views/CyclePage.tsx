import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { CycleIcon } from '../components/CycleIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

interface CycleResult {
  nextPeriodStart: Date;
  nextPeriodEnd: Date;
  fertileWindowStart: Date;
  fertileWindowEnd: Date;
  ovulationDate: Date;
  safeDaysBeforeFertile: { start: Date; end: Date };
  safeDaysAfterFertile: { start: Date; end: Date };
  cycleDay: number;
  phase: 'menstrual' | 'follicular' | 'ovulation' | 'luteal';
}

interface CyclePageState {
  lastPeriodDate: string;
  cycleLength: number;
  periodLength: number;
  result: CycleResult | null;
}

// Medical research constants
// Ovulation typically occurs 14 days before the next period (luteal phase is fairly constant)
// Fertile window: 5 days before ovulation + ovulation day (sperm can survive 5 days)
const LUTEAL_PHASE_DAYS = 14;
const SPERM_SURVIVAL_DAYS = 5;

export class CyclePage extends Component<object, CyclePageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: object) {
    super(props);
    // Use empty date for SSR, will be set in componentDidMount
    this.state = {
      lastPeriodDate: '',
      cycleLength: 28,
      periodLength: 5,
      result: null,
    };
  }

  componentDidMount() {
    applySEO('cycle');
    // Set date on client side to avoid hydration mismatch
    const today = new Date();
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(today.getDate() - 14);
    this.setState({ lastPeriodDate: twoWeeksAgo.toISOString().split('T')[0] });
  }

  private scrollToResults = () => {
    setTimeout(() => {
      this.resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  private calculateCycle = () => {
    const { lastPeriodDate, cycleLength, periodLength } = this.state;
    const lastPeriod = new Date(lastPeriodDate);
    lastPeriod.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate next period start
    let nextPeriodStart = new Date(lastPeriod);
    while (nextPeriodStart <= today) {
      nextPeriodStart.setDate(nextPeriodStart.getDate() + cycleLength);
    }

    // Period end date
    const nextPeriodEnd = new Date(nextPeriodStart);
    nextPeriodEnd.setDate(nextPeriodEnd.getDate() + periodLength - 1);

    // Ovulation date (14 days before next period - luteal phase)
    const ovulationDate = new Date(nextPeriodStart);
    ovulationDate.setDate(ovulationDate.getDate() - LUTEAL_PHASE_DAYS);

    // Fertile window (5 days before ovulation + ovulation day + 1 day after for egg survival)
    const fertileWindowStart = new Date(ovulationDate);
    fertileWindowStart.setDate(fertileWindowStart.getDate() - SPERM_SURVIVAL_DAYS);
    const fertileWindowEnd = new Date(ovulationDate);
    fertileWindowEnd.setDate(fertileWindowEnd.getDate() + 1); // Egg survives ~24h

    // Safe days (before fertile window and after)
    // Current cycle's period end
    const currentPeriodEnd = new Date(nextPeriodStart);
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() - cycleLength + periodLength - 1);
    
    const safeDaysBeforeFertile = {
      start: new Date(currentPeriodEnd),
      end: new Date(fertileWindowStart),
    };
    safeDaysBeforeFertile.start.setDate(safeDaysBeforeFertile.start.getDate() + 1);
    safeDaysBeforeFertile.end.setDate(safeDaysBeforeFertile.end.getDate() - 1);

    const safeDaysAfterFertile = {
      start: new Date(fertileWindowEnd),
      end: new Date(nextPeriodStart),
    };
    safeDaysAfterFertile.start.setDate(safeDaysAfterFertile.start.getDate() + 1);
    safeDaysAfterFertile.end.setDate(safeDaysAfterFertile.end.getDate() - 1);

    // Calculate current cycle day and phase
    const daysSinceLastPeriod = Math.floor((today.getTime() - lastPeriod.getTime()) / (1000 * 60 * 60 * 24));
    const cycleDay = (daysSinceLastPeriod % cycleLength) + 1;
    
    let phase: CycleResult['phase'];
    if (cycleDay <= periodLength) {
      phase = 'menstrual';
    } else if (cycleDay <= cycleLength - LUTEAL_PHASE_DAYS - 1) {
      phase = 'follicular';
    } else if (cycleDay <= cycleLength - LUTEAL_PHASE_DAYS + 1) {
      phase = 'ovulation';
    } else {
      phase = 'luteal';
    }

    this.setState({
      result: {
        nextPeriodStart,
        nextPeriodEnd,
        fertileWindowStart,
        fertileWindowEnd,
        ovulationDate,
        safeDaysBeforeFertile,
        safeDaysAfterFertile,
        cycleDay,
        phase,
      },
    }, this.scrollToResults);
  };

  private formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  private getDaysUntil = (date: Date): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  private getPhaseInfo = (phase: CycleResult['phase']) => {
    const phases = {
      menstrual: { name: 'Menstrual Phase', emoji: '🩸', color: '#ef4444', desc: 'Period days - uterine lining sheds' },
      follicular: { name: 'Follicular Phase', emoji: '🌱', color: '#22c55e', desc: 'Egg develops in ovary' },
      ovulation: { name: 'Ovulation Phase', emoji: '🥚', color: '#f59e0b', desc: 'Peak fertility - egg released' },
      luteal: { name: 'Luteal Phase', emoji: '🌙', color: '#8b5cf6', desc: 'Post-ovulation, preparing for next cycle' },
    };
    return phases[phase];
  };

  render() {
    const { lastPeriodDate, cycleLength, periodLength, result } = this.state;
    const gradient = 'linear-gradient(135deg, #ec4899 0%, #f472b6 50%, #fb7185 100%)';
    const inputStyle = { width: '100%', padding: '1rem', fontSize: '1.1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', marginBottom: '0.5rem', textAlign: 'center' as const, colorScheme: 'dark' as const, boxSizing: 'border-box' as const };
    const labelStyle = { color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.25rem', display: 'block' };

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #4c1d4d 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.cycleTop} format="horizontal" /></View>

          {/* Header */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.25rem' }}><CycleIcon size={60} /></div>
            <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>CYCLE</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.25rem', fontSize: 'clamp(0.8rem, 2.5vw, 1rem)' }}>Period & Fertility Calculator</p>
          </View>

          {/* Disclaimer */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <DisclaimerBanner
              title="Medical Disclaimer"
              message="This calculator provides estimates based on average cycle patterns and should NOT be used as a contraceptive method or for medical decisions. Cycles vary significantly between individuals. Always consult a healthcare provider for family planning, fertility concerns, or menstrual irregularities."
              color="#ec4899"
            />
          </View>

          {/* Input Form */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', background: 'rgba(255,255,255,0.08)', borderRadius: '20px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>First Day of Last Period</label>
              <input type="date" value={lastPeriodDate} onChange={(e) => this.setState({ lastPeriodDate: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={labelStyle}>Cycle Length (days)</label>
                <input type="number" min={21} max={40} value={cycleLength} onChange={(e) => this.setState({ cycleLength: parseInt(e.target.value) || 28 })} style={inputStyle} />
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Typical: 21-35 days</span>
              </div>
              <div>
                <label style={labelStyle}>Period Length (days)</label>
                <input type="number" min={2} max={10} value={periodLength} onChange={(e) => this.setState({ periodLength: parseInt(e.target.value) || 5 })} style={inputStyle} />
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Typical: 3-7 days</span>
              </div>
            </div>
            <button onClick={this.calculateCycle} style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
              Calculate My Cycle
            </button>
          </View>

          {result && this.renderResults(result)}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.cycleFooter} format="horizontal" /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><Footer /></View>
        </Flex>
      </View>
    );
  }

  private renderResults(result: CycleResult) {
    const phaseInfo = this.getPhaseInfo(result.phase);
    const daysUntilPeriod = this.getDaysUntil(result.nextPeriodStart);
    const daysUntilOvulation = this.getDaysUntil(result.ovulationDate);
    const daysUntilFertile = this.getDaysUntil(result.fertileWindowStart);

    const cardStyle = { background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.25rem', marginBottom: '1rem' };
    const titleStyle = { fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' };

    return (
      <div ref={this.resultsRef} style={{ width: '100%', maxWidth: '600px' }}>
        <AdBanner slot={ADS_CONFIG.slots.cycleResults} format="horizontal" />

        {/* Current Phase */}
        <div style={{ ...cardStyle, background: `linear-gradient(135deg, ${phaseInfo.color}33 0%, ${phaseInfo.color}1a 100%)`, border: `1px solid ${phaseInfo.color}66` }}>
          <div style={{ ...titleStyle, color: phaseInfo.color }}>{phaseInfo.emoji} Current Phase</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', marginBottom: '0.25rem' }}>{phaseInfo.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem' }}>{phaseInfo.desc}</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>Day {result.cycleDay} of your cycle</div>
        </div>

        {/* Key Dates Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {/* Next Period */}
          <div style={{ ...cardStyle, marginBottom: 0, background: 'linear-gradient(135deg, #ef444433 0%, #ef44441a 100%)', border: '1px solid #ef444466' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🩸</div>
            <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.85rem' }}>Next Period</div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>{this.formatDate(result.nextPeriodStart)}</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{daysUntilPeriod <= 0 ? 'Today!' : `In ${daysUntilPeriod} days`}</div>
          </div>

          {/* Ovulation */}
          <div style={{ ...cardStyle, marginBottom: 0, background: 'linear-gradient(135deg, #f59e0b33 0%, #f59e0b1a 100%)', border: '1px solid #f59e0b66' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🥚</div>
            <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.85rem' }}>Ovulation</div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>{this.formatDate(result.ovulationDate)}</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{daysUntilOvulation <= 0 ? 'Today!' : daysUntilOvulation < 0 ? 'Passed' : `In ${daysUntilOvulation} days`}</div>
          </div>
        </div>

        {/* Fertile Window */}
        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #22c55e33 0%, #22c55e1a 100%)', border: '1px solid #22c55e66' }}>
          <div style={{ ...titleStyle, color: '#22c55e' }}>💚 Fertile Window (High Chance of Conception)</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700 }}>{this.formatDate(result.fertileWindowStart)} → {this.formatDate(result.fertileWindowEnd)}</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>{daysUntilFertile <= 0 ? 'Currently in fertile window' : `Starts in ${daysUntilFertile} days`}</div>
            </div>
            <div style={{ background: '#22c55e', color: '#fff', padding: '0.5rem 1rem', borderRadius: '20px', fontWeight: 700, fontSize: '0.85rem' }}>
              ~6 days
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div style={{ ...cardStyle, background: 'rgba(255,255,255,0.05)' }}>
          <div style={{ ...titleStyle, color: '#a78bfa' }}>📚 How This Works</div>
          <ul style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0, paddingLeft: '1.25rem' }}>
            <li><strong>Ovulation</strong> typically occurs ~14 days before your next period (luteal phase)</li>
            <li><strong>Fertile window</strong> spans 5 days before ovulation (sperm survival) + ovulation day + 1 day after</li>
            <li><strong>Peak fertility</strong> is 1-2 days before and on ovulation day</li>
            <li>Cycles can vary ±7 days even in regular cycles</li>
          </ul>
        </div>
      </div>
    );
  }
}


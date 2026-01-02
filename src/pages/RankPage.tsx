import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { RankIcon } from '../components/RankIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';
import { calculateFunnel, FunnelStep, DATA_SOURCE, WORLD_POPULATION } from '../data/percentiles';

interface RankPageState {
  age: string;
  gender: 'male' | 'female' | null;
  height: string;
  weight: string;
  heightUnit: 'cm' | 'ft';
  weightUnit: 'kg' | 'lbs';
  funnelSteps: FunnelStep[];
}

export class RankPage extends Component<{}, RankPageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    this.state = {
      age: '',
      gender: null,
      height: '',
      weight: '',
      heightUnit: 'cm',
      weightUnit: 'kg',
      funnelSteps: [],
    };
  }

  componentDidMount() {
    document.title = 'Body Percentile Calculator – Free Health Tool | Tulzo';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', 'Find where you rank in height and weight percentiles by age and gender. Based on 2025 CDC/WHO data.');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', 'Body Percentile Calculator – Free Health Tool | Tulzo');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', 'Find where you rank in height and weight percentiles by age and gender.');
  }

  private scrollToResults = () => {
    setTimeout(() => this.resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  };

  private convertHeight = (): number | null => {
    const { height, heightUnit } = this.state;
    if (!height) return null;
    const val = parseFloat(height);
    if (isNaN(val)) return null;
    return heightUnit === 'ft' ? val * 30.48 : val;
  };

  private convertWeight = (): number | null => {
    const { weight, weightUnit } = this.state;
    if (!weight) return null;
    const val = parseFloat(weight);
    if (isNaN(val)) return null;
    return weightUnit === 'lbs' ? val * 0.453592 : val;
  };

  private calculate = () => {
    const { age, gender } = this.state;
    const ageNum = age ? parseInt(age) : null;
    const heightCm = this.convertHeight();
    const weightKg = this.convertWeight();

    // Need at least one input beyond world population
    if (ageNum === null && gender === null && heightCm === null && weightKg === null) {
      alert('Please enter at least one value (age, gender, height, or weight) to see your rarity.');
      return;
    }

    const funnelSteps = calculateFunnel(ageNum, gender, heightCm, weightKg);
    this.setState({ funnelSteps }, this.scrollToResults);
  };

  private formatNumber = (num: number): string => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
    return num.toLocaleString();
  };

  private getStepColor = (dimension: string): string => {
    switch (dimension) {
      case 'world': return '#6366f1';
      case 'age': return '#f59e0b';
      case 'gender': return '#ec4899';
      case 'height': return '#10b981';
      case 'weight': return '#3b82f6';
      default: return '#10b981';
    }
  };

  private getStepIcon = (dimension: string): string => {
    switch (dimension) {
      case 'world': return '🌍';
      case 'age': return '🎂';
      case 'gender': return '👤';
      case 'height': return '📏';
      case 'weight': return '⚖️';
      default: return '📊';
    }
  };

  private renderFunnel = () => {
    const { funnelSteps } = this.state;
    if (funnelSteps.length === 0) return null;

    const maxWidth = 100; // percentage
    const minWidth = 20; // minimum width for smallest step

    return (
      <div style={{ padding: '1rem 0' }}>
        {funnelSteps.map((step, index) => {
          const widthPercent = index === 0
            ? maxWidth
            : Math.max(minWidth, (step.percentage / 100) * maxWidth + minWidth);
          const color = this.getStepColor(step.dimension);
          const icon = this.getStepIcon(step.dimension);
          const isLast = index === funnelSteps.length - 1;

          return (
            <div key={index} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: index < funnelSteps.length - 1 ? '0' : '0',
            }}>
              {/* Funnel segment */}
              <div style={{
                width: `${widthPercent}%`,
                background: `linear-gradient(135deg, ${color}dd, ${color}99)`,
                padding: '1rem',
                borderRadius: index === 0 ? '16px 16px 0 0' : isLast ? '0 0 16px 16px' : '0',
                position: 'relative',
                transition: 'all 0.5s ease-out',
                transitionDelay: `${index * 0.1}s`,
                border: `2px solid ${color}`,
                borderBottom: isLast ? `2px solid ${color}` : 'none',
                marginTop: index > 0 ? '-2px' : '0',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>{icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: '1rem' }}>{step.label}</div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>{step.description}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: '#fff', fontSize: '1.2rem' }}>{this.formatNumber(step.population)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
                      {step.percentage >= 1 ? `${step.percentage.toFixed(1)}%` : `${step.percentage.toFixed(3)}%`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Connector arrow */}
              {index < funnelSteps.length - 1 && (
                <div style={{
                  width: '0',
                  height: '0',
                  borderLeft: '20px solid transparent',
                  borderRight: '20px solid transparent',
                  borderTop: `15px solid ${color}`,
                  marginTop: '-2px',
                  zIndex: 1,
                }} />
              )}
            </div>
          );
        })}

        {/* Summary */}
        {funnelSteps.length > 1 && (() => {
          const finalStep = funnelSteps[funnelSteps.length - 1];
          const rarityRatio = Math.round(WORLD_POPULATION / finalStep.population);
          // Calculate percentile: what % of people are MORE common than you
          // If 1 in 100, you're rarer than 99% of combinations
          const percentile = Math.min(99.99, Math.max(0.01, 100 - (finalStep.percentage)));

          return (
            <div style={{
              textAlign: 'center',
              marginTop: '1.5rem',
              padding: '1.5rem',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '16px',
              border: '2px solid rgba(255,255,255,0.2)',
            }}>
              <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem' }}>
                Your unique combination
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#10b981' }}>
                1 in {this.formatNumber(rarityRatio)}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.5rem', marginBottom: '1rem' }}>
                ~{this.formatNumber(finalStep.population)} people worldwide share your profile
              </div>

              {/* Percentile bar */}
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '12px',
                padding: '1rem',
                marginTop: '0.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>Rarity Percentile</span>
                  <span style={{ color: '#10b981', fontWeight: 800, fontSize: '1.3rem' }}>
                    Top {percentile >= 99 ? percentile.toFixed(2) : percentile.toFixed(1)}%
                  </span>
                </div>
                <div style={{
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  height: '12px',
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  <div style={{
                    width: `${Math.min(100, percentile)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #10b981, #059669)',
                    borderRadius: '8px',
                    transition: 'width 0.8s ease-out',
                  }} />
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.7rem',
                  color: 'rgba(255,255,255,0.4)',
                  marginTop: '0.25rem'
                }}>
                  <span>Common</span>
                  <span>Rare</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  render() {
    const { age, gender, height, weight, heightUnit, weightUnit, funnelSteps } = this.state;
    const gradient = 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)';
    const inputStyle = { width: '100%', padding: '1rem', fontSize: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', boxSizing: 'border-box' as const };
    const selectStyle = { ...inputStyle, cursor: 'pointer' };

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #064e3b 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.rankTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '1rem' }}><RankIcon size={120} /></div>
            <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>RANK</h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.5rem' }}>How Rare Are You? 🌍</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <DisclaimerBanner title="Health Information" message={`This tool provides rarity estimates based on ${DATA_SOURCE}. For medical advice, consult a healthcare professional.`} color="#10b981" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Age</label>
                  <input type="number" placeholder="e.g. 25" value={age} onChange={(e) => this.setState({ age: e.target.value })} min="2" max="80" style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Gender</label>
                  <select value={gender || ''} onChange={(e) => this.setState({ gender: e.target.value ? e.target.value as 'male' | 'female' : null })} style={selectStyle}>
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 1rem 0', textAlign: 'center' }}>Add more details to see how unique your combination is</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Height</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="number" placeholder={heightUnit === 'cm' ? '170' : '5.7'} value={height} onChange={(e) => this.setState({ height: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                    <select value={heightUnit} onChange={(e) => this.setState({ heightUnit: e.target.value as 'cm' | 'ft' })} style={{ ...selectStyle, width: 'auto', minWidth: '60px', flex: 'none', padding: '0.75rem 0.5rem' }}>
                      <option value="cm">cm</option>
                      <option value="ft">ft</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Weight</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="number" placeholder={weightUnit === 'kg' ? '70' : '154'} value={weight} onChange={(e) => this.setState({ weight: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                    <select value={weightUnit} onChange={(e) => this.setState({ weightUnit: e.target.value as 'kg' | 'lbs' })} style={{ ...selectStyle, width: 'auto', minWidth: '60px', flex: 'none', padding: '0.75rem 0.5rem' }}>
                      <option value="kg">kg</option>
                      <option value="lbs">lbs</option>
                    </select>
                  </div>
                </div>
              </div>
              <button onClick={this.calculate} style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                Calculate Rarity 🔍
              </button>
            </div>
          </View>

          {funnelSteps.length > 0 && <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.rankResults} format="horizontal" /></View>}

          {funnelSteps.length > 0 && (
            <div ref={this.resultsRef} id="rank-results" style={{ width: '100%', maxWidth: '600px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%)', borderRadius: '24px', padding: '1.5rem', border: '2px solid rgba(255,255,255,0.2)' }}>
              <h2 style={{ textAlign: 'center', color: '#fff', fontSize: '1.3rem', marginBottom: '1rem', fontWeight: 700 }}>
                🔬 Your Rarity Funnel
              </h2>
              {this.renderFunnel()}
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textAlign: 'center', marginTop: '1rem' }}>Data source: {DATA_SOURCE}</p>
            </div>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', marginTop: '2rem' }}><AdBanner slot={ADS_CONFIG.slots.rankFooter} format="horizontal" /></View>
          <Footer />
        </Flex>
        <style>{`input::-webkit-calendar-picker-indicator { filter: invert(1); } select { color-scheme: dark; }`}</style>
      </View>
    );
  }
}


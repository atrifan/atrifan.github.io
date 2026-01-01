import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { RankIcon } from '../components/RankIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';
import { getPercentiles, PercentileResult, DATA_SOURCE } from '../data/percentiles';

interface RankPageState {
  age: string;
  gender: 'male' | 'female' | null;
  height: string;
  weight: string;
  heightUnit: 'cm' | 'ft';
  weightUnit: 'kg' | 'lbs';
  results: PercentileResult[];
  chartType: 'bar' | 'gauge' | 'bell';
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
      results: [],
      chartType: 'bar',
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
    
    if (!gender) {
      alert('Please select a gender to calculate percentiles.');
      return;
    }
    if (!heightCm && !weightKg) {
      alert('Please enter at least height or weight.');
      return;
    }

    const results = getPercentiles(ageNum, gender, heightCm, weightKg);
    this.setState({ results }, this.scrollToResults);
  };

  private renderBarChart = (result: PercentileResult) => {
    const color = result.dimension === 'height' ? '#10b981' : '#3b82f6';
    return (
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{result.label}</span>
          <span style={{ color, fontWeight: 700, fontSize: '1.2rem' }}>{result.percentile}th</span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '12px', height: '24px', overflow: 'hidden', position: 'relative' }}>
          <div style={{ width: `${result.percentile}%`, height: '100%', background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: '12px', transition: 'width 0.8s ease-out' }} />
          {[25, 50, 75].map(p => (
            <div key={p} style={{ position: 'absolute', left: `${p}%`, top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.3)' }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.25rem' }}>
          <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
        </div>
      </div>
    );
  };

  private renderGaugeChart = (result: PercentileResult) => {
    const color = result.dimension === 'height' ? '#10b981' : '#3b82f6';
    const angle = (result.percentile / 100) * 180 - 90;
    return (
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600, marginBottom: '0.5rem' }}>{result.label}</div>
        <svg width="200" height="120" viewBox="0 0 200 120" style={{ maxWidth: '100%' }}>
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="16" strokeLinecap="round" />
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round"
            strokeDasharray={`${(result.percentile / 100) * 251.2} 251.2`} style={{ transition: 'stroke-dasharray 0.8s ease-out' }} />
          <line x1="100" y1="100" x2="100" y2="40" stroke="#fff" strokeWidth="4" strokeLinecap="round"
            transform={`rotate(${angle} 100 100)`} style={{ transition: 'transform 0.8s ease-out' }} />
          <circle cx="100" cy="100" r="8" fill="#fff" />
          <text x="100" y="85" textAnchor="middle" fill={color} fontSize="24" fontWeight="bold">{result.percentile}th</text>
        </svg>
      </div>
    );
  };

  private renderBellCurve = (result: PercentileResult) => {
    const color = result.dimension === 'height' ? '#10b981' : '#3b82f6';
    const xPos = 20 + (result.percentile / 100) * 160;
    return (
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600, marginBottom: '0.5rem' }}>{result.label}</div>
        <svg width="200" height="100" viewBox="0 0 200 100" style={{ maxWidth: '100%' }}>
          <path d="M 20 90 Q 60 90 80 60 Q 100 10 120 60 Q 140 90 180 90" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
          <line x1={xPos} y1="10" x2={xPos} y2="95" stroke={color} strokeWidth="3" strokeDasharray="5,3" style={{ transition: 'x1 0.8s, x2 0.8s' }} />
          <circle cx={xPos} cy="20" r="6" fill={color} style={{ transition: 'cx 0.8s' }} />
          <text x={xPos} y="15" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="bold">{result.percentile}th</text>
        </svg>
      </div>
    );
  };

  render() {
    const { age, gender, height, weight, heightUnit, weightUnit, results, chartType } = this.state;
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
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.5rem' }}>Body Percentile Calculator 📊</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <DisclaimerBanner title="Health Information" message={`This tool provides percentile rankings based on ${DATA_SOURCE}. For medical advice, consult a healthcare professional.`} color="#10b981" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Age (optional)</label>
                  <input type="number" placeholder="e.g. 25" value={age} onChange={(e) => this.setState({ age: e.target.value })} min="2" max="80" style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Gender *</label>
                  <select value={gender || ''} onChange={(e) => this.setState({ gender: e.target.value as 'male' | 'female' | null })} style={selectStyle}>
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Height</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="number" placeholder={heightUnit === 'cm' ? '170' : '5.7'} value={height} onChange={(e) => this.setState({ height: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                    <select value={heightUnit} onChange={(e) => this.setState({ heightUnit: e.target.value as 'cm' | 'ft' })} style={{ ...selectStyle, width: '70px', flex: 'none' }}>
                      <option value="cm">cm</option>
                      <option value="ft">ft</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Weight</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="number" placeholder={weightUnit === 'kg' ? '70' : '154'} value={weight} onChange={(e) => this.setState({ weight: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                    <select value={weightUnit} onChange={(e) => this.setState({ weightUnit: e.target.value as 'kg' | 'lbs' })} style={{ ...selectStyle, width: '70px', flex: 'none' }}>
                      <option value="kg">kg</option>
                      <option value="lbs">lbs</option>
                    </select>
                  </div>
                </div>
              </div>
              <button onClick={this.calculate} style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                Calculate Percentile 📊
              </button>
            </div>
          </View>

          {results.length > 0 && <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.rankResults} format="horizontal" /></View>}

          {results.length > 0 && (
            <div ref={this.resultsRef} id="rank-results" style={{ width: '100%', maxWidth: '600px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)', borderRadius: '24px', padding: '1.5rem', border: '2px solid rgba(255,255,255,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {(['bar', 'gauge', 'bell'] as const).map((type) => (
                  <button key={type} onClick={() => this.setState({ chartType: type })}
                    style={{ padding: '0.5rem 1rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: chartType === type ? gradient : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600, fontSize: '0.85rem', textTransform: 'capitalize' }}>
                    {type === 'bar' ? '📊 Bar' : type === 'gauge' ? '🎯 Gauge' : '📈 Bell Curve'}
                  </button>
                ))}
              </div>
              {results.map((r, i) => (
                <div key={i}>
                  {chartType === 'bar' && this.renderBarChart(r)}
                  {chartType === 'gauge' && this.renderGaugeChart(r)}
                  {chartType === 'bell' && this.renderBellCurve(r)}
                </div>
              ))}
              <div style={{ textAlign: 'center', marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: 0 }}>
                  {results.map(r => `Your ${r.dimension} is higher than ${r.percentile}% of ${gender === 'male' ? 'men' : 'women'}${age ? ` around age ${age}` : ''}.`).join(' ')}
                </p>
              </div>
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


import { Component, createRef, RefObject } from 'react';
import { View } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { ConvertIcon } from '../components/ConvertIcon';
import { SideAds } from '../components/SideAds';
import { AdBanner } from '../components/AdBanner';
import { inputStyles, inputPlaceholderCSS } from '../styles/inputStyles';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';
import { convertUnits, CONVERSION_OPTIONS, UnitCategory } from '../utils/UnitConverter';

interface ConvertPageState {
  category: UnitCategory;
  value: string;
  fromUnit: string;
  result: string | null;
}

export class ConvertPage extends Component<{}, ConvertPageState> {
  private resultRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    this.state = { category: 'weight', value: '', fromUnit: 'kg→lbs', result: null };
  }

  componentDidMount() {
    applySEO('convert');
  }

  private convert = () => {
    const { value, fromUnit } = this.state;
    const v = parseFloat(value);
    if (isNaN(v)) return;

    const [from, to] = fromUnit.split('→');

    try {
      // Use shared UnitConverter - single source of truth
      const convResult = convertUnits({ value: v, from, to });
      this.setState({ result: convResult.formatted }, () => {
        setTimeout(() => this.resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      });
    } catch {
      // Conversion not supported
      return;
    }
  };

  render() {
    const { category, value, fromUnit, result } = this.state;
    const gradient = 'linear-gradient(135deg, #64748b 0%, #475569 50%, #334155 100%)';
    const categories = ['weight', 'length', 'temperature'] as const;

    return (
      <View padding="size-400" minHeight="100vh" UNSAFE_style={{ background: '#0f0f23' }}>
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
        <BackToTools />

        <View UNSAFE_style={{ maxWidth: '38rem', margin: '0 auto', textAlign: 'center', paddingTop: '2rem' }}>
          <AdBanner slot={ADS_CONFIG.slots.convertTop} format="horizontal" />
          <ConvertIcon size={100} />
          <h1 style={{ color: '#fff', fontSize: '2.5rem', margin: '1rem 0 0.5rem' }}>CONVERT</h1>
          <h2 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.2rem', fontWeight: 400, marginBottom: '2rem' }}>
            Unit Converter
          </h2>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => this.setState({ category: cat, result: null, fromUnit: CONVERSION_OPTIONS[cat][0].from + '→' + CONVERSION_OPTIONS[cat][0].to })}
                style={{
                  padding: '0.75rem 1.5rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
                  background: category === cat ? gradient : 'rgba(255,255,255,0.1)',
                  color: '#fff', fontWeight: 600, textTransform: 'capitalize'
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem' }}>
            <select
              value={fromUnit}
              onChange={(e) => this.setState({ fromUnit: e.target.value, result: null })}
              style={{ ...inputStyles.select, marginBottom: '1rem' }}
            >
              {CONVERSION_OPTIONS[category].map((c, i) => (
                <option key={i} value={`${c.from}→${c.to}`}>{c.label}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Enter value"
              value={value}
              onChange={(e) => this.setState({ value: e.target.value })}
              style={{ ...inputStyles.largeInput, marginBottom: '1rem' }}
            />
            <button
              onClick={this.convert}
              style={{
                width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700,
                background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer'
              }}
            >
              Convert 🔄
            </button>
          </div>

          {result && (
            <div ref={this.resultRef} style={{ background: gradient, borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem' }}>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem', marginBottom: '0.5rem' }}>Result</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#fff' }}>{result}</div>
            </div>
          )}
          <AdBanner slot={ADS_CONFIG.slots.convertFooter} format="horizontal" />
        </View>
        <style>{inputPlaceholderCSS}</style>
      </View>
    );
  }
}


import { Component, createRef, RefObject } from 'react';
import { View } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { ConvertIcon } from '../components/ConvertIcon';
import { inputStyles, inputPlaceholderCSS } from '../styles/inputStyles';
import { applySEO } from '../utils/seo';

interface ConvertPageState {
  category: 'weight' | 'length' | 'temperature';
  value: string;
  fromUnit: string;
  result: string | null;
}

const CONVERSIONS = {
  weight: [
    { from: 'kg', to: 'lbs', factor: 2.20462, label: 'Kilograms → Pounds' },
    { from: 'lbs', to: 'kg', factor: 0.453592, label: 'Pounds → Kilograms' },
    { from: 'kg', to: 'oz', factor: 35.274, label: 'Kilograms → Ounces' },
    { from: 'oz', to: 'kg', factor: 0.0283495, label: 'Ounces → Kilograms' },
  ],
  length: [
    { from: 'cm', to: 'in', factor: 0.393701, label: 'Centimeters → Inches' },
    { from: 'in', to: 'cm', factor: 2.54, label: 'Inches → Centimeters' },
    { from: 'm', to: 'ft', factor: 3.28084, label: 'Meters → Feet' },
    { from: 'ft', to: 'm', factor: 0.3048, label: 'Feet → Meters' },
    { from: 'km', to: 'mi', factor: 0.621371, label: 'Kilometers → Miles' },
    { from: 'mi', to: 'km', factor: 1.60934, label: 'Miles → Kilometers' },
  ],
  temperature: [
    { from: 'C', to: 'F', formula: (v: number) => (v * 9/5) + 32, label: 'Celsius → Fahrenheit' },
    { from: 'F', to: 'C', formula: (v: number) => (v - 32) * 5/9, label: 'Fahrenheit → Celsius' },
    { from: 'C', to: 'K', formula: (v: number) => v + 273.15, label: 'Celsius → Kelvin' },
    { from: 'K', to: 'C', formula: (v: number) => v - 273.15, label: 'Kelvin → Celsius' },
  ],
};

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
    const { category, value, fromUnit } = this.state;
    const v = parseFloat(value);
    if (isNaN(v)) return;

    const conversions = CONVERSIONS[category];
    const [from, to] = fromUnit.split('→');
    const conv = conversions.find(c => c.from === from && c.to === to);
    if (!conv) return;

    let result: number;
    if ('formula' in conv) {
      result = (conv as any).formula(v);
    } else {
      result = v * (conv as any).factor;
    }
    this.setState({ result: `${result.toFixed(4)} ${to}` }, () => {
      setTimeout(() => this.resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    });
  };

  render() {
    const { category, value, fromUnit, result } = this.state;
    const gradient = 'linear-gradient(135deg, #64748b 0%, #475569 50%, #334155 100%)';
    const categories = ['weight', 'length', 'temperature'] as const;

    return (
      <View padding="size-400" minHeight="100vh" UNSAFE_style={{ background: '#0f0f23' }}>
        <BackToTools />
        
        <View UNSAFE_style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center', paddingTop: '2rem' }}>
          <ConvertIcon size={100} />
          <h1 style={{ color: '#fff', fontSize: '2.5rem', margin: '1rem 0 0.5rem' }}>CONVERT</h1>
          <h2 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.2rem', fontWeight: 400, marginBottom: '2rem' }}>
            Unit Converter
          </h2>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => this.setState({ category: cat, result: null, fromUnit: CONVERSIONS[cat][0].from + '→' + CONVERSIONS[cat][0].to })}
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
              {CONVERSIONS[category].map((c, i) => (
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
            <div ref={this.resultRef} style={{ background: gradient, borderRadius: '16px', padding: '2rem' }}>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem', marginBottom: '0.5rem' }}>Result</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#fff' }}>{result}</div>
            </div>
          )}
        </View>
        <style>{inputPlaceholderCSS}</style>
      </View>
    );
  }
}


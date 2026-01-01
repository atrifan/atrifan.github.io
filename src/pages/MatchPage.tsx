import { Component } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { AdBanner } from '../components/AdBanner';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { MatchIcon } from '../components/MatchIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { ADS_CONFIG } from '../config/ads.config';
import { ZODIAC_SIGNS, ZodiacSign, getSignFromDate, getCompatibility, getSignInfo, getCompatibilityMessage } from '../data/zodiac';

type InputMode = 'sign' | 'date';

interface PersonInput {
  mode: InputMode;
  sign: ZodiacSign | '';
  birthDate: string;
}

interface MatchPageState {
  person1: PersonInput;
  person2: PersonInput;
  result: { percentage: number; sign1: ZodiacSign; sign2: ZodiacSign } | null;
}

export class MatchPage extends Component<{}, MatchPageState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      person1: { mode: 'sign', sign: '', birthDate: '' },
      person2: { mode: 'sign', sign: '', birthDate: '' },
      result: null,
    };
  }

  componentDidMount() {
    document.title = 'Zodiac Match Tool – Free Handy Tool | Tulzo';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Check zodiac compatibility at a glance with this fast, free handy tool. See your love match percentage.');
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', 'Zodiac Match Tool – Free Handy Tool | Tulzo');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', 'Check zodiac compatibility at a glance with this fast, free handy tool.');
  }

  private getSignFromInput = (person: PersonInput): ZodiacSign | null => {
    if (person.mode === 'sign' && person.sign) return person.sign;
    if (person.mode === 'date' && person.birthDate) {
      const [, month, day] = person.birthDate.split('-').map(Number);
      return getSignFromDate(month, day);
    }
    return null;
  };

  private handleCalculate = () => {
    const sign1 = this.getSignFromInput(this.state.person1);
    const sign2 = this.getSignFromInput(this.state.person2);
    if (sign1 && sign2) {
      const percentage = getCompatibility(sign1, sign2);
      this.setState({ result: { percentage, sign1, sign2 } }, () => {
        setTimeout(() => {
          document.getElementById('match-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      });
    }
  };

  private updatePerson = (personKey: 'person1' | 'person2', updates: Partial<PersonInput>) => {
    this.setState(prev => ({
      ...prev,
      [personKey]: { ...prev[personKey], ...updates },
      result: null,
    }));
  };

  private renderPersonInput(personKey: 'person1' | 'person2', label: string) {
    const person = this.state[personKey];
    const inputStyle: React.CSSProperties = {
      width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '0.75rem',
      fontSize: '1rem', fontWeight: 600, background: 'rgba(255,255,255,0.95)',
      border: '2px solid transparent', borderRadius: '10px', color: '#1e1b4b',
    };
    const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

    return (
      <View UNSAFE_style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1rem', border: '1px solid rgba(255,255,255,0.2)' }}>
        <p style={{ color: '#fff', fontWeight: 700, marginBottom: '0.75rem', fontSize: '1.1rem' }}>{label}</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <button type="button" onClick={() => this.updatePerson(personKey, { mode: 'sign' })} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', background: person.mode === 'sign' ? '#ec4899' : 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>By Sign</button>
          <button type="button" onClick={() => this.updatePerson(personKey, { mode: 'date' })} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', background: person.mode === 'date' ? '#ec4899' : 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>By Date</button>
        </div>
        {person.mode === 'sign' ? (
          <select value={person.sign} onChange={(e) => this.updatePerson(personKey, { sign: e.target.value as ZodiacSign })} style={selectStyle}>
            <option value="">Select zodiac sign...</option>
            {ZODIAC_SIGNS.map(s => <option key={s.id} value={s.id}>{s.symbol} {s.name}</option>)}
          </select>
        ) : (
          <input type="date" value={person.birthDate} onChange={(e) => this.updatePerson(personKey, { birthDate: e.target.value })} style={inputStyle} />
        )}
      </View>
    );
  }

  render() {
    const { result } = this.state;
    const canCalculate = this.getSignFromInput(this.state.person1) && this.getSignFromInput(this.state.person2);

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #4c1d95 0%, #be185d 50%, #4c1d95 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.matchTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '1rem' }}><MatchIcon size={120} /></div>
            <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontWeight: 900, background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 50%, #fbbf24 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>MATCH</h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.5rem' }}>Zodiac Compatibility Checker 💕</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <DisclaimerBanner title="Just for Fun!" message="This is astrology-based entertainment only. Please don't base real relationship decisions on zodiac compatibility. Love is complex and unique!" color="#ec4899" />
          </View>

          {/* Input Form - always visible */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {this.renderPersonInput('person1', '💜 You')}
              {this.renderPersonInput('person2', '💛 Your Partner')}
            </div>
            <button onClick={this.handleCalculate} disabled={!canCalculate} style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: canCalculate ? 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)' : 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: '12px', cursor: canCalculate ? 'pointer' : 'not-allowed', opacity: canCalculate ? 1 : 0.6 }}>
              {result ? 'Recalculate 💕' : 'Check Compatibility 💕'}
            </button>
          </View>

          {/* Results Ad - between form and results */}
          {result && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
              <AdBanner slot={ADS_CONFIG.slots.matchResults} format="horizontal" />
            </View>
          )}

          {/* Results */}
          {result && (
            <View id="match-results" UNSAFE_style={{ width: '100%', maxWidth: '600px', background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.3) 0%, rgba(244, 63, 94, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '3rem' }}>{getSignInfo(result.sign1).symbol}</span>
                  <p style={{ color: '#fff', fontWeight: 600, margin: 0 }}>{getSignInfo(result.sign1).name}</p>
                </div>
                <span style={{ fontSize: '2rem' }}>❤️</span>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '3rem' }}>{getSignInfo(result.sign2).symbol}</span>
                  <p style={{ color: '#fff', fontWeight: 600, margin: 0 }}>{getSignInfo(result.sign2).name}</p>
                </div>
              </div>
              <p style={{ fontSize: 'clamp(4rem, 15vw, 6rem)', fontWeight: 900, color: getCompatibilityMessage(result.percentage).color, margin: '0 0 0.5rem 0', textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>{result.percentage}%</p>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{getCompatibilityMessage(result.percentage).emoji}</p>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.1rem', margin: '0' }}>{getCompatibilityMessage(result.percentage).message}</p>
            </View>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.matchFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
      </View>
    );
  }
}


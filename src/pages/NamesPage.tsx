import { Component } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { NamesIcon } from '../components/NamesIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';

interface NamesPageState {
  mode: 'names' | 'numbers';
  nameType: 'first' | 'full' | 'fantasy';
  gender: 'any' | 'male' | 'female';
  count: number;
  minNum: string;
  maxNum: string;
  results: string[];
}

const FIRST_NAMES = {
  male: ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Joseph', 'Charles', 'Thomas', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian'],
  female: ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle']
};
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White'];
const FANTASY_PREFIXES = ['Aer', 'Bal', 'Cor', 'Dra', 'El', 'Fen', 'Gal', 'Hor', 'Ith', 'Jor', 'Kal', 'Lor', 'Mor', 'Nar', 'Ori', 'Pyr', 'Qua', 'Rav', 'Syl', 'Thr', 'Ul', 'Val', 'Wyr', 'Xan', 'Yor', 'Zar'];
const FANTASY_SUFFIXES = ['ion', 'ius', 'ara', 'iel', 'oth', 'wyn', 'dor', 'rin', 'las', 'mir', 'ven', 'thos', 'gar', 'nak', 'zul'];

export class NamesPage extends Component<{}, NamesPageState> {
  constructor(props: {}) {
    super(props);
    this.state = { mode: 'names', nameType: 'first', gender: 'any', count: 5, minNum: '1', maxNum: '100', results: [] };
  }

  componentDidMount() {
    document.title = 'Name & Number Generator – Free Handy Tool | Tulzo';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Generate random names and numbers for games, writing, and more.');
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', 'Name & Number Generator – Free Handy Tool | Tulzo');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', 'Generate random names and numbers for games, writing, and more.');
  }

  private generateNames = () => {
    const { nameType, gender, count } = this.state;
    const results: string[] = [];
    
    for (let i = 0; i < count; i++) {
      if (nameType === 'fantasy') {
        const prefix = FANTASY_PREFIXES[Math.floor(Math.random() * FANTASY_PREFIXES.length)];
        const suffix = FANTASY_SUFFIXES[Math.floor(Math.random() * FANTASY_SUFFIXES.length)];
        results.push(prefix + suffix);
      } else {
        const genderChoice = gender === 'any' ? (Math.random() < 0.5 ? 'male' : 'female') : gender;
        const firstName = FIRST_NAMES[genderChoice][Math.floor(Math.random() * FIRST_NAMES[genderChoice].length)];
        if (nameType === 'first') {
          results.push(firstName);
        } else {
          const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
          results.push(`${firstName} ${lastName}`);
        }
      }
    }
    this.setState({ results });
  };

  private generateNumbers = () => {
    const { count, minNum, maxNum } = this.state;
    const min = parseInt(minNum) || 1;
    const max = parseInt(maxNum) || 100;
    const results = Array.from({ length: count }, () => 
      (Math.floor(Math.random() * (max - min + 1)) + min).toString()
    );
    this.setState({ results });
  };

  render() {
    const { mode, nameType, gender, count, minNum, maxNum, results } = this.state;
    const gradient = 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)';

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #4c1d95 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.namesTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '1rem' }}><NamesIcon size={120} /></div>
            <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>NAMES</h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.5rem' }}>Name & Number Generator 👤</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <DisclaimerBanner title="Random Generator" message="This is a fun utility tool for generating random names and numbers. Results are randomly generated for entertainment purposes." color="#7c3aed" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
              {[{ id: 'names', label: '👤 Names' }, { id: 'numbers', label: '🔢 Numbers' }].map((m) => (
                <button key={m.id} onClick={() => this.setState({ mode: m.id as any, results: [] })}
                  style={{ padding: '0.75rem 2rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: mode === m.id ? gradient : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600, fontSize: '1.1rem' }}>
                  {m.label}
                </button>
              ))}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem' }}>
              {mode === 'names' ? (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {[{ id: 'first', label: 'First Name' }, { id: 'full', label: 'Full Name' }, { id: 'fantasy', label: 'Fantasy' }].map((t) => (
                      <button key={t.id} onClick={() => this.setState({ nameType: t.id as any })}
                        style={{ padding: '0.5rem 1rem', borderRadius: '15px', border: 'none', cursor: 'pointer', background: nameType === t.id ? '#7c3aed' : 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 500 }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {nameType !== 'fantasy' && (
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
                      {[{ id: 'any', label: 'Any' }, { id: 'male', label: 'Male' }, { id: 'female', label: 'Female' }].map((g) => (
                        <button key={g.id} onClick={() => this.setState({ gender: g.id as any })}
                          style={{ padding: '0.5rem 1rem', borderRadius: '15px', border: 'none', cursor: 'pointer', background: gender === g.id ? '#7c3aed' : 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 500 }}>
                          {g.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <input type="number" placeholder="Min" value={minNum} onChange={(e) => this.setState({ minNum: e.target.value })}
                    style={{ width: '100px', padding: '0.75rem', fontSize: '1.1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', textAlign: 'center' }} />
                  <span style={{ color: '#fff' }}>to</span>
                  <input type="number" placeholder="Max" value={maxNum} onChange={(e) => this.setState({ maxNum: e.target.value })}
                    style={{ width: '100px', padding: '0.75rem', fontSize: '1.1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', textAlign: 'center' }} />
                </div>
              )}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: '#fff', marginRight: '1rem' }}>Generate:</label>
                <select value={count} onChange={(e) => this.setState({ count: parseInt(e.target.value) })}
                  style={{ padding: '0.5rem 1rem', fontSize: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(30,30,50,0.9)', color: '#fff', cursor: 'pointer' }}>
                  {[1, 3, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button onClick={mode === 'names' ? this.generateNames : this.generateNumbers}
                style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                Generate {mode === 'names' ? '👤' : '🔢'}
              </button>
            </div>
          </View>

          {results.length > 0 && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
              <AdBanner slot={ADS_CONFIG.slots.namesResults} format="horizontal" />
            </View>
          )}

          {results.length > 0 && (
            <View id="names-results" UNSAFE_style={{ width: '100%', maxWidth: '600px', background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.3) 0%, rgba(109, 40, 217, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)' }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '1rem', textAlign: 'center' }}>Results</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
                {results.map((r, i) => (
                  <div key={i} style={{ background: gradient, padding: '0.75rem 1.25rem', borderRadius: '20px', color: '#fff', fontWeight: 600, fontSize: '1.1rem' }}>{r}</div>
                ))}
              </div>
            </View>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.namesFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
        <style>{`
          input::placeholder { color: rgba(255,255,255,0.5); }
          select option { background: #1f2937; color: #fff; }
        `}</style>
      </View>
    );
  }
}


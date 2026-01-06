import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { AgeIcon } from '../components/AgeIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { Footer } from '../components/Footer';
import { AlertModal } from '../components/AlertModal';
import { ShareResults } from '../components/ShareResults';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';
import { calculateAgeForUI, AgeCalculatorUIOutput } from '../utils/AgeCalculator';

interface AgePageState {
  birthDate: string;
  result: AgeCalculatorUIOutput | null;
  showAlert: boolean;
  alertMessage: string;
}

export class AgePage extends Component<{}, AgePageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    this.state = {
      birthDate: '',
      result: null,
      showAlert: false,
      alertMessage: '',
    };
  }

  private scrollToResults = () => {
    setTimeout(() => {
      this.resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  private reset = () => {
    this.setState({ birthDate: '', result: null });
  };

  componentDidMount() {
    applySEO('age');
  }

  private calculateAge = () => {
    const { birthDate } = this.state;
    if (!birthDate) return;

    try {
      // Use shared AgeCalculator - single source of truth
      const result = calculateAgeForUI({ birthDate });
      this.setState({ result }, this.scrollToResults);
    } catch {
      // Birth date is in the future
      this.setState({
        showAlert: true,
        alertMessage: 'Birth date cannot be in the future! Please enter a valid date.'
      });
    }
  };

  render() {
    const { birthDate, result, showAlert, alertMessage } = this.state;
    const gradient = 'linear-gradient(135deg, #f472b6 0%, #ec4899 50%, #db2777 100%)';

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #831843 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
        <AlertModal
          isOpen={showAlert}
          title="Invalid Date"
          message={alertMessage}
          icon="📅"
          buttonText="Got it"
          color="#ec4899"
          onClose={() => this.setState({ showAlert: false })}
        />
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}><AdBanner slot={ADS_CONFIG.slots.ageTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}><AgeIcon size={80} /></div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>AGE</h1>
            <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', color: 'rgba(255,255,255,0.8)', marginTop: '0.25rem' }}>Age Calculator 🎂</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
            <DisclaimerBanner title="Fun Tool" message="This is a fun utility tool for calculating your age. Results are based on the date you provide." color="#f472b6" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem' }}>
              <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Enter your birth date</label>
              <input type="date" value={birthDate} onChange={(e) => this.setState({ birthDate: e.target.value })}
                style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', marginBottom: '1rem', colorScheme: 'dark', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={this.calculateAge}
                  style={{ flex: 1, padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                  Calculate My Age 🎂
                </button>
                <button onClick={this.reset}
                  style={{ padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '12px', cursor: 'pointer' }}>
                  🔄
                </button>
              </div>
            </div>
          </View>

          {result && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
              <AdBanner slot={ADS_CONFIG.slots.ageResults} format="horizontal" />
            </View>
          )}

          {result && (
            <>
              <div ref={this.resultsRef} id="age-results" style={{ width: '100%', maxWidth: '38rem', background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.3) 0%, rgba(236, 72, 153, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)' }}>
                <div style={{ fontSize: 'clamp(2rem, 8vw, 3rem)', fontWeight: 800, color: '#f472b6', marginBottom: '0.5rem', textAlign: 'center' }}>{result.years} years old</div>
                <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.2rem', marginBottom: '1.5rem', textAlign: 'center' }}>{result.years} years, {result.months} months, and {result.days} days</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  {[{ label: 'Total Days', value: result.totalDays.toLocaleString() }, { label: 'Total Weeks', value: result.totalWeeks.toLocaleString() }, { label: 'Total Months', value: result.totalMonths.toLocaleString() }, { label: 'Total Hours', value: result.totalHours.toLocaleString() }].map((item, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '12px' }}>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>{item.label}</div>
                      <div style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(244,114,182,0.2)', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ color: '#f472b6', fontWeight: 600 }}>🎉 Next Birthday</div>
                  <div style={{ color: '#fff', fontSize: '1.1rem' }}>{result.daysUntilNextBirthday} days away ({result.nextBirthdayDate.toLocaleDateString()})</div>
                </div>
              </div>
              <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <ShareResults
                  targetRef={this.resultsRef}
                  title="My Age - Tulzo"
                  text={`I'm ${result.years} years old! That's ${result.totalDays.toLocaleString()} days of life 🎂`}
                />
              </div>
            </>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.ageFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
        <style>{`input::-webkit-calendar-picker-indicator { filter: invert(1); }`}</style>
      </View>
    );
  }
}


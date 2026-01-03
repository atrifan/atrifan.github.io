import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { DaysIcon } from '../components/DaysIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { Footer } from '../components/Footer';
import { ShareResults } from '../components/ShareResults';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

interface DaysPageState {
  eventName: string;
  eventDate: string;
  result: CountdownResult | null;
}

interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  weeks: number;
  months: number;
  isPast: boolean;
}

export class DaysPage extends Component<{}, DaysPageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    this.state = {
      eventName: '',
      eventDate: '',
      result: null,
    };
  }

  componentDidMount() {
    applySEO('days');
  }

  private scrollToResults = () => {
    setTimeout(() => {
      this.resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  private calculateCountdown = () => {
    const { eventDate } = this.state;
    if (!eventDate) return;

    const event = new Date(eventDate);
    const now = new Date();
    const diff = event.getTime() - now.getTime();
    const isPast = diff < 0;
    const absDiff = Math.abs(diff);

    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30.44);

    this.setState({ result: { days, hours, minutes, weeks, months, isPast } }, this.scrollToResults);
  };

  render() {
    const { eventName, eventDate, result } = this.state;
    const gradient = 'linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%)';

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #164e63 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.daysTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}><DaysIcon size={80} /></div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>DAYS</h1>
            <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', color: 'rgba(255,255,255,0.8)', marginTop: '0.25rem' }}>Countdown Timer ⏳</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <DisclaimerBanner title="Countdown Tool" message="This is a utility tool for counting days. Results are calculated based on the dates you provide." color="#06b6d4" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem' }}>
              <input type="text" placeholder="Event name (e.g., Vacation, Birthday)" value={eventName} onChange={(e) => this.setState({ eventName: e.target.value })}
                style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', marginBottom: '1rem', boxSizing: 'border-box' }} />
              <input type="date" value={eventDate} onChange={(e) => this.setState({ eventDate: e.target.value })}
                style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', marginBottom: '1rem', colorScheme: 'dark', boxSizing: 'border-box' }} />
              <button onClick={this.calculateCountdown}
                style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                Start Countdown ⏳
              </button>
            </div>
          </View>

          {result && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
              <AdBanner slot={ADS_CONFIG.slots.daysResults} format="horizontal" />
            </View>
          )}

          {result && (
            <>
              <div ref={this.resultsRef} id="days-results" style={{ width: '100%', maxWidth: '600px', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.3) 0%, rgba(8, 145, 178, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>
                {eventName && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', marginBottom: '0.5rem' }}>{result.isPast ? 'Since' : 'Until'} {eventName}</div>}
                <div style={{ fontSize: 'clamp(3rem, 10vw, 4rem)', fontWeight: 800, color: '#06b6d4', marginBottom: '0.5rem' }}>{result.days}</div>
                <div style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '1rem' }}>days {result.isPast ? 'ago' : 'to go'}</div>
                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem', marginBottom: '1.5rem' }}>{result.days} days, {result.hours} hours, {result.minutes} minutes</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '12px' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Weeks</div>
                    <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>{result.weeks}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '12px' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Months</div>
                    <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>{result.months}</div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <ShareResults
                  targetRef={this.resultsRef}
                  title="Countdown - Tulzo"
                  text={`${result.days} days ${result.isPast ? 'since' : 'until'} ${eventName || 'my event'}! ⏳`}
                />
              </div>
            </>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.daysFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
        <style>{`input::placeholder { color: rgba(255,255,255,0.5); } input::-webkit-calendar-picker-indicator { filter: invert(1); }`}</style>
      </View>
    );
  }
}


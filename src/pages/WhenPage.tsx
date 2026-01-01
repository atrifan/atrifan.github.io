import { Component } from 'react';
import { View } from '@adobe/react-spectrum';
import { AdBanner } from '../components/AdBanner';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { WhenIcon } from '../components/WhenIcon';
import { DateCalculator, DateResult } from '../utils/DateCalculator';
import { ADS_CONFIG } from '../config/ads.config';

interface WhenPageState {
  selectedDate: string;
  result: DateResult | null;
}

export class WhenPage extends Component<object, WhenPageState> {
  constructor(props: object) {
    super(props);
    
    // Default to today's date
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    this.state = {
      selectedDate: todayStr,
      result: DateCalculator.calculate(todayStr),
    };
  }

  componentDidMount() {
    document.title = 'WHEN - What Day Is It? | Day of Week Calculator | Tulzo';
    
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Find out what day of the week any date falls on. Works for past, present, and future dates. Handles leap years correctly.');
    }

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', 'WHEN - Day of Week Calculator | Tulzo');
  }

  private handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateStr = e.target.value;
    if (dateStr) {
      this.setState({
        selectedDate: dateStr,
        result: DateCalculator.calculate(dateStr),
      });
    }
  };

  private getDaysText = (days: number): string => {
    const absDays = Math.abs(days);
    if (days === 0) return "That's today!";
    if (days === 1) return "That's tomorrow";
    if (days === -1) return "That was yesterday";
    if (days > 0) return `That's ${absDays} days from now`;
    return `That was ${absDays} days ago`;
  };

  render() {
    const { selectedDate, result } = this.state;

    const inputStyle: React.CSSProperties = {
      width: '100%',
      padding: '1.25rem 1.5rem',
      fontSize: '1.3rem',
      fontWeight: 600,
      background: 'rgba(255, 255, 255, 0.95)',
      border: '3px solid transparent',
      borderRadius: '16px',
      color: '#1e293b',
      textAlign: 'center',
    };

    return (
      <View
        minHeight="100vh"
        UNSAFE_style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          padding: 'clamp(1rem, 3vw, 2rem)',
        }}
      >
        <View maxWidth="800px" marginX="auto">
          {/* Back Button */}
          <View marginBottom="size-400">
            <BackToTools />
          </View>

          {/* Top Ad */}
          <AdBanner slot={ADS_CONFIG.slots.whenTop} format="horizontal" />

          {/* Hero Header */}
          <View UNSAFE_style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div className="animate-float" style={{ marginBottom: '1.5rem' }}>
              <WhenIcon size={140} />
            </div>

            <h1 style={{
              fontSize: 'clamp(2.5rem, 8vw, 5rem)',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #3b82f6 0%, #0ea5e9 50%, #06b6d4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              margin: 0,
              letterSpacing: '-0.02em',
            }}>
              WHEN
            </h1>
            <p style={{
              fontSize: 'clamp(1.1rem, 3vw, 1.4rem)',
              color: 'rgba(255, 255, 255, 0.8)',
              marginTop: '0.5rem',
              fontWeight: 500,
            }}>
              What day is it? 📅
            </p>
          </View>

          {/* Date Input Card */}
          <View
            UNSAFE_style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(6, 182, 212, 0.2) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '24px',
              padding: 'clamp(1.5rem, 4vw, 2.5rem)',
              marginBottom: '1.5rem',
            }}
          >
            <label style={{
              display: 'block',
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: '1.1rem',
              fontWeight: 600,
              marginBottom: '1rem',
              textAlign: 'center',
            }}>
              📅 Pick a date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={this.handleDateChange}
              style={inputStyle}
            />
          </View>

          {/* Results */}
          {result && this.renderResult(result)}

          {/* Bottom Ad */}
          <AdBanner slot={ADS_CONFIG.slots.whenFooter} format="horizontal" />

          <Footer />
        </View>
      </View>
    );
  }

  private renderResult(result: DateResult) {
    const tenseColors = {
      past: { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', text: '#fca5a5' },
      present: { bg: 'rgba(34, 197, 94, 0.2)', border: '#22c55e', text: '#86efac' },
      future: { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', text: '#93c5fd' },
    };
    const colors = tenseColors[result.tense];

    return (
      <View
        UNSAFE_style={{
          background: colors.bg,
          border: `2px solid ${colors.border}`,
          borderRadius: '24px',
          padding: 'clamp(2rem, 5vw, 3rem)',
          marginBottom: '1.5rem',
          textAlign: 'center',
        }}
      >
        {/* Main Day Display */}
        <div style={{
          fontSize: 'clamp(3rem, 10vw, 5rem)',
          fontWeight: 900,
          color: '#fff',
          marginBottom: '0.5rem',
          textShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {result.dayOfWeek}
        </div>

        {/* Message */}
        <p style={{
          fontSize: 'clamp(1.1rem, 3vw, 1.4rem)',
          color: colors.text,
          fontWeight: 600,
          margin: '0 0 1.5rem 0',
        }}>
          {result.message}
        </p>

        {/* Days from today */}
        <div style={{
          display: 'inline-block',
          background: 'rgba(255, 255, 255, 0.1)',
          padding: '0.75rem 1.5rem',
          borderRadius: '50px',
          color: 'rgba(255, 255, 255, 0.9)',
          fontWeight: 600,
          fontSize: '1rem',
          marginBottom: '1.5rem',
        }}>
          {this.getDaysText(result.daysFromToday)}
        </div>

        {/* Extra Info Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '1rem',
          marginTop: '1rem',
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '1rem',
            borderRadius: '12px',
          }}>
            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
              Week of Year
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>
              {result.weekOfYear}
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '1rem',
            borderRadius: '12px',
          }}>
            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
              Day of Year
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>
              {result.dayOfYear}
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '1rem',
            borderRadius: '12px',
          }}>
            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
              Leap Year
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>
              {result.isLeapYear ? '✅ Yes' : '❌ No'}
            </div>
          </div>
        </div>
      </View>
    );
  }
}


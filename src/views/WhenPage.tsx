import { Component, createRef, RefObject } from 'react';
import { View } from '@adobe/react-spectrum';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { ShareResults } from '../components/ShareResults';
import { WhenIcon } from '../components/WhenIcon';
import { DateCalculator, DateResult } from '../utils/DateCalculator';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

interface WhenPageState {
  selectedDate: string;
  result: DateResult | null;
}

export class WhenPage extends Component<object, WhenPageState> {
  private resultRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: object) {
    super(props);

    // Use a fixed date for SSR, will be updated in componentDidMount
    this.state = {
      selectedDate: '',
      result: null,
    };
  }

  componentDidMount() {
    applySEO('when');
    // Set today's date on client side to avoid hydration mismatch
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    this.setState({
      selectedDate: todayStr,
      result: DateCalculator.calculate(todayStr),
    });
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

  private getTimeBreakdowns = (days: number): string[] => {
    const absDays = Math.abs(days);
    if (days === 0) return [];

    const isPast = days < 0;
    const suffix = isPast ? 'ago' : 'from now';
    const breakdowns: string[] = [];

    // Calculate all time units
    const totalMinutes = absDays * 24 * 60;
    const totalHours = absDays * 24;

    // Minutes breakdown
    breakdowns.push(`${totalMinutes.toLocaleString()} minutes ${suffix}`);

    // Hours and minutes breakdown
    const hours = Math.floor(totalHours);
    const minutes = Math.round((totalHours - hours) * 60);
    if (minutes > 0) {
      breakdowns.push(`${hours.toLocaleString()} hours and ${minutes} minutes ${suffix}`);
    } else {
      breakdowns.push(`${hours.toLocaleString()} hours ${suffix}`);
    }

    // Days, hours, and minutes breakdown
    const daysOnly = Math.floor(absDays);
    const remainingHours = Math.floor((absDays - daysOnly) * 24);
    const remainingMinutes = Math.round(((absDays - daysOnly) * 24 - remainingHours) * 60);
    if (remainingHours > 0 || remainingMinutes > 0) {
      breakdowns.push(`${daysOnly} days, ${remainingHours} hours, and ${remainingMinutes} minutes ${suffix}`);
    } else {
      breakdowns.push(`${daysOnly} days ${suffix}`);
    }

    // Weeks and days breakdown
    const weeks = Math.floor(absDays / 7);
    const daysAfterWeeks = Math.floor(absDays % 7);
    if (weeks > 0) {
      if (daysAfterWeeks > 0) {
        breakdowns.push(`${weeks} week${weeks !== 1 ? 's' : ''} and ${daysAfterWeeks} day${daysAfterWeeks !== 1 ? 's' : ''} ${suffix}`);
      } else {
        breakdowns.push(`${weeks} week${weeks !== 1 ? 's' : ''} ${suffix}`);
      }
    }

    // Months, weeks, and days breakdown (approximate: 30.44 days per month)
    const months = Math.floor(absDays / 30.44);
    const daysAfterMonths = absDays - (months * 30.44);
    const weeksAfterMonths = Math.floor(daysAfterMonths / 7);
    const daysAfterWeeksMonths = Math.floor(daysAfterMonths % 7);

    if (months > 0) {
      const parts: string[] = [`${months} month${months !== 1 ? 's' : ''}`];
      if (weeksAfterMonths > 0) {
        parts.push(`${weeksAfterMonths} week${weeksAfterMonths !== 1 ? 's' : ''}`);
      }
      if (daysAfterWeeksMonths > 0) {
        parts.push(`${daysAfterWeeksMonths} day${daysAfterWeeksMonths !== 1 ? 's' : ''}`);
      }
      breakdowns.push(`${parts.join(', ')} ${suffix}`);
    }

    // Years, months, weeks, and days breakdown (approximate: 365.25 days per year)
    const years = Math.floor(absDays / 365.25);
    const daysAfterYears = absDays - (years * 365.25);
    const monthsAfterYears = Math.floor(daysAfterYears / 30.44);
    const daysAfterMonthsYears = daysAfterYears - (monthsAfterYears * 30.44);
    const weeksAfterMonthsYears = Math.floor(daysAfterMonthsYears / 7);
    const daysAfterAll = Math.floor(daysAfterMonthsYears % 7);

    if (years > 0) {
      const parts: string[] = [`${years} year${years !== 1 ? 's' : ''}`];
      if (monthsAfterYears > 0) {
        parts.push(`${monthsAfterYears} month${monthsAfterYears !== 1 ? 's' : ''}`);
      }
      if (weeksAfterMonthsYears > 0) {
        parts.push(`${weeksAfterMonthsYears} week${weeksAfterMonthsYears !== 1 ? 's' : ''}`);
      }
      if (daysAfterAll > 0) {
        parts.push(`${daysAfterAll} day${daysAfterAll !== 1 ? 's' : ''}`);
      }
      breakdowns.push(`${parts.join(', ')} ${suffix}`);
    }

    return breakdowns;
  };

  render() {
    const { selectedDate, result } = this.state;

    const inputStyle: React.CSSProperties = {
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      padding: '1rem',
      fontSize: '1.1rem',
      fontWeight: 600,
      background: 'rgba(255, 255, 255, 0.95)',
      border: '2px solid transparent',
      borderRadius: '12px',
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
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
        <View maxWidth="50rem" marginX="auto">
          {/* Back Button */}
          <View marginBottom="size-400">
            <BackToTools />
          </View>

          {/* Top Ad */}
          <AdBanner slot={ADS_CONFIG.slots.whenTop} format="horizontal" />

          {/* Hero Header */}
          <View UNSAFE_style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}>
              <WhenIcon size={90} />
            </div>

            <h1 style={{
              fontSize: 'clamp(1.75rem, 6vw, 3.5rem)',
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
              fontSize: 'clamp(0.85rem, 2.5vw, 1.2rem)',
              color: 'rgba(255, 255, 255, 0.8)',
              marginTop: '0.25rem',
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

  private getShareText(result: DateResult): string {
    const absDays = Math.abs(result.daysFromToday);
    if (result.isToday) {
      return `Today is ${result.dayOfWeek}! 📅`;
    } else if (result.isPast) {
      return `${result.formattedDate} was a ${result.dayOfWeek} (${absDays} days ago) 📅`;
    } else {
      return `${result.formattedDate} will be a ${result.dayOfWeek} (${absDays} days from now) 📅`;
    }
  }

  private renderResult(result: DateResult) {
    const tenseColors = {
      past: { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', text: '#fca5a5' },
      present: { bg: 'rgba(34, 197, 94, 0.2)', border: '#22c55e', text: '#86efac' },
      future: { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', text: '#93c5fd' },
    };
    const colors = tenseColors[result.tense];

    return (
      <>
      <div ref={this.resultRef}>
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

        {/* Time Breakdowns */}
        {result.daysFromToday !== 0 && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '16px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{
              fontSize: '0.9rem',
              color: 'rgba(255, 255, 255, 0.7)',
              marginBottom: '1rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              ⏱️ Time Breakdown
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}>
              {this.getTimeBreakdowns(result.daysFromToday).map((breakdown, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    color: 'rgba(255, 255, 255, 0.95)',
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    textAlign: 'left',
                    borderLeft: `3px solid ${colors.border}`,
                  }}
                >
                  {breakdown}
                </div>
              ))}
            </div>
          </div>
        )}

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
      </div>
      <div style={{ marginTop: '0.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
        <ShareResults
          targetRef={this.resultRef}
          title="Date Calculator - Tulzo"
          text={this.getShareText(result)}
        />
      </div>
      </>
    );
  }
}


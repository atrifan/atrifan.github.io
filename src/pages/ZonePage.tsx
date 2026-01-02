import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { ZoneIcon } from '../components/ZoneIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { inputStyles } from '../styles/inputStyles';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

interface ZonePageState {
  fromZone: string;
  targetZones: string[];
  inputTime: string;
  hasConverted: boolean;
}

interface TimezoneInfo {
  id: string;
  label: string;
  city: string;
  offset: number;
}

const TIMEZONES: TimezoneInfo[] = [
  // UTC Reference
  { id: 'UTC', label: 'UTC (Coordinated Universal Time)', city: 'UTC', offset: 0 },
  // Manual offsets
  { id: 'UTC-12', label: 'UTC-12:00', city: 'UTC-12', offset: -12 },
  { id: 'UTC-11', label: 'UTC-11:00', city: 'UTC-11', offset: -11 },
  { id: 'UTC-10', label: 'UTC-10:00 (Hawaii)', city: 'Hawaii', offset: -10 },
  { id: 'UTC-9', label: 'UTC-09:00 (Alaska)', city: 'Alaska', offset: -9 },
  { id: 'UTC-8', label: 'UTC-08:00 (Pacific)', city: 'Pacific', offset: -8 },
  { id: 'UTC-7', label: 'UTC-07:00 (Mountain)', city: 'Mountain', offset: -7 },
  { id: 'UTC-6', label: 'UTC-06:00 (Central)', city: 'Central', offset: -6 },
  { id: 'UTC-5', label: 'UTC-05:00 (Eastern)', city: 'Eastern', offset: -5 },
  { id: 'UTC-4', label: 'UTC-04:00 (Atlantic)', city: 'Atlantic', offset: -4 },
  { id: 'UTC-3', label: 'UTC-03:00 (Brazil)', city: 'Brazil', offset: -3 },
  { id: 'UTC-2', label: 'UTC-02:00', city: 'UTC-2', offset: -2 },
  { id: 'UTC-1', label: 'UTC-01:00 (Azores)', city: 'Azores', offset: -1 },
  { id: 'UTC+1', label: 'UTC+01:00 (CET)', city: 'CET', offset: 1 },
  { id: 'UTC+2', label: 'UTC+02:00 (EET)', city: 'EET', offset: 2 },
  { id: 'UTC+3', label: 'UTC+03:00 (Moscow)', city: 'Moscow', offset: 3 },
  { id: 'UTC+4', label: 'UTC+04:00 (Dubai)', city: 'Dubai', offset: 4 },
  { id: 'UTC+5', label: 'UTC+05:00 (Pakistan)', city: 'Pakistan', offset: 5 },
  { id: 'UTC+5.5', label: 'UTC+05:30 (India)', city: 'India', offset: 5.5 },
  { id: 'UTC+6', label: 'UTC+06:00 (Bangladesh)', city: 'Bangladesh', offset: 6 },
  { id: 'UTC+7', label: 'UTC+07:00 (Bangkok)', city: 'Bangkok', offset: 7 },
  { id: 'UTC+8', label: 'UTC+08:00 (Singapore/China)', city: 'Singapore', offset: 8 },
  { id: 'UTC+9', label: 'UTC+09:00 (Tokyo/Seoul)', city: 'Tokyo', offset: 9 },
  { id: 'UTC+10', label: 'UTC+10:00 (Sydney)', city: 'Sydney', offset: 10 },
  { id: 'UTC+11', label: 'UTC+11:00', city: 'UTC+11', offset: 11 },
  { id: 'UTC+12', label: 'UTC+12:00 (Auckland)', city: 'Auckland', offset: 12 },
  // Major cities
  { id: 'America/New_York', label: 'New York, USA (EST/EDT)', city: 'New York', offset: -5 },
  { id: 'America/Los_Angeles', label: 'Los Angeles, USA (PST/PDT)', city: 'Los Angeles', offset: -8 },
  { id: 'America/Chicago', label: 'Chicago, USA (CST/CDT)', city: 'Chicago', offset: -6 },
  { id: 'America/Denver', label: 'Denver, USA (MST/MDT)', city: 'Denver', offset: -7 },
  { id: 'America/Toronto', label: 'Toronto, Canada (EST/EDT)', city: 'Toronto', offset: -5 },
  { id: 'America/Vancouver', label: 'Vancouver, Canada (PST/PDT)', city: 'Vancouver', offset: -8 },
  { id: 'America/Mexico_City', label: 'Mexico City (CST)', city: 'Mexico City', offset: -6 },
  { id: 'America/Sao_Paulo', label: 'São Paulo, Brazil (BRT)', city: 'São Paulo', offset: -3 },
  { id: 'Europe/London', label: 'London, UK (GMT/BST)', city: 'London', offset: 0 },
  { id: 'Europe/Paris', label: 'Paris, France (CET/CEST)', city: 'Paris', offset: 1 },
  { id: 'Europe/Berlin', label: 'Berlin, Germany (CET/CEST)', city: 'Berlin', offset: 1 },
  { id: 'Europe/Rome', label: 'Rome, Italy (CET/CEST)', city: 'Rome', offset: 1 },
  { id: 'Europe/Madrid', label: 'Madrid, Spain (CET/CEST)', city: 'Madrid', offset: 1 },
  { id: 'Europe/Amsterdam', label: 'Amsterdam, Netherlands (CET/CEST)', city: 'Amsterdam', offset: 1 },
  { id: 'Europe/Moscow', label: 'Moscow, Russia (MSK)', city: 'Moscow', offset: 3 },
  { id: 'Europe/Istanbul', label: 'Istanbul, Turkey (TRT)', city: 'Istanbul', offset: 3 },
  { id: 'Asia/Dubai', label: 'Dubai, UAE (GST)', city: 'Dubai', offset: 4 },
  { id: 'Asia/Kolkata', label: 'Mumbai/Delhi, India (IST)', city: 'India', offset: 5.5 },
  { id: 'Asia/Bangkok', label: 'Bangkok, Thailand (ICT)', city: 'Bangkok', offset: 7 },
  { id: 'Asia/Singapore', label: 'Singapore (SGT)', city: 'Singapore', offset: 8 },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', city: 'Hong Kong', offset: 8 },
  { id: 'Asia/Shanghai', label: 'Shanghai/Beijing, China (CST)', city: 'Shanghai', offset: 8 },
  { id: 'Asia/Tokyo', label: 'Tokyo, Japan (JST)', city: 'Tokyo', offset: 9 },
  { id: 'Asia/Seoul', label: 'Seoul, South Korea (KST)', city: 'Seoul', offset: 9 },
  { id: 'Australia/Sydney', label: 'Sydney, Australia (AEST/AEDT)', city: 'Sydney', offset: 10 },
  { id: 'Australia/Melbourne', label: 'Melbourne, Australia (AEST/AEDT)', city: 'Melbourne', offset: 10 },
  { id: 'Pacific/Auckland', label: 'Auckland, New Zealand (NZST/NZDT)', city: 'Auckland', offset: 12 },
];

export class ZonePage extends Component<{}, ZonePageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    const now = new Date();
    this.state = {
      fromZone: 'UTC',
      targetZones: ['America/New_York', 'Europe/London', 'Asia/Tokyo'],
      inputTime: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
      hasConverted: false
    };
  }

  componentDidMount() {
    applySEO('zone');
  }

  private convertTime = (fromOffset: number, toOffset: number, hours: number, minutes: number) => {
    const diff = toOffset - fromOffset;
    let newHours = hours + diff;
    let dayChange = '';

    if (newHours >= 24) {
      newHours -= 24;
      dayChange = ' (+1 day)';
    } else if (newHours < 0) {
      newHours += 24;
      dayChange = ' (-1 day)';
    }

    const h = Math.floor(newHours);
    const m = minutes + (newHours % 1) * 60;
    return `${h.toString().padStart(2, '0')}:${Math.round(m).toString().padStart(2, '0')}${dayChange}`;
  };

  private addTargetZone = () => {
    const { targetZones } = this.state;
    const availableZones = TIMEZONES.filter(tz => !targetZones.includes(tz.id) && tz.id !== this.state.fromZone);
    if (availableZones.length > 0) {
      this.setState({ targetZones: [...targetZones, availableZones[0].id] });
    }
  };

  private removeTargetZone = (index: number) => {
    const { targetZones } = this.state;
    if (targetZones.length > 1) {
      this.setState({ targetZones: targetZones.filter((_, i) => i !== index) });
    }
  };

  private updateTargetZone = (index: number, value: string) => {
    const { targetZones } = this.state;
    const updated = [...targetZones];
    updated[index] = value;
    this.setState({ targetZones: updated });
  };

  private convert = () => {
    this.setState({ hasConverted: true }, () => {
      setTimeout(() => {
        this.resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    });
  };

  render() {
    const { fromZone, targetZones, inputTime, hasConverted } = this.state;
    const gradient = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)';
    const [hours, minutes] = inputTime.split(':').map(Number);
    const fromTz = TIMEZONES.find(tz => tz.id === fromZone);
    const fromOffset = fromTz?.offset || 0;

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '700px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '700px' }}><AdBanner slot={ADS_CONFIG.slots.zoneTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '700px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}><ZoneIcon size={80} /></div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>ZONE</h1>
            <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', color: 'rgba(255,255,255,0.8)', marginTop: '0.25rem' }}>Time Zone Converter 🌐</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '700px' }}>
            <DisclaimerBanner title="Time Zone Notice" message="Daylight saving time may affect actual times. This tool uses standard UTC offsets for approximate conversions." color="#3b82f6" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '700px' }}>

          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Source timezone */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', textAlign: 'left', fontWeight: 600 }}>
                🌍 From Timezone
              </label>
              <select
                value={fromZone}
                onChange={(e) => this.setState({ fromZone: e.target.value })}
                style={inputStyles.select}
              >
                <optgroup label="UTC Offsets">
                  {TIMEZONES.filter(tz => tz.id.startsWith('UTC')).map(tz => (
                    <option key={tz.id} value={tz.id}>{tz.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Major Cities">
                  {TIMEZONES.filter(tz => !tz.id.startsWith('UTC')).map(tz => (
                    <option key={tz.id} value={tz.id}>{tz.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Time input */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', textAlign: 'left', fontWeight: 600 }}>
                🕐 Time
              </label>
              <input
                type="time"
                value={inputTime}
                onChange={(e) => this.setState({ inputTime: e.target.value })}
                style={inputStyles.dateTimeInput}
              />
            </div>

            {/* Target timezones */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', textAlign: 'left', fontWeight: 600 }}>
                🎯 Convert To (multiple)
              </label>
              {targetZones.map((tz, index) => (
                <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <select
                    value={tz}
                    onChange={(e) => this.updateTargetZone(index, e.target.value)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      fontSize: '0.95rem',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(30,30,50,0.9)',
                      color: '#fff',
                      minWidth: 0,
                      cursor: 'pointer'
                    }}
                  >
                    <optgroup label="UTC Offsets">
                      {TIMEZONES.filter(t => t.id.startsWith('UTC')).map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Major Cities">
                      {TIMEZONES.filter(t => !t.id.startsWith('UTC')).map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </optgroup>
                  </select>
                  {targetZones.length > 1 && (
                    <button
                      onClick={() => this.removeTargetZone(index)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: 'rgba(239,68,68,0.3)',
                        border: 'none',
                        borderRadius: '10px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '1rem'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={this.addTargetZone}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 1rem',
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px dashed rgba(255,255,255,0.3)',
                  borderRadius: '10px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                + Add Another Timezone
              </button>
            </div>

            <button onClick={this.convert}
              style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', marginTop: '1rem' }}>
              Convert Time 🌐
            </button>
          </div>
          </View>

          {hasConverted && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '700px' }}>
              <AdBanner slot={ADS_CONFIG.slots.zoneResults} format="horizontal" />
            </View>
          )}

          {hasConverted && (
            <div ref={this.resultsRef} id="zone-results" style={{ width: '100%', maxWidth: '700px', background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.3) 0%, rgba(29, 78, 216, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)' }}>
              <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem', textAlign: 'center' }}>📍 {inputTime} in {fromTz?.city || fromZone}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {targetZones.map((tzId, index) => {
                  const tz = TIMEZONES.find(t => t.id === tzId);
                  if (!tz) return null;
                  const convertedTime = this.convertTime(fromOffset, tz.offset, hours, minutes);
                  const offsetDiff = tz.offset - fromOffset;
                  const offsetStr = offsetDiff >= 0 ? `+${offsetDiff}h` : `${offsetDiff}h`;
                  return (
                    <div key={index} style={{ background: gradient, borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>{tz.city}</div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>{tz.id.startsWith('UTC') ? tz.id : tz.label.split('(')[1]?.replace(')', '') || ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.5rem' }}>{convertedTime}</div>
                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{offsetStr} from source</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '700px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.zoneFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
      </View>
    );
  }
}


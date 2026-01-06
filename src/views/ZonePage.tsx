'use client';

import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { ZoneIcon } from '../components/ZoneIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { inputStyles } from '../styles/inputStyles';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { Footer } from '../components/Footer';
import { ShareResults } from '../components/ShareResults';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';
import { TimeFormat, MeasurementSystem } from '../types/preferences';
import {
  TIMEZONES,
  TimezoneInfo,
  WeatherData,
  convertTime,
  getWeatherIcon,
  getTimezoneInfo,
  getTimezoneOffset,
  fetchWeatherForTimezone,
} from '../utils/ZoneCalculator';

interface ZonePageState {
  fromZone: string;
  targetZones: string[];
  inputTime: string;
  hasConverted: boolean;
  weatherData: Record<string, WeatherData>;
}

interface ZonePageProps {
  timeFormat?: TimeFormat;
  measurementSystem?: MeasurementSystem;
}

class ZonePageClass extends Component<ZonePageProps, ZonePageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: ZonePageProps) {
    super(props);
    // Use fixed time for SSR, will be updated in componentDidMount
    this.state = {
      fromZone: 'UTC',
      targetZones: ['America/New_York', 'Europe/London', 'Asia/Tokyo'],
      inputTime: '12:00',
      hasConverted: false,
      weatherData: {}
    };
  }

  componentDidMount() {
    applySEO('zone');
    // Set current time on client side to avoid hydration mismatch
    const now = new Date();
    this.setState({
      inputTime: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    });
    // Fetch weather for default target zones
    this.fetchWeatherForZones(this.state.targetZones);
  }

  private fetchWeatherForZones = async (zoneIds: string[]) => {
    const newWeatherData: Record<string, WeatherData> = { ...this.state.weatherData };

    for (const zoneId of zoneIds) {
      if (newWeatherData[zoneId]) continue; // Already fetched

      // Use shared fetchWeatherForTimezone from ZoneCalculator
      const weather = await fetchWeatherForTimezone(zoneId);
      if (weather) {
        newWeatherData[zoneId] = weather;
      }
    }

    this.setState({ weatherData: newWeatherData });
  };

  private formatTimeValue = (hours: number, minutes: number): string => {
    const { timeFormat } = this.props;
    if (timeFormat === '12h') {
      const period = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours % 12 || 12;
      return `${h12}:${minutes.toString().padStart(2, '0')} ${period}`;
    }
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  private convertTimeLocal = (fromOffset: number, toOffset: number, hours: number, minutes: number) => {
    // Use shared convertTime from ZoneCalculator
    const result = convertTime(fromOffset, toOffset, hours, minutes);
    const dayChangeStr = result.dayChange ? ` (${result.dayChange})` : '';
    return `${this.formatTimeValue(result.newHours, result.newMinutes)}${dayChangeStr}`;
  };

  private formatTemperature = (tempC: number): string => {
    const { measurementSystem } = this.props;
    if (measurementSystem === 'imperial') {
      const tempF = Math.round(tempC * 9 / 5 + 32);
      return `${tempF}°F`;
    }
    return `${tempC}°C`;
  };

  private addTargetZone = () => {
    const { targetZones } = this.state;
    const availableZones = TIMEZONES.filter(tz => !targetZones.includes(tz.id) && tz.id !== this.state.fromZone);
    if (availableZones.length > 0) {
      const newZoneId = availableZones[0].id;
      this.setState({ targetZones: [...targetZones, newZoneId] });
      this.fetchWeatherForZones([newZoneId]);
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
    this.fetchWeatherForZones([value]);
  };

  private convert = () => {
    this.setState({ hasConverted: true }, () => {
      // Fetch weather for all target zones when converting
      this.fetchWeatherForZones(this.state.targetZones);
      setTimeout(() => {
        this.resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    });
  };

  private reset = () => {
    const now = new Date();
    this.setState({
      fromZone: 'UTC',
      targetZones: ['America/New_York', 'Europe/London', 'Asia/Tokyo'],
      inputTime: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
      hasConverted: false,
      weatherData: {}
    });
  };

  render() {
    const { fromZone, targetZones, inputTime, hasConverted } = this.state;
    const gradient = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)';
    const [hours, minutes] = inputTime.split(':').map(Number);
    const fromTz = getTimezoneInfo(fromZone);
    const fromOffset = getTimezoneOffset(fromZone);

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '44rem' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '44rem' }}><AdBanner slot={ADS_CONFIG.slots.zoneTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '44rem', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}><ZoneIcon size={80} /></div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>ZONE</h1>
            <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', color: 'rgba(255,255,255,0.8)', marginTop: '0.25rem' }}>Time Zone Converter 🌐</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '44rem' }}>
            <DisclaimerBanner title="Time Zone Notice" message="Daylight saving time may affect actual times. This tool uses standard UTC offsets for approximate conversions." color="#3b82f6" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '44rem' }}>

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
                      padding: '0.75rem 2rem 0.75rem 0.75rem',
                      fontSize: '0.95rem',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(30,30,50,0.9)',
                      color: '#fff',
                      minWidth: 0,
                      cursor: 'pointer',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23fff' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.75rem center',
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

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button onClick={this.convert}
                style={{ flex: 1, padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                Convert Time 🌐
              </button>
              <button onClick={this.reset}
                style={{ padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '12px', cursor: 'pointer' }}>
                🔄
              </button>
            </div>
          </div>
          </View>

          {hasConverted && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '44rem' }}>
              <AdBanner slot={ADS_CONFIG.slots.zoneResults} format="horizontal" />
            </View>
          )}

          {hasConverted && (
            <>
              <div ref={this.resultsRef} id="zone-results" style={{ width: '100%', maxWidth: '44rem', background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.3) 0%, rgba(29, 78, 216, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)' }}>
                <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem', textAlign: 'center' }}>📍 {inputTime} in {fromTz?.city || fromZone}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {targetZones.map((tzId, index) => {
                    const tz = getTimezoneInfo(tzId);
                    if (!tz) return null;
                    const convertedTime = this.convertTimeLocal(fromOffset, tz.offset, hours, minutes);
                    const offsetDiff = tz.offset - fromOffset;
                    const offsetStr = offsetDiff >= 0 ? `+${offsetDiff}h` : `${offsetDiff}h`;
                    const weather = this.state.weatherData[tzId];
                    return (
                      <div key={index} style={{ background: gradient, borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                          <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>{tz.city}</div>
                          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>{tz.id.startsWith('UTC') ? tz.id : tz.label.split('(')[1]?.replace(')', '') || ''}</div>
                        </div>
                        {weather && (
                          <div style={{ textAlign: 'center', padding: '0 0.75rem' }}>
                            <div style={{ fontSize: '1.5rem' }}>{weather.icon}</div>
                            <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>{this.formatTemperature(weather.temp)}</div>
                          </div>
                        )}
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.5rem' }}>{convertedTime}</div>
                          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{offsetStr} from source</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <ShareResults
                  targetRef={this.resultsRef}
                  title="Timezone Converter - Tulzo"
                  text={`${inputTime} in ${fromTz?.city || fromZone} converted to ${targetZones.length} timezone(s) 🌍`}
                />
              </div>
            </>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '44rem', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.zoneFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
      </View>
    );
  }
}

// Wrapper functional component to inject preferences
import { usePreferences } from '../contexts/PreferencesContext';

export const ZonePage: React.FC = () => {
  const { preferences } = usePreferences();
  return (
    <ZonePageClass
      timeFormat={preferences.timeFormat}
      measurementSystem={preferences.measurementSystem}
    />
  );
};


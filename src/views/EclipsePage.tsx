'use client';

import { Component, createRef, RefObject } from 'react';
import { View } from '@adobe/react-spectrum';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { ShareResults } from '../components/ShareResults';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';
import {
  EclipseCalculator,
  EclipseData,
  EclipseFilter,
  ECLIPSE_DATA
} from '../utils/EclipseCalculator';

interface EclipsePageState {
  location: { lat: number; lon: number } | null;
  locationName: string;
  loading: boolean;
  filter: 'all' | 'solar' | 'lunar';
  mounted: boolean;
}

export class EclipsePage extends Component<object, EclipsePageState> {
  private resultRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: object) {
    super(props);
    this.state = {
      location: null,
      locationName: 'Detecting location...',
      loading: true,
      filter: 'all',
      mounted: false,
    };
  }

  componentDidMount() {
    applySEO('eclipse');
    this.setState({ mounted: true });
    this.detectLocation();
  }

  private detectLocation = async () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          this.setState({ location: { lat, lon } });
          await this.reverseGeocode(lat, lon);
        },
        async () => {
          await this.fetchLocationByIP();
        },
        { timeout: 5000 }
      );
    } else {
      await this.fetchLocationByIP();
    }
  };

  private fetchLocationByIP = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      this.setState({
        location: { lat: data.latitude, lon: data.longitude },
        locationName: `${data.city || 'Unknown'}, ${data.country_name || ''}`,
        loading: false,
      });
    } catch {
      this.setState({ locationName: 'Location unavailable', loading: false });
    }
  };

  private reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      const data = await res.json();
      const city = data.city || data.locality || 'Your Location';
      const country = data.countryName || '';
      this.setState({ locationName: country ? `${city}, ${country}` : city, loading: false });
    } catch {
      this.setState({ locationName: 'Your Location', loading: false });
    }
  };

  private getUpcomingEclipses = (): EclipseData[] => {
    const { filter } = this.state;
    const eclipseFilter: EclipseFilter = filter === 'all' ? 'any' : filter;
    return EclipseCalculator.getUpcomingEclipses(eclipseFilter, 10);
  };

  private getCountdown = (dateStr: string, timeStr: string): { days: number; hours: number; mins: number } => {
    const result = EclipseCalculator.getCountdown(dateStr, timeStr);
    return { days: result.days, hours: result.hours, mins: result.minutes };
  };

  private getVisibilityScore = (eclipse: EclipseData): { visible: boolean; score: string; regions: string[] } => {
    const { location } = this.state;
    const eclipseLocation = location ? { latitude: location.lat, longitude: location.lon } : null;
    return EclipseCalculator.getVisibilityScore(eclipse, eclipseLocation);
  };

  private formatDate = (dateStr: string): string => {
    return EclipseCalculator.formatDate(dateStr);
  };

  private getEclipseIcon = (type: string, subtype: string): string => {
    return EclipseCalculator.getEclipseIcon(type as EclipseData['type'], subtype as EclipseData['subtype']);
  };

  private getBestVisibleLocation = (eclipse: EclipseData): string => {
    return EclipseCalculator.getBestVisibleLocation(eclipse);
  };

  private getSubtypeLabel = (subtype: string): string => {
    return EclipseCalculator.getSubtypeLabel(subtype as EclipseData['subtype']);
  };

  render() {
    const { locationName, loading, filter, mounted } = this.state;
    const gradient = 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)';
    const eclipses = this.getUpcomingEclipses();
    const nextEclipse = eclipses[0];

    if (!mounted) {
      return (
        <View UNSAFE_style={{ minHeight: '100vh', background: '#0f172a', padding: '2rem 1rem' }}>
          <div style={{ maxWidth: '56rem', margin: '0 auto', textAlign: 'center', color: '#fff' }}>
            Loading...
          </div>
        </View>
      );
    }

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: '#0f172a', position: 'relative' }}>
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
        <View UNSAFE_style={{ maxWidth: '56rem', margin: '0 auto', padding: '2rem 1rem' }}>
          <BackToTools />

          {/* Header */}
          <View UNSAFE_style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              fontSize: '4rem',
              marginBottom: '1rem',
              filter: 'drop-shadow(0 0 20px rgba(139, 92, 246, 0.5))',
            }}>
              🌑
            </div>
            <h1 style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              fontWeight: 800,
              background: gradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: '0 0 0.5rem',
            }}>
              ECLIPSE
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem' }}>
              Solar & Lunar Eclipse Finder
            </p>
          </View>

          {/* Top Ad */}
          <AdBanner slot={ADS_CONFIG.slots.eclipseTop} format="horizontal" />

          {/* Location Display */}
          <div style={{
            background: 'rgba(139, 92, 246, 0.1)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '16px',
            padding: '1rem 1.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
          }}>
            <span style={{ fontSize: '1.5rem' }}>📍</span>
            <span style={{ color: '#fff', fontSize: '1.1rem' }}>
              {loading ? 'Detecting location...' : locationName}
            </span>
          </div>

          {/* Filter Tabs */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: '🌓 All Eclipses' },
              { id: 'solar', label: '☀️ Solar' },
              { id: 'lunar', label: '🌙 Lunar' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => this.setState({ filter: f.id as 'all' | 'solar' | 'lunar' })}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: filter === f.id ? gradient : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Next Eclipse Highlight */}
          {nextEclipse && (
            <>
            <div ref={this.resultRef} style={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(79, 70, 229, 0.2) 100%)',
              border: '2px solid rgba(139, 92, 246, 0.4)',
              borderRadius: '24px',
              padding: '2rem',
              marginBottom: '2rem',
              textAlign: 'center',
            }}>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '2px' }}>
                Next {nextEclipse.type === 'solar' ? 'Solar' : 'Lunar'} Eclipse
              </p>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
                {this.getEclipseIcon(nextEclipse.type, nextEclipse.subtype)}
              </div>
              <h2 style={{ color: '#fff', fontSize: '1.8rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                {this.getSubtypeLabel(nextEclipse.subtype)} {nextEclipse.type === 'solar' ? 'Solar' : 'Lunar'} Eclipse
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.2rem', marginBottom: '1.5rem' }}>
                {this.formatDate(nextEclipse.date)}
              </p>

              {/* Countdown */}
              {(() => {
                const countdown = this.getCountdown(nextEclipse.date, nextEclipse.peakTime);
                return (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    {[
                      { value: countdown.days, label: 'Days' },
                      { value: countdown.hours, label: 'Hours' },
                      { value: countdown.mins, label: 'Mins' },
                    ].map(item => (
                      <div key={item.label} style={{
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '12px',
                        padding: '1rem 1.5rem',
                        minWidth: '80px',
                      }}>
                        <div style={{ color: '#a78bfa', fontSize: '2rem', fontWeight: 800, fontFamily: 'monospace' }}>
                          {item.value}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                          {item.label}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Visibility */}
              {(() => {
                const vis = this.getVisibilityScore(nextEclipse);
                const bestLocation = this.getBestVisibleLocation(nextEclipse);
                return (
                  <div style={{
                    background: vis.visible ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    border: `1px solid ${vis.visible ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                    borderRadius: '12px',
                    padding: '1rem',
                    marginBottom: '1rem',
                  }}>
                    <span style={{ fontSize: '1.2rem', marginRight: '0.5rem' }}>{vis.visible ? '✅' : '❌'}</span>
                    <span style={{ color: '#fff', fontWeight: 600 }}>{vis.score}</span>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                      🌍 Best visible from: <strong style={{ color: '#a78bfa' }}>{bestLocation}</strong>
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      Also visible: {vis.regions.join(', ')}
                    </p>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>
                <span>🕐 Peak: {nextEclipse.peakTime} UTC</span>
                {nextEclipse.duration && <span>⏱️ Duration: {nextEclipse.duration}</span>}
                <span>📊 Magnitude: {nextEclipse.magnitude.toFixed(3)}</span>
              </div>
            </div>
            <div style={{ marginTop: '1rem', marginBottom: '2rem', textAlign: 'center' }}>
              <ShareResults
                targetRef={this.resultRef}
                title="Eclipse Finder - Tulzo"
                text={`Next eclipse: ${this.getSubtypeLabel(nextEclipse.subtype)} ${nextEclipse.type} eclipse on ${this.formatDate(nextEclipse.date)}! 🌑`}
              />
            </div>
          </>
          )}

          {/* Upcoming Eclipses List */}
          <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', textAlign: 'center' }}>
            📅 Upcoming Eclipses
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {eclipses.slice(1).map((eclipse, idx) => {
              const vis = this.getVisibilityScore(eclipse);
              const countdown = this.getCountdown(eclipse.date, eclipse.peakTime);
              const bestLocation = this.getBestVisibleLocation(eclipse);
              return (
                <div key={idx} style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ fontSize: '2.5rem' }}>
                    {this.getEclipseIcon(eclipse.type, eclipse.subtype)}
                  </div>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <h4 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                      {this.getSubtypeLabel(eclipse.subtype)} {eclipse.type === 'solar' ? 'Solar' : 'Lunar'} Eclipse
                    </h4>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', margin: '0.25rem 0' }}>
                      {this.formatDate(eclipse.date)}
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                      <span>🕐 {eclipse.peakTime} UTC</span>
                      {eclipse.duration && <span>⏱️ {eclipse.duration}</span>}
                      <span>🌍 {bestLocation}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '120px' }}>
                    <div style={{
                      background: vis.visible ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                      color: vis.visible ? '#4ade80' : '#f87171',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      marginBottom: '0.5rem',
                    }}>
                      {vis.visible ? '✓ Visible' : '✗ Not visible'}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                      in {countdown.days}d {countdown.hours}h
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {eclipses.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.5)' }}>
              No upcoming eclipses found for the selected filter.
            </div>
          )}

          {/* Info Section */}
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '16px',
            padding: '1.5rem',
            marginTop: '2rem',
          }}>
            <h3 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem' }}>
              🔭 About Eclipses
            </h3>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
              <div>
                <h4 style={{ color: '#fbbf24', fontSize: '1rem', marginBottom: '0.5rem' }}>☀️ Solar Eclipses</h4>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  <strong>Total:</strong> Moon completely covers the Sun<br />
                  <strong>Annular:</strong> Moon covers center, leaving a ring<br />
                  <strong>Partial:</strong> Moon partially covers the Sun
                </p>
              </div>
              <div>
                <h4 style={{ color: '#a78bfa', fontSize: '1rem', marginBottom: '0.5rem' }}>🌙 Lunar Eclipses</h4>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  <strong>Total:</strong> Moon fully in Earth&apos;s shadow (Blood Moon)<br />
                  <strong>Partial:</strong> Part of Moon in umbra<br />
                  <strong>Penumbral:</strong> Moon in Earth&apos;s penumbra
                </p>
              </div>
            </div>
          </div>

          <View UNSAFE_style={{ marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.eclipseFooter} format="horizontal" />
          </View>

          <Footer />
        </View>
      </View>
    );
  }
}

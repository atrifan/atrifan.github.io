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

// Eclipse data from NASA - verified upcoming eclipses 2024-2030
interface EclipseData {
  date: string; // ISO date
  type: 'solar' | 'lunar';
  subtype: 'total' | 'partial' | 'annular' | 'penumbral' | 'hybrid';
  peakTime: string; // UTC time HH:MM
  duration?: string; // Duration of totality/maximum
  visibility: string[]; // Regions where visible
  coordinates: { lat: number; lon: number }; // Greatest eclipse point
  magnitude: number; // Eclipse magnitude (0-1+)
}

// NASA Eclipse data 2024-2030
const ECLIPSE_DATA: EclipseData[] = [
  // 2025
  { date: '2025-03-14', type: 'lunar', subtype: 'total', peakTime: '06:58', duration: '1h 05m', visibility: ['Americas', 'Europe', 'Africa', 'Pacific'], coordinates: { lat: -3, lon: -95 }, magnitude: 1.178 },
  { date: '2025-03-29', type: 'solar', subtype: 'partial', peakTime: '10:47', visibility: ['Northwest Africa', 'Europe', 'Northern Russia'], coordinates: { lat: 64, lon: -20 }, magnitude: 0.938 },
  { date: '2025-09-07', type: 'lunar', subtype: 'total', peakTime: '18:11', duration: '1h 22m', visibility: ['Europe', 'Africa', 'Asia', 'Australia'], coordinates: { lat: 3, lon: 82 }, magnitude: 1.362 },
  { date: '2025-09-21', type: 'solar', subtype: 'partial', peakTime: '19:42', visibility: ['South Pacific', 'New Zealand', 'Antarctica'], coordinates: { lat: -66, lon: -125 }, magnitude: 0.855 },
  // 2026
  { date: '2026-02-17', type: 'solar', subtype: 'annular', peakTime: '12:13', visibility: ['Antarctica', 'Southern Argentina', 'Chile'], coordinates: { lat: -65, lon: -30 }, magnitude: 0.963 },
  { date: '2026-03-03', type: 'lunar', subtype: 'total', peakTime: '11:33', duration: '58m', visibility: ['East Asia', 'Australia', 'Pacific', 'Americas'], coordinates: { lat: 7, lon: 170 }, magnitude: 1.151 },
  { date: '2026-08-12', type: 'solar', subtype: 'total', peakTime: '17:46', duration: '2m 18s', visibility: ['Arctic', 'Greenland', 'Iceland', 'Spain', 'Portugal'], coordinates: { lat: 65, lon: -25 }, magnitude: 1.039 },
  { date: '2026-08-28', type: 'lunar', subtype: 'partial', peakTime: '04:13', visibility: ['Americas', 'Europe', 'Africa'], coordinates: { lat: -10, lon: -60 }, magnitude: 0.930 },
  // 2027
  { date: '2027-02-06', type: 'solar', subtype: 'annular', peakTime: '16:00', visibility: ['South America', 'Antarctica', 'South Atlantic'], coordinates: { lat: -55, lon: -45 }, magnitude: 0.928 },
  { date: '2027-02-20', type: 'lunar', subtype: 'penumbral', peakTime: '23:13', visibility: ['Americas', 'Europe', 'Africa'], coordinates: { lat: 12, lon: -15 }, magnitude: 0.963 },
  { date: '2027-07-18', type: 'lunar', subtype: 'penumbral', peakTime: '16:03', visibility: ['Asia', 'Australia', 'Pacific'], coordinates: { lat: -22, lon: 130 }, magnitude: 0.713 },
  { date: '2027-08-02', type: 'solar', subtype: 'total', peakTime: '10:07', duration: '6m 23s', visibility: ['Morocco', 'Spain', 'Algeria', 'Libya', 'Egypt', 'Saudi Arabia', 'Yemen', 'Somalia'], coordinates: { lat: 25, lon: 33 }, magnitude: 1.079 },
  // 2028
  { date: '2028-01-12', type: 'lunar', subtype: 'partial', peakTime: '04:13', visibility: ['Americas', 'Europe', 'Africa'], coordinates: { lat: 20, lon: -60 }, magnitude: 0.066 },
  { date: '2028-01-26', type: 'solar', subtype: 'annular', peakTime: '15:08', visibility: ['South America', 'Antarctica'], coordinates: { lat: -75, lon: -70 }, magnitude: 0.921 },
  { date: '2028-07-06', type: 'lunar', subtype: 'partial', peakTime: '18:19', visibility: ['Europe', 'Africa', 'Asia', 'Australia'], coordinates: { lat: -24, lon: 95 }, magnitude: 0.388 },
  { date: '2028-07-22', type: 'solar', subtype: 'total', peakTime: '02:55', duration: '5m 10s', visibility: ['Australia', 'New Zealand', 'South Pacific'], coordinates: { lat: -25, lon: 175 }, magnitude: 1.056 },
  // 2029
  { date: '2029-01-01', type: 'lunar', subtype: 'total', peakTime: '22:23', duration: '1h 11m', visibility: ['Europe', 'Africa', 'Asia', 'Americas'], coordinates: { lat: 23, lon: -25 }, magnitude: 1.245 },
  { date: '2029-01-14', type: 'solar', subtype: 'partial', peakTime: '17:13', visibility: ['North America', 'Central America'], coordinates: { lat: 55, lon: -120 }, magnitude: 0.871 },
  { date: '2029-06-26', type: 'lunar', subtype: 'total', peakTime: '03:22', duration: '1h 42m', visibility: ['Americas', 'Europe', 'Africa'], coordinates: { lat: -23, lon: -45 }, magnitude: 1.844 },
  { date: '2029-07-11', type: 'solar', subtype: 'partial', peakTime: '15:36', visibility: ['South America', 'Antarctica'], coordinates: { lat: -68, lon: -80 }, magnitude: 0.230 },
  { date: '2029-12-20', type: 'lunar', subtype: 'total', peakTime: '22:42', duration: '53m', visibility: ['Americas', 'Europe', 'Africa', 'Asia'], coordinates: { lat: 23, lon: -30 }, magnitude: 1.117 },
  // 2030
  { date: '2030-06-01', type: 'solar', subtype: 'annular', peakTime: '06:29', visibility: ['Algeria', 'Tunisia', 'Greece', 'Turkey', 'Russia', 'China', 'Japan'], coordinates: { lat: 45, lon: 75 }, magnitude: 0.944 },
  { date: '2030-06-15', type: 'lunar', subtype: 'partial', peakTime: '18:33', visibility: ['Europe', 'Africa', 'Asia', 'Australia'], coordinates: { lat: -23, lon: 100 }, magnitude: 0.502 },
  { date: '2030-11-25', type: 'solar', subtype: 'total', peakTime: '06:51', duration: '3m 44s', visibility: ['Southern Africa', 'Indian Ocean', 'Australia'], coordinates: { lat: -44, lon: 72 }, magnitude: 1.047 },
  { date: '2030-12-09', type: 'lunar', subtype: 'penumbral', peakTime: '22:27', visibility: ['Americas', 'Europe', 'Africa', 'Asia'], coordinates: { lat: 23, lon: -30 }, magnitude: 0.972 },
];

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
    const now = new Date();
    const { filter } = this.state;
    return ECLIPSE_DATA
      .filter(e => new Date(e.date) > now)
      .filter(e => filter === 'all' || e.type === filter)
      .slice(0, 10);
  };

  private getCountdown = (dateStr: string, timeStr: string): { days: number; hours: number; mins: number } => {
    const [hours, mins] = timeStr.split(':').map(Number);
    const eclipseDate = new Date(dateStr);
    eclipseDate.setUTCHours(hours, mins, 0, 0);
    const now = new Date();
    const diff = eclipseDate.getTime() - now.getTime();
    if (diff <= 0) return { days: 0, hours: 0, mins: 0 };
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hoursLeft = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minsLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return { days, hours: hoursLeft, mins: minsLeft };
  };

  private getVisibilityScore = (eclipse: EclipseData): { visible: boolean; score: string; regions: string[] } => {
    const { location } = this.state;
    if (!location) return { visible: false, score: 'Unknown', regions: eclipse.visibility };

    // Simple visibility check based on regions and distance
    const { lat, lon } = location;
    const regionMap: Record<string, { latRange: [number, number]; lonRange: [number, number] }> = {
      'Americas': { latRange: [-60, 70], lonRange: [-170, -30] },
      'North America': { latRange: [15, 70], lonRange: [-170, -50] },
      'South America': { latRange: [-60, 15], lonRange: [-90, -30] },
      'Central America': { latRange: [5, 25], lonRange: [-120, -60] },
      'Europe': { latRange: [35, 72], lonRange: [-25, 60] },
      'Africa': { latRange: [-35, 37], lonRange: [-20, 55] },
      'Asia': { latRange: [0, 75], lonRange: [25, 180] },
      'Australia': { latRange: [-50, -10], lonRange: [110, 180] },
      'Pacific': { latRange: [-50, 50], lonRange: [140, -100] },
      'Antarctica': { latRange: [-90, -60], lonRange: [-180, 180] },
      'Arctic': { latRange: [65, 90], lonRange: [-180, 180] },
    };

    let bestMatch = false;
    for (const region of eclipse.visibility) {
      const bounds = regionMap[region];
      if (bounds) {
        const inLat = lat >= bounds.latRange[0] && lat <= bounds.latRange[1];
        let inLon = lon >= bounds.lonRange[0] && lon <= bounds.lonRange[1];
        // Handle Pacific wrap-around
        if (region === 'Pacific' && bounds.lonRange[0] > bounds.lonRange[1]) {
          inLon = lon >= bounds.lonRange[0] || lon <= bounds.lonRange[1];
        }
        if (inLat && inLon) {
          bestMatch = true;
          break;
        }
      }
    }

    // Calculate distance to greatest eclipse point
    const dist = Math.sqrt(Math.pow(lat - eclipse.coordinates.lat, 2) + Math.pow(lon - eclipse.coordinates.lon, 2));
    let score = 'Not visible';
    if (bestMatch) {
      if (dist < 20) score = 'Excellent visibility';
      else if (dist < 40) score = 'Good visibility';
      else if (dist < 60) score = 'Partial visibility';
      else score = 'Low visibility';
    }

    return { visible: bestMatch, score, regions: eclipse.visibility };
  };

  private formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  private getEclipseIcon = (type: string, subtype: string): string => {
    if (type === 'solar') {
      if (subtype === 'total') return '🌑';
      if (subtype === 'annular') return '🔆'; // Ring of fire
      return '🌘';
    } else {
      if (subtype === 'total') return '🌕';
      if (subtype === 'penumbral') return '🌖';
      return '🌗';
    }
  };

  private getBestVisibleLocation = (eclipse: EclipseData): string => {
    // Map coordinates to approximate location names
    const { lat, lon } = eclipse.coordinates;

    // Determine region based on coordinates
    let location = '';

    // Latitude-based region
    if (lat > 60) location = 'Arctic region';
    else if (lat > 35) {
      if (lon >= -130 && lon <= -60) location = 'North America';
      else if (lon >= -25 && lon <= 60) location = 'Europe';
      else if (lon >= 60 && lon <= 150) location = 'Northern Asia';
      else location = 'Northern Pacific';
    } else if (lat > 0) {
      if (lon >= -130 && lon <= -30) location = 'Central America / Caribbean';
      else if (lon >= -20 && lon <= 55) location = 'North Africa / Middle East';
      else if (lon >= 55 && lon <= 150) location = 'South Asia / Southeast Asia';
      else location = 'Pacific Ocean';
    } else if (lat > -35) {
      if (lon >= -90 && lon <= -30) location = 'South America';
      else if (lon >= -20 && lon <= 55) location = 'Central/Southern Africa';
      else if (lon >= 100 && lon <= 180) location = 'Australia / Indonesia';
      else location = 'Indian Ocean';
    } else if (lat > -60) {
      if (lon >= -90 && lon <= -30) location = 'Southern South America';
      else if (lon >= 100 && lon <= 180) location = 'Southern Australia / New Zealand';
      else location = 'Southern Ocean';
    } else {
      location = 'Antarctica';
    }

    return location;
  };

  private getSubtypeLabel = (subtype: string): string => {
    const labels: Record<string, string> = {
      total: 'Total',
      partial: 'Partial',
      annular: 'Annular',
      penumbral: 'Penumbral',
      hybrid: 'Hybrid',
    };
    return labels[subtype] || subtype;
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

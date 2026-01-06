/**
 * EclipseCalculator - Shared eclipse calculation logic for MCP and UI
 */

// Eclipse types as enum
export type EclipseType = 'solar' | 'lunar';
export type EclipseSubtype = 'total' | 'partial' | 'annular' | 'penumbral' | 'hybrid';
export type EclipseFilter = 'solar' | 'lunar' | 'any';

// Eclipse data structure
export interface EclipseData {
  date: string; // ISO date YYYY-MM-DD
  type: EclipseType;
  subtype: EclipseSubtype;
  peakTime: string; // UTC time HH:MM
  duration?: string; // Duration of totality/maximum
  visibility: string[]; // Regions where visible
  coordinates: { lat: number; lon: number }; // Greatest eclipse point
  magnitude: number; // Eclipse magnitude (0-1+)
}

// Location input
export interface EclipseLocation {
  latitude: number;
  longitude: number;
}

// Visibility result
export interface VisibilityResult {
  visible: boolean;
  score: 'Excellent visibility' | 'Good visibility' | 'Partial visibility' | 'Low visibility' | 'Not visible' | 'Unknown';
  regions: string[];
}

// Single eclipse result
export interface EclipseResult {
  date: string;
  type: EclipseType;
  subtype: EclipseSubtype;
  peakTimeUTC: string;
  duration: string | null;
  magnitude: number;
  bestVisibleFrom: string;
  visibleRegions: string[];
  daysUntil: number;
  visibleFromLocation: boolean | null;
  visibilityScore: string | null;
  coordinates: { lat: number; lon: number };
}

// List result
export interface EclipseListResult {
  eclipses: EclipseResult[];
  totalCount: number;
}

// NASA Eclipse data 2024-2030
export const ECLIPSE_DATA: EclipseData[] = [
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
  { date: '2027-08-02', type: 'solar', subtype: 'total', peakTime: '10:07', duration: '6m 23s', visibility: ['Morocco', 'Spain', 'Algeria', 'Libya', 'Egypt', 'Saudi Arabia'], coordinates: { lat: 25, lon: 33 }, magnitude: 1.079 },
  // 2028
  { date: '2028-01-12', type: 'lunar', subtype: 'partial', peakTime: '04:13', visibility: ['Americas', 'Europe', 'Africa'], coordinates: { lat: 20, lon: -60 }, magnitude: 0.066 },
  { date: '2028-07-22', type: 'solar', subtype: 'total', peakTime: '02:55', duration: '5m 10s', visibility: ['Australia', 'New Zealand', 'South Pacific'], coordinates: { lat: -25, lon: 175 }, magnitude: 1.056 },
  // 2029
  { date: '2029-01-01', type: 'lunar', subtype: 'total', peakTime: '22:23', duration: '1h 11m', visibility: ['Europe', 'Africa', 'Asia', 'Americas'], coordinates: { lat: 23, lon: -25 }, magnitude: 1.245 },
  { date: '2029-06-26', type: 'lunar', subtype: 'total', peakTime: '03:22', duration: '1h 42m', visibility: ['Americas', 'Europe', 'Africa'], coordinates: { lat: -23, lon: -45 }, magnitude: 1.844 },
  { date: '2029-12-20', type: 'lunar', subtype: 'total', peakTime: '22:42', duration: '53m', visibility: ['Americas', 'Europe', 'Africa', 'Asia'], coordinates: { lat: 23, lon: -30 }, magnitude: 1.117 },
  // 2030
  { date: '2030-06-01', type: 'solar', subtype: 'annular', peakTime: '06:29', visibility: ['Algeria', 'Tunisia', 'Greece', 'Turkey', 'Russia', 'China', 'Japan'], coordinates: { lat: 45, lon: 75 }, magnitude: 0.944 },
  { date: '2030-11-25', type: 'solar', subtype: 'total', peakTime: '06:51', duration: '3m 44s', visibility: ['Southern Africa', 'Indian Ocean', 'Australia'], coordinates: { lat: -44, lon: 72 }, magnitude: 1.047 },
  { date: '2030-12-09', type: 'lunar', subtype: 'penumbral', peakTime: '22:27', visibility: ['Americas', 'Europe', 'Africa', 'Asia'], coordinates: { lat: 23, lon: -30 }, magnitude: 0.972 },
];

// Region bounds for visibility calculation
const REGION_MAP: Record<string, { latRange: [number, number]; lonRange: [number, number] }> = {
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
  'Northwest Africa': { latRange: [20, 37], lonRange: [-20, 15] },
  'Northern Russia': { latRange: [55, 75], lonRange: [30, 180] },
  'South Pacific': { latRange: [-50, 0], lonRange: [140, -100] },
  'New Zealand': { latRange: [-50, -33], lonRange: [165, 180] },
  'Southern Argentina': { latRange: [-55, -38], lonRange: [-75, -60] },
  'Chile': { latRange: [-55, -17], lonRange: [-80, -66] },
  'East Asia': { latRange: [20, 55], lonRange: [100, 150] },
  'Greenland': { latRange: [59, 84], lonRange: [-73, -11] },
  'Iceland': { latRange: [63, 67], lonRange: [-25, -13] },
  'Spain': { latRange: [36, 44], lonRange: [-10, 5] },
  'Portugal': { latRange: [36, 42], lonRange: [-10, -6] },
  'South Atlantic': { latRange: [-60, 0], lonRange: [-70, 20] },
  'Morocco': { latRange: [27, 36], lonRange: [-13, -1] },
  'Algeria': { latRange: [19, 37], lonRange: [-9, 12] },
  'Libya': { latRange: [19, 34], lonRange: [9, 25] },
  'Egypt': { latRange: [22, 32], lonRange: [24, 37] },
  'Saudi Arabia': { latRange: [16, 32], lonRange: [34, 56] },
  'Indian Ocean': { latRange: [-40, 25], lonRange: [40, 110] },
  'Southern Africa': { latRange: [-35, -15], lonRange: [10, 55] },
  'Tunisia': { latRange: [30, 38], lonRange: [7, 12] },
  'Greece': { latRange: [34, 42], lonRange: [19, 30] },
  'Turkey': { latRange: [36, 42], lonRange: [26, 45] },
  'Russia': { latRange: [41, 82], lonRange: [19, 180] },
  'China': { latRange: [18, 54], lonRange: [73, 135] },
  'Japan': { latRange: [24, 46], lonRange: [122, 154] },
};

export class EclipseCalculator {
  /**
   * Get best visible location description from eclipse coordinates
   */
  static getBestVisibleLocation(eclipse: EclipseData): string {
    const { lat, lon } = eclipse.coordinates;
    if (lat > 60) return 'Arctic region';
    if (lat > 35) {
      if (lon >= -130 && lon <= -60) return 'North America';
      if (lon >= -25 && lon <= 60) return 'Europe';
      if (lon >= 60 && lon <= 150) return 'Northern Asia';
      return 'Northern Pacific';
    }
    if (lat > 0) {
      if (lon >= -130 && lon <= -30) return 'Central America / Caribbean';
      if (lon >= -20 && lon <= 55) return 'North Africa / Middle East';
      if (lon >= 55 && lon <= 150) return 'South Asia / Southeast Asia';
      return 'Pacific Ocean';
    }
    if (lat > -35) {
      if (lon >= -90 && lon <= -30) return 'South America';
      if (lon >= -20 && lon <= 55) return 'Central/Southern Africa';
      if (lon >= 100 && lon <= 180) return 'Australia / Indonesia';
      return 'Indian Ocean';
    }
    if (lat > -60) {
      if (lon >= -90 && lon <= -30) return 'Southern South America';
      if (lon >= 100 && lon <= 180) return 'Southern Australia / New Zealand';
      return 'Southern Ocean';
    }
    return 'Antarctica';
  }

  /**
   * Check if eclipse is visible from a specific location
   */
  static isVisibleFromLocation(eclipse: EclipseData, lat: number, lon: number): boolean {
    for (const region of eclipse.visibility) {
      const bounds = REGION_MAP[region];
      if (bounds) {
        const inLat = lat >= bounds.latRange[0] && lat <= bounds.latRange[1];
        let inLon = lon >= bounds.lonRange[0] && lon <= bounds.lonRange[1];
        // Handle Pacific wrap-around
        if (region === 'Pacific' || region === 'South Pacific') {
          if (bounds.lonRange[0] > bounds.lonRange[1]) {
            inLon = lon >= bounds.lonRange[0] || lon <= bounds.lonRange[1];
          }
        }
        if (inLat && inLon) return true;
      }
    }
    return false;
  }

  /**
   * Get detailed visibility score for a location
   */
  static getVisibilityScore(eclipse: EclipseData, location: EclipseLocation | null): VisibilityResult {
    if (!location) return { visible: false, score: 'Unknown', regions: eclipse.visibility };

    const { latitude: lat, longitude: lon } = location;
    const isVisible = this.isVisibleFromLocation(eclipse, lat, lon);

    if (!isVisible) {
      return { visible: false, score: 'Not visible', regions: eclipse.visibility };
    }

    // Calculate distance to greatest eclipse point
    const dist = Math.sqrt(
      Math.pow(lat - eclipse.coordinates.lat, 2) +
      Math.pow(lon - eclipse.coordinates.lon, 2)
    );

    let score: VisibilityResult['score'];
    if (dist < 20) score = 'Excellent visibility';
    else if (dist < 40) score = 'Good visibility';
    else if (dist < 60) score = 'Partial visibility';
    else score = 'Low visibility';

    return { visible: true, score, regions: eclipse.visibility };
  }

  /**
   * Get upcoming eclipses filtered by type
   */
  static getUpcomingEclipses(filter: EclipseFilter = 'any', count: number = 10): EclipseData[] {
    const now = new Date();
    return ECLIPSE_DATA
      .filter(e => new Date(e.date) > now)
      .filter(e => filter === 'any' || e.type === filter)
      .slice(0, count);
  }

  /**
   * Find the next eclipse with full details
   */
  static findNextEclipse(
    filter: EclipseFilter = 'any',
    location?: EclipseLocation
  ): EclipseResult | null {
    const upcoming = this.getUpcomingEclipses(filter, 1);
    if (upcoming.length === 0) return null;

    return this.toEclipseResult(upcoming[0], location);
  }

  /**
   * List upcoming eclipses with full details
   */
  static listUpcomingEclipses(
    filter: EclipseFilter = 'any',
    count: number = 10,
    location?: EclipseLocation
  ): EclipseListResult {
    const upcoming = this.getUpcomingEclipses(filter, count);
    const eclipses = upcoming.map(e => this.toEclipseResult(e, location));
    return { eclipses, totalCount: eclipses.length };
  }

  /**
   * Convert raw eclipse data to result format
   */
  static toEclipseResult(eclipse: EclipseData, location?: EclipseLocation): EclipseResult {
    const now = new Date();
    const eclipseDate = new Date(eclipse.date);
    const daysUntil = Math.ceil((eclipseDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const visibilityResult = location ? this.getVisibilityScore(eclipse, location) : null;

    return {
      date: eclipse.date,
      type: eclipse.type,
      subtype: eclipse.subtype,
      peakTimeUTC: eclipse.peakTime,
      duration: eclipse.duration || null,
      magnitude: eclipse.magnitude,
      bestVisibleFrom: this.getBestVisibleLocation(eclipse),
      visibleRegions: eclipse.visibility,
      daysUntil,
      visibleFromLocation: location ? this.isVisibleFromLocation(eclipse, location.latitude, location.longitude) : null,
      visibilityScore: visibilityResult?.score || null,
      coordinates: eclipse.coordinates,
    };
  }

  /**
   * Get countdown to eclipse
   */
  static getCountdown(dateStr: string, peakTime: string): { days: number; hours: number; minutes: number } {
    const [hours, minutes] = peakTime.split(':').map(Number);
    const eclipseDate = new Date(dateStr);
    eclipseDate.setUTCHours(hours, minutes, 0, 0);

    const now = new Date();
    const diff = eclipseDate.getTime() - now.getTime();

    if (diff <= 0) return { days: 0, hours: 0, minutes: 0 };

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const remainingHours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const remainingMinutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return { days, hours: remainingHours, minutes: remainingMinutes };
  }

  /**
   * Get eclipse icon based on type and subtype
   */
  static getEclipseIcon(type: EclipseType, subtype: EclipseSubtype): string {
    if (type === 'solar') {
      switch (subtype) {
        case 'total': return '🌑';
        case 'annular': return '🔆';
        case 'partial': return '🌘';
        case 'hybrid': return '🌗';
        default: return '☀️';
      }
    } else {
      switch (subtype) {
        case 'total': return '🌕';
        case 'partial': return '🌗';
        case 'penumbral': return '🌖';
        default: return '🌙';
      }
    }
  }

  /**
   * Get subtype label
   */
  static getSubtypeLabel(subtype: EclipseSubtype): string {
    return subtype.charAt(0).toUpperCase() + subtype.slice(1);
  }

  /**
   * Format date for display
   */
  static formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}


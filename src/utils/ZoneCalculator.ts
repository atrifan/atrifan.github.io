/**
 * Shared Zone Calculator
 * 
 * This is the SINGLE SOURCE OF TRUTH for timezone conversion logic.
 * Used by both the MCP API (/api/mcp) and the UI (ZonePage.tsx).
 * 
 * GUIDELINE FOR MODIFYING CALCULATOR FUNCTIONS:
 * 1. Ensure MCP tool definition (tools-definitions.ts) matches these parameters
 * 2. Ensure MCP execution (route.ts) calls this shared function
 * 3. Ensure UI component uses this same function
 * 4. Keep parameter names consistent across all three locations
 * 5. Update outputSchema in tools-definitions.ts if return type changes
 */

// ============ TYPES ============
export interface TimezoneInfo {
  id: string;
  label: string;
  city: string;
  offset: number;
  lat?: number;
  lon?: number;
}

export interface WeatherData {
  temp: number;
  icon: string;
  weatherCode?: number;
}

export interface ZoneConversion {
  timezone: string;
  city: string;
  time: string;
  offset: number;
  offsetDiff: number;
  dayChange: string;
  weather?: WeatherData;
}

// ============ INPUT/OUTPUT TYPES ============
export interface ZoneCalculatorInput {
  /** Time in HH:MM format (24-hour) */
  time: string;
  /** Source timezone ID */
  fromTimezone: string;
  /** Target timezone IDs */
  toTimezones: string[];
}

export interface ZoneCalculatorOutput {
  sourceTime: string;
  sourceTimezone: string;
  sourceCity: string;
  conversions: ZoneConversion[];
}

// ============ TIMEZONE DATA ============
export const TIMEZONES: TimezoneInfo[] = [
  // UTC Reference
  { id: 'UTC', label: 'UTC (Coordinated Universal Time)', city: 'UTC', offset: 0 },
  // Manual offsets
  { id: 'UTC-12', label: 'UTC-12:00', city: 'UTC-12', offset: -12 },
  { id: 'UTC-11', label: 'UTC-11:00', city: 'UTC-11', offset: -11 },
  { id: 'UTC-10', label: 'UTC-10:00 (Hawaii)', city: 'Hawaii', offset: -10, lat: 21.31, lon: -157.86 },
  { id: 'UTC-9', label: 'UTC-09:00 (Alaska)', city: 'Alaska', offset: -9, lat: 61.22, lon: -149.90 },
  { id: 'UTC-8', label: 'UTC-08:00 (Pacific)', city: 'Pacific', offset: -8, lat: 34.05, lon: -118.24 },
  { id: 'UTC-7', label: 'UTC-07:00 (Mountain)', city: 'Mountain', offset: -7, lat: 39.74, lon: -104.99 },
  { id: 'UTC-6', label: 'UTC-06:00 (Central)', city: 'Central', offset: -6, lat: 41.88, lon: -87.63 },
  { id: 'UTC-5', label: 'UTC-05:00 (Eastern)', city: 'Eastern', offset: -5, lat: 40.71, lon: -74.01 },
  { id: 'UTC-4', label: 'UTC-04:00 (Atlantic)', city: 'Atlantic', offset: -4 },
  { id: 'UTC-3', label: 'UTC-03:00 (Brazil)', city: 'Brazil', offset: -3, lat: -23.55, lon: -46.63 },
  { id: 'UTC-2', label: 'UTC-02:00', city: 'UTC-2', offset: -2 },
  { id: 'UTC-1', label: 'UTC-01:00', city: 'UTC-1', offset: -1 },
  { id: 'UTC+1', label: 'UTC+01:00 (CET)', city: 'CET', offset: 1, lat: 48.86, lon: 2.35 },
  { id: 'UTC+2', label: 'UTC+02:00 (EET)', city: 'EET', offset: 2, lat: 44.43, lon: 26.10 },
  { id: 'UTC+3', label: 'UTC+03:00 (Moscow)', city: 'Moscow', offset: 3, lat: 55.76, lon: 37.62 },
  { id: 'UTC+4', label: 'UTC+04:00 (Dubai)', city: 'Dubai', offset: 4, lat: 25.20, lon: 55.27 },
  { id: 'UTC+5', label: 'UTC+05:00 (Pakistan)', city: 'Pakistan', offset: 5, lat: 24.86, lon: 67.01 },
  { id: 'UTC+5:30', label: 'UTC+05:30 (India)', city: 'India', offset: 5.5, lat: 28.61, lon: 77.21 },
  { id: 'UTC+5.5', label: 'UTC+05:30 (India)', city: 'India', offset: 5.5, lat: 28.61, lon: 77.21 },
  { id: 'UTC+6', label: 'UTC+06:00 (Bangladesh)', city: 'Bangladesh', offset: 6 },
  { id: 'UTC+7', label: 'UTC+07:00 (Thailand)', city: 'Thailand', offset: 7, lat: 13.76, lon: 100.50 },
  { id: 'UTC+8', label: 'UTC+08:00 (China)', city: 'China', offset: 8, lat: 31.23, lon: 121.47 },
  { id: 'UTC+9', label: 'UTC+09:00 (Japan)', city: 'Japan', offset: 9, lat: 35.68, lon: 139.69 },
  { id: 'UTC+10', label: 'UTC+10:00 (Australia East)', city: 'Australia', offset: 10, lat: -33.87, lon: 151.21 },
  { id: 'UTC+11', label: 'UTC+11:00', city: 'UTC+11', offset: 11 },
  { id: 'UTC+12', label: 'UTC+12:00 (New Zealand)', city: 'New Zealand', offset: 12, lat: -36.85, lon: 174.76 },
  // Major cities - Americas
  { id: 'America/New_York', label: 'New York, USA (EST/EDT)', city: 'New York', offset: -5, lat: 40.71, lon: -74.01 },
  { id: 'America/Los_Angeles', label: 'Los Angeles, USA (PST/PDT)', city: 'Los Angeles', offset: -8, lat: 34.05, lon: -118.24 },
  { id: 'America/Chicago', label: 'Chicago, USA (CST/CDT)', city: 'Chicago', offset: -6, lat: 41.88, lon: -87.63 },
  { id: 'America/Denver', label: 'Denver, USA (MST/MDT)', city: 'Denver', offset: -7, lat: 39.74, lon: -104.99 },
  { id: 'America/Toronto', label: 'Toronto, Canada (EST/EDT)', city: 'Toronto', offset: -5, lat: 43.65, lon: -79.38 },
  { id: 'America/Vancouver', label: 'Vancouver, Canada (PST/PDT)', city: 'Vancouver', offset: -8, lat: 49.28, lon: -123.12 },
  { id: 'America/Mexico_City', label: 'Mexico City (CST)', city: 'Mexico City', offset: -6, lat: 19.43, lon: -99.13 },
  { id: 'America/Sao_Paulo', label: 'São Paulo, Brazil (BRT)', city: 'São Paulo', offset: -3, lat: -23.55, lon: -46.63 },
  // Major cities - Europe
  { id: 'Europe/London', label: 'London, UK (GMT/BST)', city: 'London', offset: 0, lat: 51.51, lon: -0.13 },
  { id: 'Europe/Paris', label: 'Paris, France (CET/CEST)', city: 'Paris', offset: 1, lat: 48.86, lon: 2.35 },
  { id: 'Europe/Berlin', label: 'Berlin, Germany (CET/CEST)', city: 'Berlin', offset: 1, lat: 52.52, lon: 13.41 },
  { id: 'Europe/Rome', label: 'Rome, Italy (CET/CEST)', city: 'Rome', offset: 1, lat: 41.90, lon: 12.50 },
  { id: 'Europe/Madrid', label: 'Madrid, Spain (CET/CEST)', city: 'Madrid', offset: 1, lat: 40.42, lon: -3.70 },
  { id: 'Europe/Amsterdam', label: 'Amsterdam, Netherlands (CET/CEST)', city: 'Amsterdam', offset: 1, lat: 52.37, lon: 4.90 },
  { id: 'Europe/Bucharest', label: 'Bucharest, Romania (EET/EEST)', city: 'Bucharest', offset: 2, lat: 44.43, lon: 26.10 },
  { id: 'Europe/Moscow', label: 'Moscow, Russia (MSK)', city: 'Moscow', offset: 3, lat: 55.76, lon: 37.62 },
  { id: 'Europe/Istanbul', label: 'Istanbul, Turkey (TRT)', city: 'Istanbul', offset: 3, lat: 41.01, lon: 28.98 },
  // Major cities - Asia
  { id: 'Asia/Dubai', label: 'Dubai, UAE (GST)', city: 'Dubai', offset: 4, lat: 25.20, lon: 55.27 },
  { id: 'Asia/Kolkata', label: 'Mumbai/Delhi, India (IST)', city: 'India', offset: 5.5, lat: 28.61, lon: 77.21 },
  { id: 'Asia/Bangkok', label: 'Bangkok, Thailand (ICT)', city: 'Bangkok', offset: 7, lat: 13.76, lon: 100.50 },
  { id: 'Asia/Singapore', label: 'Singapore (SGT)', city: 'Singapore', offset: 8, lat: 1.35, lon: 103.82 },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', city: 'Hong Kong', offset: 8, lat: 22.32, lon: 114.17 },
  { id: 'Asia/Shanghai', label: 'Shanghai/Beijing, China (CST)', city: 'Shanghai', offset: 8, lat: 31.23, lon: 121.47 },
  { id: 'Asia/Tokyo', label: 'Tokyo, Japan (JST)', city: 'Tokyo', offset: 9, lat: 35.68, lon: 139.69 },
  { id: 'Asia/Seoul', label: 'Seoul, South Korea (KST)', city: 'Seoul', offset: 9, lat: 37.57, lon: 126.98 },
  // Major cities - Oceania
  { id: 'Australia/Sydney', label: 'Sydney, Australia (AEST/AEDT)', city: 'Sydney', offset: 10, lat: -33.87, lon: 151.21 },
  { id: 'Australia/Melbourne', label: 'Melbourne, Australia (AEST/AEDT)', city: 'Melbourne', offset: 10, lat: -37.81, lon: 144.96 },
  { id: 'Pacific/Auckland', label: 'Auckland, New Zealand (NZST/NZDT)', city: 'Auckland', offset: 12, lat: -36.85, lon: 174.76 },
];

// Export timezone IDs for use in tool definitions (enum values)
export const TIMEZONE_IDS = TIMEZONES.map(tz => tz.id);

// ============ HELPER FUNCTIONS ============
/**
 * Get timezone offset from timezone ID
 */
export function getTimezoneOffset(tzId: string): number {
  // Check TIMEZONES array first
  const tz = TIMEZONES.find(t => t.id === tzId);
  if (tz) return tz.offset;

  // Parse UTC offset format
  if (tzId === 'UTC') return 0;
  const match = tzId.match(/UTC([+-])(\d+)(?::(\d+))?/);
  if (match) {
    const sign = match[1] === '+' ? 1 : -1;
    const hours = parseInt(match[2]);
    const minutes = match[3] ? parseInt(match[3]) / 60 : 0;
    return sign * (hours + minutes);
  }

  return 0;
}

/**
 * Get timezone info by ID
 */
export function getTimezoneInfo(tzId: string): TimezoneInfo | undefined {
  return TIMEZONES.find(t => t.id === tzId);
}

/**
 * Get weather icon from Open-Meteo weather code
 */
export function getWeatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌧️';
  if (code <= 65) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '🌨️';
  return '⛈️';
}

/**
 * Convert time between timezones
 */
export function convertTime(
  fromOffset: number,
  toOffset: number,
  hours: number,
  minutes: number
): { time: string; dayChange: string; newHours: number; newMinutes: number } {
  const diff = toOffset - fromOffset;
  let newHours = hours + Math.floor(diff);
  let newMinutes = minutes + Math.round((diff % 1) * 60);
  let dayChange = '';

  // Handle minute overflow
  if (newMinutes >= 60) {
    newMinutes -= 60;
    newHours += 1;
  } else if (newMinutes < 0) {
    newMinutes += 60;
    newHours -= 1;
  }

  // Handle hour overflow
  if (newHours >= 24) {
    newHours -= 24;
    dayChange = '+1 day';
  } else if (newHours < 0) {
    newHours += 24;
    dayChange = '-1 day';
  }

  const time = `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
  return { time, dayChange, newHours, newMinutes };
}

// ============ MAIN CALCULATOR FUNCTION ============
/**
 * Calculate timezone conversions
 */
export function calculateZone(input: ZoneCalculatorInput): ZoneCalculatorOutput {
  const { time, fromTimezone, toTimezones } = input;
  const [hours, minutes] = time.split(':').map(Number);

  const fromTz = getTimezoneInfo(fromTimezone);
  const fromOffset = getTimezoneOffset(fromTimezone);
  const sourceCity = fromTz?.city || fromTimezone;

  const conversions: ZoneConversion[] = toTimezones.map(tzId => {
    const toTz = getTimezoneInfo(tzId);
    const toOffset = getTimezoneOffset(tzId);
    const offsetDiff = toOffset - fromOffset;

    const result = convertTime(fromOffset, toOffset, hours, minutes);

    return {
      timezone: tzId,
      city: toTz?.city || tzId,
      time: result.time,
      offset: toOffset,
      offsetDiff,
      dayChange: result.dayChange,
    };
  });

  return {
    sourceTime: time,
    sourceTimezone: fromTimezone,
    sourceCity,
    conversions,
  };
}

/**
 * Fetch weather data for a timezone (async - for UI use)
 */
export async function fetchWeatherForTimezone(tzId: string): Promise<WeatherData | null> {
  const tz = getTimezoneInfo(tzId);
  if (!tz?.lat || !tz?.lon) return null;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${tz.lat}&longitude=${tz.lon}&current=temperature_2m,weather_code&timezone=auto`
    );
    const data = await res.json();
    if (data.current) {
      return {
        temp: Math.round(data.current.temperature_2m),
        icon: getWeatherIcon(data.current.weather_code),
        weatherCode: data.current.weather_code,
      };
    }
  } catch {
    // Silently fail
  }
  return null;
}


/**
 * User Preferences Types
 * 
 * Stores user preferences for time format, measurement units, and currency.
 * These are used across the app to provide a consistent experience.
 */

export type TimeFormat = '12h' | '24h';
export type MeasurementSystem = 'metric' | 'imperial';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'RON';

export interface UserPreferences {
  /** Time format: 12-hour (with AM/PM) or 24-hour */
  timeFormat: TimeFormat;
  
  /** Measurement system: metric (kg, cm) or imperial (lbs, ft) */
  measurementSystem: MeasurementSystem;
  
  /** Preferred currency for financial tools */
  currency: Currency;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  timeFormat: '24h',
  measurementSystem: 'metric',
  currency: 'USD',
};

export const TIME_FORMAT_LABELS: Record<TimeFormat, string> = {
  '12h': '12-hour (AM/PM)',
  '24h': '24-hour',
};

export const MEASUREMENT_SYSTEM_LABELS: Record<MeasurementSystem, string> = {
  metric: 'Metric (kg, cm, °C)',
  imperial: 'Imperial (lbs, ft, °F)',
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  USD: 'US Dollar ($)',
  EUR: 'Euro (€)',
  GBP: 'British Pound (£)',
  JPY: 'Japanese Yen (¥)',
  RON: 'Romanian Leu (lei)',
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  RON: 'lei',
};


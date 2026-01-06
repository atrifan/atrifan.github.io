/**
 * UnitConverter - Shared logic for unit conversions
 *
 * This is the SINGLE SOURCE OF TRUTH for unit conversion calculations.
 * Used by both the MCP tool (convert_units) and the UI (ConvertPage).
 */

// ============ TYPES ============
export type UnitCategory = 'weight' | 'length' | 'temperature';

export interface ConvertInput {
  /** The value to convert */
  value: number;
  /** The source unit (case-insensitive) */
  from: string;
  /** The target unit (case-insensitive) */
  to: string;
}

export interface ConvertOutput {
  /** The converted result */
  result: number;
  /** Original value */
  value: number;
  /** Source unit (normalized to lowercase) */
  from: string;
  /** Target unit (normalized to lowercase) */
  to: string;
  /** Formatted result string (e.g., "2.2046 lbs") */
  formatted: string;
}

export interface ConversionOption {
  from: string;
  to: string;
  label: string;
  category: UnitCategory;
}

// ============ SUPPORTED UNITS ============
/** All supported weight units */
export const WEIGHT_UNITS = ['kg', 'lbs', 'oz', 'g'] as const;
export type WeightUnit = typeof WEIGHT_UNITS[number];

/** All supported length units */
export const LENGTH_UNITS = ['cm', 'in', 'm', 'ft', 'km', 'mi', 'mm'] as const;
export type LengthUnit = typeof LENGTH_UNITS[number];

/** All supported temperature units */
export const TEMPERATURE_UNITS = ['c', 'f', 'k'] as const;
export type TemperatureUnit = typeof TEMPERATURE_UNITS[number];

/** All supported units (for MCP tool enum) */
export const ALL_UNITS = [...WEIGHT_UNITS, ...LENGTH_UNITS, ...TEMPERATURE_UNITS] as const;
export type SupportedUnit = typeof ALL_UNITS[number];

// ============ CONVERSION TABLES ============
/**
 * Comprehensive conversion table
 * Each unit maps to other units with a conversion function
 */
const CONVERSIONS: Record<string, Record<string, (v: number) => number>> = {
  // Weight
  kg: { lbs: v => v * 2.20462, oz: v => v * 35.274, g: v => v * 1000 },
  lbs: { kg: v => v / 2.20462, oz: v => v * 16, g: v => v * 453.592 },
  oz: { kg: v => v / 35.274, lbs: v => v / 16, g: v => v * 28.3495 },
  g: { kg: v => v / 1000, lbs: v => v / 453.592, oz: v => v / 28.3495 },

  // Length
  cm: { in: v => v / 2.54, m: v => v / 100, ft: v => v / 30.48, mm: v => v * 10 },
  in: { cm: v => v * 2.54, m: v => v * 0.0254, ft: v => v / 12, mm: v => v * 25.4 },
  m: { cm: v => v * 100, in: v => v / 0.0254, ft: v => v * 3.28084, km: v => v / 1000 },
  ft: { cm: v => v * 30.48, in: v => v * 12, m: v => v / 3.28084, mi: v => v / 5280 },
  km: { m: v => v * 1000, mi: v => v / 1.60934, ft: v => v * 3280.84 },
  mi: { km: v => v * 1.60934, m: v => v * 1609.34, ft: v => v * 5280 },
  mm: { cm: v => v / 10, in: v => v / 25.4, m: v => v / 1000 },

  // Temperature
  c: { f: v => v * 9/5 + 32, k: v => v + 273.15 },
  f: { c: v => (v - 32) * 5/9, k: v => (v - 32) * 5/9 + 273.15 },
  k: { c: v => v - 273.15, f: v => (v - 273.15) * 9/5 + 32 },
};

/**
 * UI-friendly conversion options organized by category
 */
export const CONVERSION_OPTIONS: Record<UnitCategory, ConversionOption[]> = {
  weight: [
    { from: 'kg', to: 'lbs', label: 'Kilograms → Pounds', category: 'weight' },
    { from: 'lbs', to: 'kg', label: 'Pounds → Kilograms', category: 'weight' },
    { from: 'kg', to: 'oz', label: 'Kilograms → Ounces', category: 'weight' },
    { from: 'oz', to: 'kg', label: 'Ounces → Kilograms', category: 'weight' },
    { from: 'g', to: 'oz', label: 'Grams → Ounces', category: 'weight' },
    { from: 'oz', to: 'g', label: 'Ounces → Grams', category: 'weight' },
  ],
  length: [
    { from: 'cm', to: 'in', label: 'Centimeters → Inches', category: 'length' },
    { from: 'in', to: 'cm', label: 'Inches → Centimeters', category: 'length' },
    { from: 'm', to: 'ft', label: 'Meters → Feet', category: 'length' },
    { from: 'ft', to: 'm', label: 'Feet → Meters', category: 'length' },
    { from: 'km', to: 'mi', label: 'Kilometers → Miles', category: 'length' },
    { from: 'mi', to: 'km', label: 'Miles → Kilometers', category: 'length' },
  ],
  temperature: [
    { from: 'c', to: 'f', label: 'Celsius → Fahrenheit', category: 'temperature' },
    { from: 'f', to: 'c', label: 'Fahrenheit → Celsius', category: 'temperature' },
    { from: 'c', to: 'k', label: 'Celsius → Kelvin', category: 'temperature' },
    { from: 'k', to: 'c', label: 'Kelvin → Celsius', category: 'temperature' },
  ],
};

// ============ MAIN CONVERTER ============
/**
 * Convert a value from one unit to another
 *
 * @param input - The conversion input with value, from, and to units
 * @returns The conversion result
 * @throws Error if conversion is not supported
 */
export function convertUnits(input: ConvertInput): ConvertOutput {
  const { value } = input;
  const from = input.from.toLowerCase();
  const to = input.to.toLowerCase();

  // Same unit - no conversion needed
  if (from === to) {
    return {
      result: value,
      value,
      from,
      to,
      formatted: `${value} ${to}`,
    };
  }

  const converter = CONVERSIONS[from]?.[to];
  if (!converter) {
    throw new Error(`Cannot convert from ${from} to ${to}`);
  }

  const result = Math.round(converter(value) * 10000) / 10000;

  return {
    result,
    value,
    from,
    to,
    formatted: `${result} ${to}`,
  };
}

/**
 * Get all supported units
 */
export function getSupportedUnits(): string[] {
  return Object.keys(CONVERSIONS);
}

/**
 * Check if a conversion is supported
 */
export function isConversionSupported(from: string, to: string): boolean {
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();
  return fromLower === toLower || !!CONVERSIONS[fromLower]?.[toLower];
}


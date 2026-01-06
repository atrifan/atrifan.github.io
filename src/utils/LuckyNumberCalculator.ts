/**
 * Shared Lucky Number Calculator
 *
 * Single source of truth for lucky number generation.
 * Used by both the LuckPage UI and the MCP lucky_number tool.
 */

// ============ CONSTANTS ============

/** Maximum integer value (2^31 - 1) */
export const MAX_INT = 2147483647;

/** Default minimum value */
export const DEFAULT_MIN = 1;

// ============ TYPES ============

/** Input for lucky number generation */
export interface LuckyNumberInput {
  /** Minimum value (default: 1) */
  min?: number;
  /** Maximum value (default: MAX_INT) */
  max?: number;
  /** Number of lucky numbers to generate (default: 1, max: 10) */
  count?: number;
  /** Optional seed for reproducible results (e.g., hold duration in ms) */
  seed?: number;
}

/** Output from lucky number generation */
export interface LuckyNumberOutput {
  /** The generated lucky number(s) - primary result is first */
  numbers: number[];
  /** The primary lucky number (first in array) */
  luckyNumber: number;
  /** Minimum value used */
  min: number;
  /** Maximum value used */
  max: number;
  /** Number of numbers generated */
  count: number;
  /** Human-readable range description */
  range: string;
}

// ============ HELPER FUNCTIONS ============

/**
 * Seeded random number generator for reproducible results
 * Uses a simple sine-based PRNG
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Generate a random number in range [min, max] inclusive
 */
function randomInRange(min: number, max: number, seed?: number): number {
  const random = seed !== undefined ? seededRandom(seed) : Math.random();
  return Math.floor(random * (max - min + 1)) + min;
}

// ============ MAIN CALCULATOR ============

/**
 * Generate lucky number(s) within a specified range
 *
 * @param input - The generation input with optional min, max, count, and seed
 * @returns The generated lucky number(s) with metadata
 */
export function generateLuckyNumber(input: LuckyNumberInput = {}): LuckyNumberOutput {
  // Apply defaults and constraints
  const min = Math.max(1, input.min ?? DEFAULT_MIN);
  const max = Math.min(MAX_INT, Math.max(min, input.max ?? MAX_INT));
  const count = Math.min(10, Math.max(1, input.count ?? 1));
  const seed = input.seed;

  // Generate the numbers
  const numbers: number[] = [];
  for (let i = 0; i < count; i++) {
    // If seed provided, use it with offset for each number
    const currentSeed = seed !== undefined ? seed * (i + 1) + Date.now() : undefined;
    numbers.push(randomInRange(min, max, currentSeed));
  }

  // Format range description
  const range = min === 1 && max === MAX_INT
    ? `1 - ${MAX_INT.toLocaleString()}`
    : `${min.toLocaleString()} - ${max.toLocaleString()}`;

  return {
    numbers,
    luckyNumber: numbers[0],
    min,
    max,
    count,
    range,
  };
}


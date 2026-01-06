/**
 * SpinCalculator - Shared logic for spin wheel functionality
 *
 * This is the SINGLE SOURCE OF TRUTH for spin wheel calculations.
 * Used by both the MCP tool (spin_wheel) and the UI (SpinPage).
 */

// ============ TYPES ============
export interface SpinCalculatorInput {
  /** List of options to spin between (minimum 2 required) */
  options: string[];
}

export interface SpinCalculatorOutput {
  /** The winning option */
  result: string;
  /** Index of the winning option (0-based) */
  index: number;
  /** Total number of options */
  totalOptions: number;
  /** All options that were in the wheel */
  options: string[];
  /** The final rotation angle (for UI animation) */
  finalRotation: number;
  /** The segment angle for each option */
  segmentAngle: number;
}

// ============ WHEEL COLORS ============
/** Colors used for wheel segments */
export const WHEEL_COLORS = [
  '#ef4444', // red
  '#f59e0b', // amber
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

/**
 * Get color for a wheel segment by index
 */
export function getSegmentColor(index: number): string {
  return WHEEL_COLORS[index % WHEEL_COLORS.length];
}

// ============ MAIN CALCULATOR ============
/**
 * Calculate spin wheel result
 *
 * @param input - The spin input with options array
 * @returns The spin result with winning option and rotation data
 * @throws Error if less than 2 options provided
 */
export function calculateSpin(input: SpinCalculatorInput): SpinCalculatorOutput {
  const { options } = input;

  // Validate input
  if (!options || options.length < 2) {
    throw new Error('At least 2 options are required for the spin wheel');
  }

  // Clean options (trim whitespace, filter empty)
  const cleanOptions = options.map(o => o.trim()).filter(o => o.length > 0);

  if (cleanOptions.length < 2) {
    throw new Error('At least 2 non-empty options are required');
  }

  // Calculate spin parameters
  const spins = 5 + Math.random() * 5; // 5-10 full rotations
  const finalRotation = spins * 360;
  const segmentAngle = 360 / cleanOptions.length;

  // Calculate winning index based on final rotation
  // The wheel spins clockwise, so we need to calculate which segment ends up at the top
  const normalizedRotation = finalRotation % 360;
  const winningIndex = Math.floor(
    ((360 - normalizedRotation + segmentAngle / 2) % 360) / segmentAngle
  ) % cleanOptions.length;

  return {
    result: cleanOptions[winningIndex],
    index: winningIndex,
    totalOptions: cleanOptions.length,
    options: cleanOptions,
    finalRotation,
    segmentAngle,
  };
}

/**
 * Parse options from newline-separated string (for UI)
 */
export function parseOptionsFromText(text: string): string[] {
  return text
    .split('\n')
    .map(o => o.trim())
    .filter(o => o.length > 0);
}

/**
 * Calculate winning index from a given rotation angle
 * Used by UI to determine result after animation
 */
export function getWinningIndexFromRotation(
  rotation: number,
  optionCount: number
): number {
  const normalizedRotation = rotation % 360;
  const segmentAngle = 360 / optionCount;
  return Math.floor(
    ((360 - normalizedRotation + segmentAngle / 2) % 360) / segmentAngle
  ) % optionCount;
}


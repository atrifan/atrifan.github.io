/**
 * DecisionCalculator - Shared logic for decision making functionality
 *
 * This is the SINGLE SOURCE OF TRUTH for decision making calculations.
 * Used by both the MCP tool (make_decision) and the UI (DecidePage).
 */

// ============ TYPES ============
export type DecisionMode = 'yesNo' | 'pickOne' | 'weighted';

export interface DecisionCalculatorInput {
  /** Decision mode: 'yesNo' for yes/no questions, 'pickOne' for custom options, 'weighted' for weighted selection */
  mode: DecisionMode;
  /** Custom options (required for 'pickOne' and 'weighted' modes) */
  options?: string[];
  /** Optional weights for each option (only used in 'weighted' mode) */
  weights?: number[];
}

export interface DecisionCalculatorOutput {
  /** The decision result */
  decision: string;
  /** The mode used for the decision */
  mode: DecisionMode;
  /** Index of the selected option (for pickOne/weighted modes) */
  index?: number;
  /** Total number of options (for pickOne/weighted modes) */
  totalOptions?: number;
  /** All options that were considered (for pickOne/weighted modes) */
  options?: string[];
  /** Confidence level (0-100) - higher for weighted decisions */
  confidence: number;
  /** Emoji icon for the result */
  icon: string;
}

// ============ YES/NO ANSWERS ============
/** Possible answers for yes/no mode */
export const YES_NO_ANSWERS = [
  { text: 'YES!', icon: '✅', isPositive: true },
  { text: 'NO!', icon: '❌', isPositive: false },
  { text: 'Maybe...', icon: '🤔', isPositive: null },
  { text: 'Definitely!', icon: '💯', isPositive: true },
  { text: 'Not now', icon: '⏳', isPositive: false },
  { text: 'Go for it!', icon: '🚀', isPositive: true },
  { text: 'Think again', icon: '🔄', isPositive: null },
  { text: 'Absolutely!', icon: '🎯', isPositive: true },
];

/**
 * Get a random yes/no answer
 */
export function getRandomYesNoAnswer(): { text: string; icon: string; isPositive: boolean | null } {
  return YES_NO_ANSWERS[Math.floor(Math.random() * YES_NO_ANSWERS.length)];
}

// ============ MAIN CALCULATOR ============
/**
 * Make a decision based on the input parameters
 *
 * @param input - The decision input with mode and optional options/weights
 * @returns The decision result
 * @throws Error if options are required but not provided
 */
export function makeDecision(input: DecisionCalculatorInput): DecisionCalculatorOutput {
  const { mode, options, weights } = input;

  // Yes/No mode
  if (mode === 'yesNo') {
    const answer = getRandomYesNoAnswer();
    return {
      decision: `${answer.text} ${answer.icon}`,
      mode,
      confidence: Math.floor(Math.random() * 30) + 70, // 70-100%
      icon: answer.icon,
    };
  }

  // Validate options for pickOne and weighted modes
  if (!options || options.length === 0) {
    throw new Error('Options are required for pickOne and weighted modes');
  }

  // Clean options
  const cleanOptions = options.map(o => o.trim()).filter(o => o.length > 0);

  if (cleanOptions.length < 2) {
    throw new Error('At least 2 non-empty options are required');
  }

  // Weighted mode
  if (mode === 'weighted' && weights && weights.length === cleanOptions.length) {
    const totalWeight = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
    if (totalWeight === 0) {
      throw new Error('Total weight must be greater than 0');
    }

    let random = Math.random() * totalWeight;
    let selectedIndex = 0;

    for (let i = 0; i < weights.length; i++) {
      random -= Math.max(0, weights[i]);
      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }

    const selectedWeight = weights[selectedIndex];
    const confidence = Math.round((selectedWeight / totalWeight) * 100);

    return {
      decision: cleanOptions[selectedIndex],
      mode,
      index: selectedIndex,
      totalOptions: cleanOptions.length,
      options: cleanOptions,
      confidence,
      icon: '⚖️',
    };
  }

  // Pick one mode (random selection)
  const selectedIndex = Math.floor(Math.random() * cleanOptions.length);

  return {
    decision: cleanOptions[selectedIndex],
    mode: 'pickOne',
    index: selectedIndex,
    totalOptions: cleanOptions.length,
    options: cleanOptions,
    confidence: Math.round(100 / cleanOptions.length), // Equal probability
    icon: '🎯',
  };
}

/**
 * Parse options from newline-separated string (for UI)
 */
export function parseDecisionOptions(text: string): string[] {
  return text
    .split('\n')
    .map(o => o.trim())
    .filter(o => o.length > 0);
}


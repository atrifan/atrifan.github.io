/**
 * Shared Percentage Calculator
 *
 * Single source of truth for percentage calculations.
 * Used by both the PercentPage UI and the MCP calculate_percentage tool.
 */

// ============ TYPES ============

/** Supported percentage operations */
export const PERCENT_OPERATIONS = ['whatIsXPercentOfY', 'xIsWhatPercentOfY', 'increaseByPercent', 'decreaseByPercent', 'percentChange'] as const;
export type PercentOperation = typeof PERCENT_OPERATIONS[number];

/** Input for percentage calculation */
export interface PercentCalculatorInput {
  /** The operation to perform */
  operation: PercentOperation;
  /** First value (percentage for whatIs/increase/decrease, value for percentOf/percentChange) */
  value1: number;
  /** Second value (base value for whatIs/increase/decrease, total for percentOf, new value for percentChange) */
  value2: number;
}

/** Output from percentage calculation */
export interface PercentCalculatorOutput {
  /** The calculated result */
  result: number;
  /** The operation performed */
  operation: PercentOperation;
  /** First input value */
  value1: number;
  /** Second input value */
  value2: number;
  /** Human-readable explanation of the calculation */
  explanation: string;
  /** Whether the result is a percentage (for display purposes) */
  resultIsPercent: boolean;
}

// ============ OPERATION LABELS ============

/** Human-readable labels for each operation */
export const OPERATION_LABELS: Record<PercentOperation, string> = {
  whatIsXPercentOfY: 'What is X% of Y?',
  xIsWhatPercentOfY: 'X is what % of Y?',
  increaseByPercent: 'Increase Y by X%',
  decreaseByPercent: 'Decrease Y by X%',
  percentChange: 'Percent change from X to Y',
};

// ============ MAIN CALCULATOR ============

/**
 * Calculate percentage based on the specified operation
 *
 * @param input - The calculation input with operation and values
 * @returns The calculation result with explanation
 */
export function calculatePercent(input: PercentCalculatorInput): PercentCalculatorOutput {
  const { operation, value1, value2 } = input;

  let result: number;
  let explanation: string;
  let resultIsPercent = false;

  switch (operation) {
    case 'whatIsXPercentOfY':
      // What is X% of Y? → (X / 100) * Y
      result = (value1 / 100) * value2;
      explanation = `${value1}% of ${value2} = ${result.toFixed(2)}`;
      break;

    case 'xIsWhatPercentOfY':
      // X is what % of Y? → (X / Y) * 100
      if (value2 === 0) {
        throw new Error('Cannot divide by zero');
      }
      result = (value1 / value2) * 100;
      explanation = `${value1} is ${result.toFixed(2)}% of ${value2}`;
      resultIsPercent = true;
      break;

    case 'increaseByPercent':
      // Increase Y by X% → Y * (1 + X / 100)
      result = value2 * (1 + value1 / 100);
      explanation = `${value2} increased by ${value1}% = ${result.toFixed(2)}`;
      break;

    case 'decreaseByPercent':
      // Decrease Y by X% → Y * (1 - X / 100)
      result = value2 * (1 - value1 / 100);
      explanation = `${value2} decreased by ${value1}% = ${result.toFixed(2)}`;
      break;

    case 'percentChange':
      // Percent change from X to Y → ((Y - X) / X) * 100
      if (value1 === 0) {
        throw new Error('Cannot calculate percent change from zero');
      }
      result = ((value2 - value1) / value1) * 100;
      const direction = result >= 0 ? 'increase' : 'decrease';
      explanation = `Change from ${value1} to ${value2} = ${Math.abs(result).toFixed(2)}% ${direction}`;
      resultIsPercent = true;
      break;

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }

  // Round to 2 decimal places
  result = Math.round(result * 100) / 100;

  return {
    result,
    operation,
    value1,
    value2,
    explanation,
    resultIsPercent,
  };
}


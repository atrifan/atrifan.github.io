/**
 * Shared Flip Calculator
 * 
 * This is the SINGLE SOURCE OF TRUTH for coin flip and dice roll logic.
 * Used by both the MCP API (/api/mcp) and the UI (FlipPage.tsx).
 * 
 * Contains two modes:
 * 1. Coin Flip - flip coins and get heads/tails
 * 2. Dice Roll - roll dice with customizable sides
 * 
 * GUIDELINE FOR MODIFYING CALCULATOR FUNCTIONS:
 * 1. Ensure MCP tool definition (tools-definitions.ts) matches these parameters
 * 2. Ensure MCP execution (route.ts) calls this shared function
 * 3. Ensure UI component uses this same function
 * 4. Keep parameter names consistent across all three locations
 * 5. Update outputSchema in tools-definitions.ts if return type changes
 */

// ============ TYPES ============
export type FlipMode = 'coin' | 'dice';

// ============ DEFAULTS ============
export const FLIP_DEFAULTS = {
  mode: 'coin' as FlipMode,
  coinCount: 1,
  diceCount: 1,
  diceSides: 6,
  maxCoinCount: 100,
  maxDiceCount: 6,
};

// ============ INPUT TYPES ============
export interface FlipCalculatorInput {
  /** Mode: 'coin' for coin flip, 'dice' for dice roll (default: coin) */
  flipMode?: FlipMode;
  /** Number of coins to flip or dice to roll (default: 1) */
  count?: number;
  /** Number of sides on dice (default: 6, only used in dice mode) */
  sides?: number;
}

// ============ OUTPUT TYPES ============
export interface CoinFlipOutput {
  flipMode: 'coin';
  /** Single coin result (first flip) */
  result: 'heads' | 'tails';
  /** All coin flip results */
  results: ('heads' | 'tails')[];
  /** Number of heads */
  headsCount: number;
  /** Number of tails */
  tailsCount: number;
  /** Number of coins flipped */
  count: number;
}

export interface DiceRollOutput {
  flipMode: 'dice';
  /** All dice roll results */
  rolls: number[];
  /** Sum of all dice rolls */
  total: number;
  /** Number of sides on dice */
  sides: number;
  /** Number of dice rolled */
  count: number;
}

export type FlipCalculatorOutput = CoinFlipOutput | DiceRollOutput;

// ============ MAIN CALCULATOR FUNCTION ============
/**
 * Flip coins or roll dice.
 * 
 * Modes:
 * - 'coin': Flip coins and get heads/tails results
 * - 'dice': Roll dice with customizable sides
 */
export function calculateFlip(input: FlipCalculatorInput): FlipCalculatorOutput {
  const flipMode = input.flipMode ?? FLIP_DEFAULTS.mode;

  if (flipMode === 'dice') {
    const sides = input.sides ?? FLIP_DEFAULTS.diceSides;
    const count = Math.min(Math.max(input.count ?? FLIP_DEFAULTS.diceCount, 1), FLIP_DEFAULTS.maxDiceCount);
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    
    return {
      flipMode: 'dice',
      rolls,
      total: rolls.reduce((a, b) => a + b, 0),
      sides,
      count,
    };
  } else {
    const count = Math.min(Math.max(input.count ?? FLIP_DEFAULTS.coinCount, 1), FLIP_DEFAULTS.maxCoinCount);
    const results = Array.from({ length: count }, () => 
      Math.random() < 0.5 ? 'heads' : 'tails'
    ) as ('heads' | 'tails')[];
    
    return {
      flipMode: 'coin',
      result: results[0],
      results,
      headsCount: results.filter(r => r === 'heads').length,
      tailsCount: results.filter(r => r === 'tails').length,
      count,
    };
  }
}

// ============ HELPER FUNCTIONS ============
/**
 * Flip a single coin - convenience function for UI
 */
export function flipCoin(): 'heads' | 'tails' {
  return Math.random() < 0.5 ? 'heads' : 'tails';
}

/**
 * Roll dice - convenience function for UI
 */
export function rollDice(count: number = 1, sides: number = 6): number[] {
  const safeCount = Math.min(Math.max(count, 1), FLIP_DEFAULTS.maxDiceCount);
  return Array.from({ length: safeCount }, () => Math.floor(Math.random() * sides) + 1);
}


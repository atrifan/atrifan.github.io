/**
 * Shared Tip Calculator
 * 
 * This is the SINGLE SOURCE OF TRUTH for tip calculation logic.
 * Used by both the MCP API (/api/mcp) and the UI (TipPage.tsx).
 * 
 * GUIDELINE FOR MODIFYING CALCULATOR FUNCTIONS:
 * 1. Ensure MCP tool definition (tools-definitions.ts) matches these parameters
 * 2. Ensure MCP execution (route.ts) calls this shared function
 * 3. Ensure UI component uses this same function
 * 4. Keep parameter names consistent across all three locations
 * 5. Update outputSchema in tools-definitions.ts if return type changes
 */

// ============ ENUMS ============
export type CalculatorMode = 'static' | 'mood';

export type ServiceQuality = 'terrible' | 'poor' | 'okay' | 'good' | 'amazing';
export type MoodLevel = 'awful' | 'meh' | 'neutral' | 'happy' | 'great';
export type BudgetSituation = 'very_tight' | 'tight' | 'normal' | 'comfortable' | 'generous';

// Numeric mappings for enums (1-5 scale)
const SERVICE_QUALITY_VALUES: Record<ServiceQuality, number> = {
  terrible: 1, poor: 2, okay: 3, good: 4, amazing: 5
};

const MOOD_LEVEL_VALUES: Record<MoodLevel, number> = {
  awful: 1, meh: 2, neutral: 3, happy: 4, great: 5
};

const BUDGET_SITUATION_VALUES: Record<BudgetSituation, number> = {
  very_tight: 1, tight: 2, normal: 3, comfortable: 4, generous: 5
};

// ============ INPUT/OUTPUT TYPES ============
export interface TipCalculatorInput {
  /** Bill amount before tip (required) */
  billAmount: number;
  /** Tip percentage - required for 'static' mode, ignored in 'mood' mode */
  tipPercentage?: number;
  /** Number of people to split between (default: 1) */
  splitBetween?: number;
  /** Calculator mode: 'static' uses tipPercentage, 'mood' computes from feelings (default: 'static' if tipPercentage provided, else 'mood') */
  calculatorMode?: CalculatorMode;
  /** Service quality rating - used in 'mood' mode */
  serviceQuality?: ServiceQuality | number;
  /** Current mood - used in 'mood' mode */
  mood?: MoodLevel | number;
  /** Budget situation - used in 'mood' mode */
  budgetSituation?: BudgetSituation | number;
}

export interface TipCalculatorOutput {
  billAmount: number;
  tipPercentage: number;
  tipAmount: number;
  total: number;
  perPerson: number;
  splitBetween: number;
  calculatorMode: CalculatorMode;
  /** True if tip percentage was computed from mood parameters */
  suggested: boolean;
}

// ============ DEFAULTS ============
const DEFAULTS = {
  tipPercentage: 18,
  splitBetween: 1,
  serviceQuality: 3,
  mood: 3,
  budgetSituation: 3,
};

// ============ HELPER FUNCTIONS ============
function toNumericValue(value: string | number | undefined, mapping: Record<string, number>, defaultValue: number): number {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'number') return Math.max(1, Math.min(5, value));
  return mapping[value] ?? defaultValue;
}

/**
 * Calculate suggested tip percentage based on mood parameters.
 * Formula: Base from service (5-25%) + mood modifier + budget modifier
 */
function calculateMoodBasedTip(serviceQuality: number, mood: number, budgetSituation: number): number {
  // Service quality determines base tip (terrible=5%, amazing=25%)
  const serviceBase = 5 + (serviceQuality - 1) * 5;
  // Mood modifier: -3 to +3 percentage points
  const moodMod = (mood - 3) * 1.5;
  // Budget modifier: very_tight=-5, tight=-2, normal=0, comfortable=+1, generous=+2
  const budgetMod = budgetSituation === 1 ? -5 : budgetSituation === 2 ? -2 : budgetSituation === 3 ? 0 : budgetSituation === 4 ? 1 : 2;
  
  let suggested = serviceBase + moodMod + budgetMod;
  // Clamp to reasonable range (5% - 30%)
  return Math.max(5, Math.min(30, Math.round(suggested)));
}

// ============ MAIN CALCULATOR FUNCTION ============
/**
 * Calculate tip amount and total bill.
 * 
 * Modes:
 * - 'static': Uses provided tipPercentage directly
 * - 'mood': Computes tipPercentage from serviceQuality, mood, and budgetSituation
 * 
 * If calculatorMode is not specified:
 * - Uses 'static' if tipPercentage is provided
 * - Uses 'mood' if tipPercentage is not provided (will use mood params or defaults)
 */
export function calculateTip(input: TipCalculatorInput): TipCalculatorOutput {
  const { billAmount } = input;
  const splitBetween = input.splitBetween ?? DEFAULTS.splitBetween;
  
  // Determine mode: explicit > inferred from tipPercentage presence
  const mode: CalculatorMode = input.calculatorMode ?? (input.tipPercentage !== undefined ? 'static' : 'mood');
  
  let tipPercentage: number;
  let suggested = false;
  
  if (mode === 'static') {
    // Static mode: use provided percentage or default
    tipPercentage = input.tipPercentage ?? DEFAULTS.tipPercentage;
  } else {
    // Mood mode: calculate from feelings
    const serviceQuality = toNumericValue(input.serviceQuality, SERVICE_QUALITY_VALUES, DEFAULTS.serviceQuality);
    const mood = toNumericValue(input.mood, MOOD_LEVEL_VALUES, DEFAULTS.mood);
    const budgetSituation = toNumericValue(input.budgetSituation, BUDGET_SITUATION_VALUES, DEFAULTS.budgetSituation);
    
    tipPercentage = calculateMoodBasedTip(serviceQuality, mood, budgetSituation);
    suggested = true;
  }
  
  const tipAmount = Math.round(billAmount * (tipPercentage / 100) * 100) / 100;
  const total = Math.round((billAmount + tipAmount) * 100) / 100;
  const perPerson = Math.round((total / splitBetween) * 100) / 100;
  
  return {
    billAmount,
    tipPercentage,
    tipAmount,
    total,
    perPerson,
    splitBetween,
    calculatorMode: mode,
    suggested,
  };
}


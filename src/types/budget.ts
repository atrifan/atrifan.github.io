/**
 * Budget & Savings Types
 */

export type SavingsIntensity = 'light' | 'medium' | 'aggressive';

export type Currency = 'EUR' | 'USD' | 'GBP' | 'RON' | 'JPY';

export interface BasicBudgetInput {
  currency: Currency;
  monthlyIncome: number;
  monthlyTaxes: number;
  monthlyFixedExpenses: number; // rent, utilities, subscriptions, etc.
  currentSavings: number;
  savingsGoal: number;
  targetDate?: string; // ISO date string, optional
  intensity: SavingsIntensity;
}

export interface AdvancedExpenses {
  // Weekly going out
  weeklyDiningOut: number; // times per week
  
  // Restaurant prices (for estimation)
  waterPrice: number;      // 500ml water
  cokePrice: number;       // 500ml coke  
  beerPrice: number;       // 500ml beer
  espressoPrice: number;   // 1 espresso
  burgerPrice: number;     // 1 burger
  pizzaPrice: number;      // 1 pizza
  
  // Grocery prices (for monthly estimation)
  breadPrice: number;      // 1 loaf
  milkPrice: number;       // 1 liter
  waterPackPrice: number;  // 6-pack water
  chickenPrice: number;    // 1 kg chicken
  
  // Weekly consumption estimates
  weeklyBreadLoaves: number;
  weeklyMilkLiters: number;
  weeklyWaterPacks: number;
  weeklyChickenKg: number;
}

export interface FullBudgetInput extends BasicBudgetInput {
  advancedMode: boolean;
  advancedExpenses?: AdvancedExpenses;
}

export interface MonthlyBreakdown {
  month: string; // "January 2025"
  startBalance: number;
  income: number;
  taxes: number;
  fixedExpenses: number;
  estimatedLiving: number;
  targetSavings: number;
  endBalance: number;
  cumulativeSavings: number;
}

export interface SavingsPlan {
  // Summary
  monthlyNetIncome: number;          // income - taxes
  monthlyDisposable: number;         // net - fixed expenses
  monthlyTargetSavings: number;      // how much to save per month
  monthlyBudgetForLiving: number;    // what's left for daily expenses
  weeklyBudgetForLiving: number;     // weekly breakdown
  dailyBudgetForLiving: number;      // daily breakdown
  
  // Timeline
  monthsToGoal: number;
  targetDate: Date;
  
  // Warnings
  isAchievable: boolean;
  warnings: string[];
  
  // Tips based on intensity
  tips: string[];
  
  // Monthly breakdown
  breakdown: MonthlyBreakdown[];
  
  // Advanced analysis (if advanced mode)
  estimatedMonthlyDiningOut?: number;
  estimatedMonthlyGroceries?: number;
  potentialMonthlySavings?: number;
}

export const INTENSITY_MULTIPLIERS: Record<SavingsIntensity, number> = {
  light: 0.10,      // Save 10% of disposable income
  medium: 0.25,     // Save 25% of disposable income
  aggressive: 0.40, // Save 40% of disposable income
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  RON: 'lei',
  JPY: '¥',
};


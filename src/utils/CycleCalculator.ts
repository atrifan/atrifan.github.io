/**
 * CycleCalculator - Shared logic for menstrual cycle calculations
 *
 * This is the SINGLE SOURCE OF TRUTH for cycle calculations.
 * Used by both the MCP tool (calculate_cycle) and the UI (CyclePage).
 */

// ============ TYPES ============
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export interface CycleCalculatorInput {
  /** Date in YYYY-MM-DD format (either first or last day of period) */
  date: string;
  /** If true, date is first day of period; if false, it's last day */
  isFirstDay?: boolean;
  /** Use simplified mode with average cycle (28 days, 5 day period) */
  simplified?: boolean;
  /** Average cycle length in days (default: 28) */
  cycleLength?: number;
  /** Average period length in days (default: 5) */
  periodLength?: number;
}

export interface CycleCalculatorOutput {
  /** Next period start date (YYYY-MM-DD) */
  nextPeriodStart: string;
  /** Next period end date (YYYY-MM-DD) */
  nextPeriodEnd: string;
  /** Ovulation date (YYYY-MM-DD) */
  ovulationDate: string;
  /** Fertile window start date (YYYY-MM-DD) */
  fertileWindowStart: string;
  /** Fertile window end date (YYYY-MM-DD) */
  fertileWindowEnd: string;
  /** Current day in the cycle (1-based) */
  currentDay: number;
  /** Current phase of the cycle */
  phase: CyclePhase;
  /** Days until next period */
  daysUntilNextPeriod: number;
  /** Cycle length used for calculation */
  cycleLength: number;
  /** Period length used for calculation */
  periodLength: number;
  /** Mode used: 'simplified' or 'advanced' */
  mode: 'simplified' | 'advanced';
  /** The period start date used for calculation (YYYY-MM-DD) */
  periodStartDate: string;
  /** Phase information with name, emoji, color, and description */
  phaseInfo: PhaseInfo;
}

/** Extended output with Date objects for UI usage */
export interface CycleCalculatorUIOutput extends CycleCalculatorOutput {
  /** Next period start as Date object */
  nextPeriodStartDate: Date;
  /** Next period end as Date object */
  nextPeriodEndDate: Date;
  /** Ovulation as Date object */
  ovulationDateObj: Date;
  /** Fertile window start as Date object */
  fertileWindowStartDate: Date;
  /** Fertile window end as Date object */
  fertileWindowEndDate: Date;
  /** Safe days before fertile window */
  safeDaysBeforeFertile: { start: Date; end: Date };
  /** Safe days after fertile window */
  safeDaysAfterFertile: { start: Date; end: Date };
}

export interface PhaseInfo {
  name: string;
  emoji: string;
  color: string;
  description: string;
}

// ============ CONSTANTS ============
/** Luteal phase is fairly constant at ~14 days before next period */
export const LUTEAL_PHASE_DAYS = 14;
/** Sperm can survive up to 5 days in the reproductive tract */
export const SPERM_SURVIVAL_DAYS = 5;
/** Egg survives approximately 24 hours after ovulation */
export const EGG_SURVIVAL_DAYS = 1;
/** Default cycle length */
export const DEFAULT_CYCLE_LENGTH = 28;
/** Default period length */
export const DEFAULT_PERIOD_LENGTH = 5;
/** Milliseconds per day */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Phase information lookup */
export const PHASE_INFO: Record<CyclePhase, PhaseInfo> = {
  menstrual: { name: 'Menstrual Phase', emoji: '🩸', color: '#ef4444', description: 'Period days - uterine lining sheds' },
  follicular: { name: 'Follicular Phase', emoji: '🌱', color: '#22c55e', description: 'Egg develops in ovary' },
  ovulation: { name: 'Ovulation Phase', emoji: '🥚', color: '#f59e0b', description: 'Peak fertility - egg released' },
  luteal: { name: 'Luteal Phase', emoji: '🌙', color: '#8b5cf6', description: 'Post-ovulation, preparing for next cycle' },
};

// ============ HELPER FUNCTIONS ============
/**
 * Parse a YYYY-MM-DD date string to a Date object at midnight
 */
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Format a Date object to YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get phase info for a given phase
 */
export function getPhaseInfo(phase: CyclePhase): PhaseInfo {
  return PHASE_INFO[phase];
}

// ============ MAIN CALCULATOR ============
/**
 * Calculate menstrual cycle predictions
 *
 * @param input - The cycle input with date and optional parameters
 * @returns The cycle predictions
 * @throws Error if date is invalid
 */
export function calculateCycle(input: CycleCalculatorInput): CycleCalculatorOutput {
  const {
    date,
    isFirstDay = true,
    simplified = false,
    cycleLength: inputCycleLength,
    periodLength: inputPeriodLength,
  } = input;

  // Use simplified values or provided values
  const cycleLength = simplified ? DEFAULT_CYCLE_LENGTH : (inputCycleLength || DEFAULT_CYCLE_LENGTH);
  const periodLength = simplified ? DEFAULT_PERIOD_LENGTH : (inputPeriodLength || DEFAULT_PERIOD_LENGTH);

  // Calculate period start date
  let periodStart = parseDate(date);
  if (!isFirstDay) {
    // Date is last day of bleeding - calculate first day
    periodStart = new Date(periodStart.getTime() - (periodLength - 1) * MS_PER_DAY);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate next period (find the next one after today)
  let nextPeriodStart = new Date(periodStart.getTime() + cycleLength * MS_PER_DAY);
  while (nextPeriodStart <= today) {
    nextPeriodStart = new Date(nextPeriodStart.getTime() + cycleLength * MS_PER_DAY);
  }

  // Period end date
  const nextPeriodEnd = new Date(nextPeriodStart.getTime() + (periodLength - 1) * MS_PER_DAY);

  // Ovulation is ~14 days before next period (luteal phase)
  const ovulationDate = new Date(nextPeriodStart.getTime() - LUTEAL_PHASE_DAYS * MS_PER_DAY);

  // Fertile window: 5 days before ovulation + ovulation day + 1 day after
  const fertileWindowStart = new Date(ovulationDate.getTime() - SPERM_SURVIVAL_DAYS * MS_PER_DAY);
  const fertileWindowEnd = new Date(ovulationDate.getTime() + EGG_SURVIVAL_DAYS * MS_PER_DAY);

  // Calculate current cycle day and phase
  const daysSincePeriodStart = Math.floor((today.getTime() - periodStart.getTime()) / MS_PER_DAY);
  const currentDay = (daysSincePeriodStart % cycleLength) + 1;

  // Determine phase
  let phase: CyclePhase;
  if (currentDay <= periodLength) {
    phase = 'menstrual';
  } else if (currentDay <= cycleLength - LUTEAL_PHASE_DAYS - 1) {
    phase = 'follicular';
  } else if (currentDay <= cycleLength - LUTEAL_PHASE_DAYS + 1) {
    phase = 'ovulation';
  } else {
    phase = 'luteal';
  }

  const daysUntilNextPeriod = Math.ceil((nextPeriodStart.getTime() - today.getTime()) / MS_PER_DAY);

  return {
    nextPeriodStart: formatDate(nextPeriodStart),
    nextPeriodEnd: formatDate(nextPeriodEnd),
    ovulationDate: formatDate(ovulationDate),
    fertileWindowStart: formatDate(fertileWindowStart),
    fertileWindowEnd: formatDate(fertileWindowEnd),
    currentDay,
    phase,
    daysUntilNextPeriod,
    cycleLength,
    periodLength,
    mode: simplified ? 'simplified' : 'advanced',
    periodStartDate: formatDate(periodStart),
    phaseInfo: getPhaseInfo(phase),
  };
}

/**
 * Calculate cycle with extended UI output including Date objects and safe days
 * This is for UI components that need Date objects for formatting
 */
export function calculateCycleForUI(input: CycleCalculatorInput): CycleCalculatorUIOutput {
  const baseResult = calculateCycle(input);

  // Parse dates back to Date objects
  const nextPeriodStartDate = parseDate(baseResult.nextPeriodStart);
  const nextPeriodEndDate = parseDate(baseResult.nextPeriodEnd);
  const ovulationDateObj = parseDate(baseResult.ovulationDate);
  const fertileWindowStartDate = parseDate(baseResult.fertileWindowStart);
  const fertileWindowEndDate = parseDate(baseResult.fertileWindowEnd);

  // Calculate safe days
  // Current cycle's period end (period end from previous cycle that led to this next period)
  const currentPeriodEnd = new Date(nextPeriodStartDate.getTime() - (baseResult.cycleLength - baseResult.periodLength + 1) * MS_PER_DAY);

  // Safe days before fertile window: from end of current period to start of fertile window
  const safeDaysBeforeFertile = {
    start: new Date(currentPeriodEnd.getTime() + MS_PER_DAY),
    end: new Date(fertileWindowStartDate.getTime() - MS_PER_DAY),
  };

  // Safe days after fertile window: from end of fertile window to start of next period
  const safeDaysAfterFertile = {
    start: new Date(fertileWindowEndDate.getTime() + MS_PER_DAY),
    end: new Date(nextPeriodStartDate.getTime() - MS_PER_DAY),
  };

  return {
    ...baseResult,
    nextPeriodStartDate,
    nextPeriodEndDate,
    ovulationDateObj,
    fertileWindowStartDate,
    fertileWindowEndDate,
    safeDaysBeforeFertile,
    safeDaysAfterFertile,
  };
}


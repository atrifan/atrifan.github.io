/**
 * AgeCalculator - Shared logic for age calculations
 *
 * This is the SINGLE SOURCE OF TRUTH for age calculations.
 * Used by both the MCP tool (calculate_age) and the UI (AgePage).
 */

// ============ TYPES ============
export interface AgeCalculatorInput {
  /** Birth date in YYYY-MM-DD format */
  birthDate: string;
}

export interface AgeCalculatorOutput {
  /** Years of age */
  years: number;
  /** Remaining months after years */
  months: number;
  /** Remaining days after months */
  days: number;
  /** Total days lived */
  totalDays: number;
  /** Days until next birthday */
  daysUntilNextBirthday: number;
}

/** Extended output with additional fields for UI usage */
export interface AgeCalculatorUIOutput extends AgeCalculatorOutput {
  /** Total weeks lived */
  totalWeeks: number;
  /** Total months lived */
  totalMonths: number;
  /** Total hours lived */
  totalHours: number;
  /** Next birthday as Date object */
  nextBirthdayDate: Date;
  /** Birth date as Date object */
  birthDateObj: Date;
}

// ============ CONSTANTS ============
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ============ HELPER FUNCTIONS ============
/**
 * Parse a YYYY-MM-DD date string to a Date object
 */
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ============ MAIN CALCULATOR ============
/**
 * Calculate age from birth date
 *
 * @param input - The birth date input
 * @returns The age calculation result
 * @throws Error if birth date is in the future
 */
export function calculateAge(input: AgeCalculatorInput): AgeCalculatorOutput {
  const birth = parseDate(input.birthDate);
  const now = new Date();
  
  // Validate birth date is not in the future
  if (birth > now) {
    throw new Error('Birth date cannot be in the future');
  }

  // Calculate years, months, days
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();

  // Adjust for negative days
  if (days < 0) {
    months--;
    const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += lastMonth.getDate();
  }

  // Adjust for negative months
  if (months < 0) {
    years--;
    months += 12;
  }

  // Calculate total days
  const totalDays = Math.floor((now.getTime() - birth.getTime()) / MS_PER_DAY);

  // Calculate next birthday
  const nextBirthday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (nextBirthday <= now) {
    nextBirthday.setFullYear(nextBirthday.getFullYear() + 1);
  }
  const daysUntilNextBirthday = Math.ceil((nextBirthday.getTime() - now.getTime()) / MS_PER_DAY);

  return {
    years,
    months,
    days,
    totalDays,
    daysUntilNextBirthday,
  };
}

/**
 * Calculate age with extended UI output including additional statistics
 * This is for UI components that need more detailed information
 */
export function calculateAgeForUI(input: AgeCalculatorInput): AgeCalculatorUIOutput {
  const baseResult = calculateAge(input);
  const birth = parseDate(input.birthDate);
  const now = new Date();

  // Calculate additional statistics
  const totalWeeks = Math.floor(baseResult.totalDays / 7);
  const totalMonths = baseResult.years * 12 + baseResult.months;
  const totalHours = baseResult.totalDays * 24;

  // Calculate next birthday as Date object
  const nextBirthdayDate = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (nextBirthdayDate <= now) {
    nextBirthdayDate.setFullYear(nextBirthdayDate.getFullYear() + 1);
  }

  return {
    ...baseResult,
    totalWeeks,
    totalMonths,
    totalHours,
    nextBirthdayDate,
    birthDateObj: birth,
  };
}


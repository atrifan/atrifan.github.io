/**
 * CountdownCalculator - Shared logic for countdown/days calculation functionality
 *
 * This is the SINGLE SOURCE OF TRUTH for countdown calculations.
 * Used by both the MCP tool (calculate_countdown) and the UI (DaysPage).
 */

// ============ TYPES ============
export interface CountdownCalculatorInput {
  /** Target date in YYYY-MM-DD format */
  eventDate: string;
  /** Optional name for the event */
  eventName?: string;
  /** Whether to include hours and minutes (for UI display) */
  includeTime?: boolean;
}

export interface CountdownCalculatorOutput {
  /** Name of the event */
  eventName: string;
  /** Target date in YYYY-MM-DD format */
  eventDate: string;
  /** Number of days until/since the event (negative if past) */
  days: number;
  /** Absolute number of days (always positive) */
  absoluteDays: number;
  /** Number of complete weeks */
  weeks: number;
  /** Approximate number of months */
  months: number;
  /** Number of hours remaining in the current day (only if includeTime is true) */
  hours?: number;
  /** Number of minutes remaining in the current hour (only if includeTime is true) */
  minutes?: number;
  /** Whether the event is in the past */
  isPast: boolean;
  /** Whether the event is today */
  isToday: boolean;
  /** Human-readable direction text */
  direction: 'until' | 'since' | 'today';
  /** Formatted summary text */
  summary: string;
}

// ============ CONSTANTS ============
/** Milliseconds in a day */
const MS_PER_DAY = 1000 * 60 * 60 * 24;
/** Milliseconds in an hour */
const MS_PER_HOUR = 1000 * 60 * 60;
/** Milliseconds in a minute */
const MS_PER_MINUTE = 1000 * 60;
/** Average days per month */
const DAYS_PER_MONTH = 30.44;

// ============ MAIN CALCULATOR ============
/**
 * Calculate countdown to/from a target date
 *
 * @param input - The countdown input with eventDate and optional eventName
 * @returns The countdown result with days, weeks, months, etc.
 * @throws Error if eventDate is invalid
 */
export function calculateCountdown(input: CountdownCalculatorInput): CountdownCalculatorOutput {
  const { eventDate, eventName = 'Event', includeTime = false } = input;

  // Parse the date
  const [year, month, day] = eventDate.split('-').map(Number);
  if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error('Invalid date format. Use YYYY-MM-DD');
  }

  // Create date objects
  const targetDate = new Date(year, month - 1, day);
  const now = new Date();

  // For day calculation, use midnight comparison
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetMidnight = new Date(year, month - 1, day);

  // Calculate difference in days
  const diffMs = targetMidnight.getTime() - todayMidnight.getTime();
  const days = Math.round(diffMs / MS_PER_DAY);
  const absoluteDays = Math.abs(days);

  // Calculate weeks and months
  const weeks = Math.floor(absoluteDays / 7);
  const months = Math.floor(absoluteDays / DAYS_PER_MONTH);

  // Determine status
  const isPast = days < 0;
  const isToday = days === 0;
  const direction: 'until' | 'since' | 'today' = isToday ? 'today' : isPast ? 'since' : 'until';

  // Calculate hours and minutes if requested
  let hours: number | undefined;
  let minutes: number | undefined;

  if (includeTime) {
    const fullDiffMs = targetDate.getTime() - now.getTime();
    const absDiffMs = Math.abs(fullDiffMs);
    hours = Math.floor((absDiffMs % MS_PER_DAY) / MS_PER_HOUR);
    minutes = Math.floor((absDiffMs % MS_PER_HOUR) / MS_PER_MINUTE);
  }

  // Generate summary
  let summary: string;
  if (isToday) {
    summary = `${eventName} is today! 🎉`;
  } else if (isPast) {
    summary = `${absoluteDays} days since ${eventName}`;
  } else {
    summary = `${absoluteDays} days until ${eventName}`;
  }

  return {
    eventName,
    eventDate,
    days,
    absoluteDays,
    weeks,
    months,
    hours,
    minutes,
    isPast,
    isToday,
    direction,
    summary,
  };
}

/**
 * Format a date string for display
 */
export function formatEventDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}


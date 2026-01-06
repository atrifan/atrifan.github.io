/**
 * Date Calculator Utility
 *
 * This is the SINGLE SOURCE OF TRUTH for date calculation logic.
 * Used by both the MCP API (/api/mcp when_date_info) and the UI (WhenPage.tsx).
 *
 * GUIDELINE FOR MODIFYING:
 * 1. Ensure MCP tool definition (tools-definitions.ts) matches the output
 * 2. Ensure MCP execution (route.ts) calls DateCalculator.calculate()
 * 3. Ensure UI component uses the same function
 * 4. Update outputSchema in tools-definitions.ts if return type changes
 */

export interface DateResult {
  // Core date info
  date: string;
  dayOfWeek: string;
  dayOfWeekShort: string;
  formattedDate: string;
  tense: 'past' | 'present' | 'future';
  message: string;
  // Days calculation
  daysFromToday: number;
  isPast: boolean;
  isFuture: boolean;
  isToday: boolean;
  // Time breakdowns
  totalHours: number;
  totalMinutes: number;
  weeks: number;
  // Calendar info
  isLeapYear: boolean;
  dayOfYear: number;
  weekOfYear: number;
  quarter: number;
  // Zodiac
  zodiacSign: string;
}

const DAYS_OF_WEEK = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export class DateCalculator {
  /**
   * Check if a year is a leap year
   */
  public static isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  /**
   * Get day of year (1-366)
   */
  public static getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  /**
   * Get week of year (1-53)
   */
  public static getWeekOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - start.getTime();
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    return Math.ceil((diff / oneWeek) + 1);
  }

  /**
   * Format date nicely
   */
  public static formatDate(date: Date): string {
    const day = date.getDate();
    const month = MONTHS[date.getMonth()];
    const year = date.getFullYear();
    
    // Add ordinal suffix
    const suffix = this.getOrdinalSuffix(day);
    
    return `${month} ${day}${suffix}, ${year}`;
  }

  /**
   * Get ordinal suffix (st, nd, rd, th)
   */
  private static getOrdinalSuffix(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  /**
   * Calculate days between two dates
   */
  public static daysBetween(date1: Date, date2: Date): number {
    const oneDay = 1000 * 60 * 60 * 24;
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.round((d2.getTime() - d1.getTime()) / oneDay);
  }

  /**
   * Get zodiac sign for a date
   */
  public static getZodiacSign(month: number, day: number): string {
    const signs = [
      { name: 'Capricorn', end: [1, 19] },
      { name: 'Aquarius', end: [2, 18] },
      { name: 'Pisces', end: [3, 20] },
      { name: 'Aries', end: [4, 19] },
      { name: 'Taurus', end: [5, 20] },
      { name: 'Gemini', end: [6, 20] },
      { name: 'Cancer', end: [7, 22] },
      { name: 'Leo', end: [8, 22] },
      { name: 'Virgo', end: [9, 22] },
      { name: 'Libra', end: [10, 22] },
      { name: 'Scorpio', end: [11, 21] },
      { name: 'Sagittarius', end: [12, 21] },
      { name: 'Capricorn', end: [12, 31] },
    ];

    for (const sign of signs) {
      if (month < sign.end[0] || (month === sign.end[0] && day <= sign.end[1])) {
        return sign.name;
      }
    }
    return 'Capricorn';
  }

  /**
   * Get quarter of year (1-4)
   */
  public static getQuarter(month: number): number {
    return Math.ceil(month / 3);
  }

  /**
   * Main calculation - get all info about a date
   * This is the SINGLE SOURCE OF TRUTH for date calculations
   */
  public static calculate(dateString: string): DateResult {
    // Parse date string (YYYY-MM-DD format)
    const [year, month, day] = dateString.split('-').map(Number);
    const targetDate = new Date(year, month - 1, day, 12, 0, 0);

    // Get today at midnight for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetMidnight = new Date(year, month - 1, day, 0, 0, 0);

    // Calculate days from today
    const daysFromToday = this.daysBetween(today, targetMidnight);

    // Boolean flags
    const isPast = daysFromToday < 0;
    const isFuture = daysFromToday > 0;
    const isToday = daysFromToday === 0;

    // Determine tense
    let tense: 'past' | 'present' | 'future';
    if (isToday) {
      tense = 'present';
    } else if (isPast) {
      tense = 'past';
    } else {
      tense = 'future';
    }

    // Time breakdowns
    const absDays = Math.abs(daysFromToday);
    const totalHours = absDays * 24;
    const totalMinutes = totalHours * 60;
    const weeks = Math.round((absDays / 7) * 10) / 10;

    // Get day of week
    const dayOfWeek = DAYS_OF_WEEK[targetDate.getDay()];
    const dayOfWeekShort = DAYS_SHORT[targetDate.getDay()];

    // Format date
    const formattedDate = this.formatDate(targetDate);

    // Build message
    let message: string;
    if (tense === 'present') {
      message = `Today is ${dayOfWeek}`;
    } else if (tense === 'past') {
      message = `${formattedDate} was a ${dayOfWeek}`;
    } else {
      message = `${formattedDate} will be a ${dayOfWeek}`;
    }

    return {
      date: dateString,
      dayOfWeek,
      dayOfWeekShort,
      formattedDate,
      tense,
      message,
      daysFromToday,
      isPast,
      isFuture,
      isToday,
      totalHours,
      totalMinutes,
      weeks,
      isLeapYear: this.isLeapYear(year),
      dayOfYear: this.getDayOfYear(targetDate),
      weekOfYear: this.getWeekOfYear(targetDate),
      quarter: this.getQuarter(month),
      zodiacSign: this.getZodiacSign(month, day),
    };
  }
}


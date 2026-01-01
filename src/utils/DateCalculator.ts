/**
 * Date Calculator Utility
 * Calculates day of week for any date, handles leap years correctly
 */

export interface DateResult {
  dayOfWeek: string;
  dayOfWeekShort: string;
  formattedDate: string;
  tense: 'past' | 'present' | 'future';
  message: string;
  daysFromToday: number;
  isLeapYear: boolean;
  dayOfYear: number;
  weekOfYear: number;
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
   * Main calculation - get all info about a date
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
    
    // Determine tense
    let tense: 'past' | 'present' | 'future';
    if (daysFromToday === 0) {
      tense = 'present';
    } else if (daysFromToday < 0) {
      tense = 'past';
    } else {
      tense = 'future';
    }
    
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
      dayOfWeek,
      dayOfWeekShort,
      formattedDate,
      tense,
      message,
      daysFromToday,
      isLeapYear: this.isLeapYear(year),
      dayOfYear: this.getDayOfYear(targetDate),
      weekOfYear: this.getWeekOfYear(targetDate),
    };
  }
}


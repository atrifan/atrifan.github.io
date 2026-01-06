/**
 * TapCalculator - Shared tap/click speed calculation logic for MCP and UI
 * Calculates tapping statistics and performance metrics
 */

// Types
export interface TapRecord {
  tapNumber: number;
  timestamp: number;
  interval: number | null; // ms since previous tap
  diff: number | null; // difference from previous interval
}

export interface TapStats {
  count: number;
  elapsedMs: number;
  elapsedSeconds: number;
  tapsPerSecond: number;
  tapsPerMinute: number;
  averageInterval: number | null;
  fastestInterval: number | null;
  slowestInterval: number | null;
  consistency: number | null; // 0-100, higher = more consistent
  rating: TapRating;
}

export type TapRating = 'legendary' | 'excellent' | 'great' | 'good' | 'average' | 'slow';

export interface TapRatingInfo {
  label: string;
  emoji: string;
  color: string;
  minTapsPerSecond: number;
}

// Rating thresholds based on taps per second
export const TAP_RATINGS: Record<TapRating, TapRatingInfo> = {
  legendary: { label: 'Legendary!', emoji: '🏆', color: '#fbbf24', minTapsPerSecond: 12 },
  excellent: { label: 'Excellent!', emoji: '⚡', color: '#a78bfa', minTapsPerSecond: 10 },
  great: { label: 'Great!', emoji: '🔥', color: '#f97316', minTapsPerSecond: 8 },
  good: { label: 'Good', emoji: '👍', color: '#22c55e', minTapsPerSecond: 6 },
  average: { label: 'Average', emoji: '😊', color: '#60a5fa', minTapsPerSecond: 4 },
  slow: { label: 'Keep Practicing', emoji: '💪', color: '#94a3b8', minTapsPerSecond: 0 },
};

/**
 * Calculate tap statistics from tap records
 */
export function calculateTapStats(taps: TapRecord[], elapsedMs: number): TapStats {
  const count = taps.length;
  const elapsedSeconds = elapsedMs / 1000;
  const elapsedMinutes = elapsedMs / 60000;

  const tapsPerSecond = elapsedSeconds > 0 ? count / elapsedSeconds : 0;
  const tapsPerMinute = elapsedMinutes > 0 ? count / elapsedMinutes : 0;

  // Get intervals (excluding first tap which has no interval)
  const intervals = taps
    .filter(t => t.interval !== null)
    .map(t => t.interval as number);

  const averageInterval = intervals.length > 0
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length
    : null;

  const fastestInterval = intervals.length > 0 ? Math.min(...intervals) : null;
  const slowestInterval = intervals.length > 0 ? Math.max(...intervals) : null;

  // Calculate consistency (standard deviation based)
  let consistency: number | null = null;
  if (intervals.length >= 2 && averageInterval !== null) {
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - averageInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    // Convert to 0-100 scale (lower stdDev = higher consistency)
    // Assuming stdDev of 0 = 100%, stdDev of 200+ = 0%
    consistency = Math.max(0, Math.min(100, 100 - (stdDev / 2)));
  }

  const rating = getTapRating(tapsPerSecond);

  return {
    count,
    elapsedMs,
    elapsedSeconds,
    tapsPerSecond,
    tapsPerMinute,
    averageInterval,
    fastestInterval,
    slowestInterval,
    consistency,
    rating,
  };
}

/**
 * Get rating based on taps per second
 */
export function getTapRating(tapsPerSecond: number): TapRating {
  if (tapsPerSecond >= TAP_RATINGS.legendary.minTapsPerSecond) return 'legendary';
  if (tapsPerSecond >= TAP_RATINGS.excellent.minTapsPerSecond) return 'excellent';
  if (tapsPerSecond >= TAP_RATINGS.great.minTapsPerSecond) return 'great';
  if (tapsPerSecond >= TAP_RATINGS.good.minTapsPerSecond) return 'good';
  if (tapsPerSecond >= TAP_RATINGS.average.minTapsPerSecond) return 'average';
  return 'slow';
}

/**
 * Get rating info
 */
export function getTapRatingInfo(rating: TapRating): TapRatingInfo {
  return TAP_RATINGS[rating];
}

/**
 * Format time in mm:ss.t format
 */
export function formatTapTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

/**
 * Format interval for display
 */
export function formatInterval(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Create a tap record
 */
export function createTapRecord(
  tapNumber: number,
  timestamp: number,
  previousTap: TapRecord | null
): TapRecord {
  const interval = previousTap ? timestamp - previousTap.timestamp : null;
  
  let diff: number | null = null;
  if (interval !== null && previousTap && previousTap.interval !== null) {
    diff = interval - previousTap.interval;
  }

  return {
    tapNumber,
    timestamp,
    interval,
    diff,
  };
}


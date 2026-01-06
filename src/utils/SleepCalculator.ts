/**
 * SleepCalculator - Shared sleep cycle calculation logic for MCP and UI
 * Calculates optimal sleep/wake times based on sleep cycles
 */

// Types
export type AgeGroup = 'adult' | 'teen' | 'child' | 'toddler' | 'infant';
export type SleepMode = 'sleepNow' | 'wakeAt' | 'sleepAt';
export type SleepQuality = 'optimal' | 'good' | 'fair' | 'poor';

export interface SleepRecommendation {
  min: number; // minimum hours
  max: number; // maximum hours
  optimal: number; // optimal hours
  cycleLength: number; // minutes per cycle
  fallAsleep: number; // minutes to fall asleep
}

export interface SleepResult {
  time: string; // HH:MM format
  cycles: number;
  hours: number;
  quality: SleepQuality;
}

export interface SleepCalculationResult {
  mode: SleepMode;
  ageGroup: AgeGroup;
  recommendation: SleepRecommendation;
  results: SleepResult[];
  inputTime: string | null; // The wake/sleep time input (null for sleepNow)
}

// Sleep recommendations by age group
export const SLEEP_RECOMMENDATIONS: Record<AgeGroup, SleepRecommendation> = {
  adult: { min: 7, max: 9, optimal: 8, cycleLength: 90, fallAsleep: 14 },
  teen: { min: 8, max: 10, optimal: 9, cycleLength: 90, fallAsleep: 15 },
  child: { min: 9, max: 12, optimal: 10, cycleLength: 90, fallAsleep: 20 },
  toddler: { min: 11, max: 14, optimal: 12, cycleLength: 60, fallAsleep: 20 },
  infant: { min: 12, max: 16, optimal: 14, cycleLength: 50, fallAsleep: 15 },
};

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  adult: 'Adult (18+)',
  teen: 'Teen (13-17)',
  child: 'Child (6-12)',
  toddler: 'Toddler (1-5)',
  infant: 'Infant (0-1)',
};

/**
 * Get sleep quality based on hours and age group
 */
export function getSleepQuality(hours: number, ageGroup: AgeGroup): SleepQuality {
  const rec = SLEEP_RECOMMENDATIONS[ageGroup];
  
  if (hours >= rec.min && hours <= rec.max) {
    const optimalDiff = Math.abs(hours - rec.optimal);
    if (optimalDiff <= 0.5) return 'optimal';
    if (optimalDiff <= 1) return 'good';
    return 'fair';
  } else if (hours >= rec.min - 1 && hours <= rec.max + 1) {
    return 'fair';
  }
  return 'poor';
}

/**
 * Calculate wake times when sleeping now
 */
export function calculateSleepNow(ageGroup: AgeGroup, currentTime?: Date): SleepCalculationResult {
  const rec = SLEEP_RECOMMENDATIONS[ageGroup];
  const now = currentTime || new Date();
  const sleepStart = new Date(now.getTime() + rec.fallAsleep * 60 * 1000);

  const results: SleepResult[] = [];
  const maxCycles = Math.ceil((rec.max * 60) / rec.cycleLength);
  const minCycles = Math.floor((rec.min * 60) / rec.cycleLength);

  for (let cycles = maxCycles; cycles >= Math.max(2, minCycles - 2); cycles--) {
    const sleepMinutes = cycles * rec.cycleLength;
    const hours = sleepMinutes / 60;
    const wake = new Date(sleepStart.getTime() + sleepMinutes * 60 * 1000);
    results.push({
      time: formatTime(wake),
      cycles,
      hours,
      quality: getSleepQuality(hours, ageGroup),
    });
  }

  return { mode: 'sleepNow', ageGroup, recommendation: rec, results, inputTime: null };
}

/**
 * Calculate sleep times for a target wake time
 */
export function calculateWakeAt(wakeTime: string, ageGroup: AgeGroup, referenceDate?: Date): SleepCalculationResult {
  const rec = SLEEP_RECOMMENDATIONS[ageGroup];
  const [hours, minutes] = wakeTime.split(':').map(Number);
  const wake = referenceDate ? new Date(referenceDate) : new Date();
  wake.setHours(hours, minutes, 0, 0);
  if (wake < new Date()) wake.setDate(wake.getDate() + 1);

  const results: SleepResult[] = [];
  const maxCycles = Math.ceil((rec.max * 60) / rec.cycleLength);
  const minCycles = Math.floor((rec.min * 60) / rec.cycleLength);

  for (let cycles = maxCycles; cycles >= Math.max(2, minCycles - 2); cycles--) {
    const sleepMinutes = cycles * rec.cycleLength;
    const sleepHours = sleepMinutes / 60;
    const sleep = new Date(wake.getTime() - sleepMinutes * 60 * 1000 - rec.fallAsleep * 60 * 1000);
    results.push({
      time: formatTime(sleep),
      cycles,
      hours: sleepHours,
      quality: getSleepQuality(sleepHours, ageGroup),
    });
  }

  return { mode: 'wakeAt', ageGroup, recommendation: rec, results, inputTime: wakeTime };
}

/**
 * Calculate wake times for a target sleep time
 */
export function calculateSleepAt(sleepTime: string, ageGroup: AgeGroup, referenceDate?: Date): SleepCalculationResult {
  const rec = SLEEP_RECOMMENDATIONS[ageGroup];
  const [hours, minutes] = sleepTime.split(':').map(Number);
  const sleep = referenceDate ? new Date(referenceDate) : new Date();
  sleep.setHours(hours, minutes, 0, 0);
  sleep.setMinutes(sleep.getMinutes() + rec.fallAsleep);

  const results: SleepResult[] = [];
  const maxCycles = Math.ceil((rec.max * 60) / rec.cycleLength);
  const minCycles = Math.floor((rec.min * 60) / rec.cycleLength);

  for (let cycles = maxCycles; cycles >= Math.max(2, minCycles - 2); cycles--) {
    const sleepMinutes = cycles * rec.cycleLength;
    const sleepHours = sleepMinutes / 60;
    const wake = new Date(sleep.getTime() + sleepMinutes * 60 * 1000);
    results.push({
      time: formatTime(wake),
      cycles,
      hours: sleepHours,
      quality: getSleepQuality(sleepHours, ageGroup),
    });
  }

  return { mode: 'sleepAt', ageGroup, recommendation: rec, results, inputTime: sleepTime };
}

/**
 * Format time as HH:MM
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Get quality info for display
 */
export function getQualityInfo(quality: SleepQuality): { label: string; emoji: string; color: string } {
  switch (quality) {
    case 'optimal': return { label: 'Optimal', emoji: '🌟', color: '#10b981' };
    case 'good': return { label: 'Good', emoji: '✅', color: '#22c55e' };
    case 'fair': return { label: 'Fair', emoji: '⚠️', color: '#eab308' };
    case 'poor': return { label: 'Not Recommended', emoji: '❌', color: '#ef4444' };
  }
}


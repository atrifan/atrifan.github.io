export type Sex = 'male' | 'female' | 'other';

export interface UserInput {
  age: number;
  sex: Sex;
  height: number; // in cm
  currentWeight: number; // in kg
  desiredWeight: number; // in kg
  timeToWeight?: number; // in weeks (calculated)
  targetDate?: string; // ISO date string if user selected a specific date
}

export interface BMIResult {
  value: number;
  category: string;
  color: 'info' | 'positive' | 'yellow' | 'negative';
}

export interface FastingPlan {
  name: string;
  description: string;
  schedule: string;
  icon: string;
}

export interface WeightLossPlan {
  currentBMI: BMIResult;
  targetBMI: BMIResult;
  idealWeight: number;
  weeksToGoal: number;
  targetDate: Date;
  dailyCalories: number;
  dailyDeficit: number;
  fastingPlan: FastingPlan;
  bmr: number;
  tdee: number;
}


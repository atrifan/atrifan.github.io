import { Sex, BMIResult, FastingPlan, WeightLossPlan, UserInput } from '../types';

/**
 * WeightCalculator class - handles all weight loss calculations
 */
export class WeightCalculator {
  private static readonly CALORIES_PER_KG = 7700;
  private static readonly MIN_WEEKLY_LOSS = 0.5; // kg

  /**
   * Calculate BMI (Body Mass Index)
   */
  public static calculateBMI(weight: number, height: number): number {
    const heightInMeters = height / 100;
    return weight / (heightInMeters * heightInMeters);
  }

  /**
   * Get BMI category and color
   */
  public static getBMIResult(bmi: number): BMIResult {
    if (bmi < 18.5) {
      return { value: bmi, category: 'Underweight', color: 'info' };
    }
    if (bmi < 25) {
      return { value: bmi, category: 'Normal weight', color: 'positive' };
    }
    if (bmi < 30) {
      return { value: bmi, category: 'Overweight', color: 'yellow' };
    }
    return { value: bmi, category: 'Obese', color: 'negative' };
  }

  /**
   * Calculate ideal weight using Devine formula
   */
  public static calculateIdealWeight(height: number, sex: Sex): number {
    const heightInInches = height / 2.54;
    const baseHeight = 60; // 5 feet

    if (sex === 'male') {
      return 50 + 2.3 * (heightInInches - baseHeight);
    } else if (sex === 'female') {
      return 45.5 + 2.3 * (heightInInches - baseHeight);
    } else {
      // Average of male and female for 'other'
      const male = 50 + 2.3 * (heightInInches - baseHeight);
      const female = 45.5 + 2.3 * (heightInInches - baseHeight);
      return (male + female) / 2;
    }
  }

  /**
   * Calculate Basal Metabolic Rate using Mifflin-St Jeor Equation
   */
  public static calculateBMR(weight: number, height: number, age: number, sex: Sex): number {
    // Mifflin-St Jeor: s = +5 for male, -161 for female, average (-78) for other
    const s = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
    return 10 * weight + 6.25 * height - 5 * age + s;
  }

  /**
   * Calculate Total Daily Energy Expenditure
   * Assumes moderate activity level (1.55 multiplier)
   */
  public static calculateTDEE(bmr: number): number {
    return bmr * 1.55; // Moderate activity level
  }

  /**
   * Calculate daily calorie deficit needed
   */
  public static calculateCalorieDeficit(currentWeight: number, targetWeight: number, weeks: number): number {
    const weightToLose = currentWeight - targetWeight;
    const totalCaloriesDeficit = weightToLose * this.CALORIES_PER_KG;
    const days = weeks * 7;
    return totalCaloriesDeficit / days;
  }

  /**
   * Calculate recommended time to reach target weight (in weeks)
   * Based on safe weight loss of 0.5-1 kg per week
   */
  public static calculateRecommendedWeeks(currentWeight: number, targetWeight: number): number {
    const weightToLose = currentWeight - targetWeight;
    const weeksAtSlowRate = weightToLose / this.MIN_WEEKLY_LOSS;
    return Math.ceil(weeksAtSlowRate);
  }

  /**
   * Get fasting plan recommendation based on calorie deficit
   */
  public static getFastingPlan(dailyCalorieDeficit: number): FastingPlan {
    if (dailyCalorieDeficit < 300) {
      return {
        name: '12:12 (Beginner)',
        description: '12 hours fasting, 12 hours eating window',
        schedule: 'Eat between 8 AM - 8 PM',
        icon: '🌅'
      };
    } else if (dailyCalorieDeficit < 500) {
      return {
        name: '14:10 (Moderate)',
        description: '14 hours fasting, 10 hours eating window',
        schedule: 'Eat between 10 AM - 8 PM',
        icon: '⏰'
      };
    } else if (dailyCalorieDeficit < 700) {
      return {
        name: '16:8 (Popular)',
        description: '16 hours fasting, 8 hours eating window',
        schedule: 'Eat between 12 PM - 8 PM',
        icon: '🍽️'
      };
    } else {
      return {
        name: '18:6 (Advanced)',
        description: '18 hours fasting, 6 hours eating window',
        schedule: 'Eat between 2 PM - 8 PM',
        icon: '💪'
      };
    }
  }

  /**
   * Calculate target date
   */
  public static calculateTargetDate(weeks: number): Date {
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + weeks * 7);
    return targetDate;
  }

  /**
   * Generate complete weight loss plan
   */
  public static generatePlan(input: UserInput): WeightLossPlan {
    const { age, sex, height, currentWeight, desiredWeight, timeToWeight, targetDate: inputTargetDate } = input;

    // Calculate BMI values
    const currentBMI = this.getBMIResult(this.calculateBMI(currentWeight, height));
    const targetBMI = this.getBMIResult(this.calculateBMI(desiredWeight, height));

    // Calculate ideal weight
    const idealWeight = this.calculateIdealWeight(height, sex);

    // Calculate metabolic rates
    const bmr = this.calculateBMR(currentWeight, height, age, sex);
    const tdee = this.calculateTDEE(bmr);

    // Determine weeks to goal
    const weeksToGoal = timeToWeight || this.calculateRecommendedWeeks(currentWeight, desiredWeight);

    // Calculate calorie deficit and daily calories
    const dailyDeficit = this.calculateCalorieDeficit(currentWeight, desiredWeight, weeksToGoal);
    const dailyCalories = Math.round(tdee - dailyDeficit);

    // Get fasting plan
    const fastingPlan = this.getFastingPlan(dailyDeficit);

    // Use user's selected target date if provided, otherwise calculate from weeks
    let targetDate: Date;
    if (inputTargetDate) {
      // Parse the date string and create date at noon to avoid timezone issues
      const [year, month, day] = inputTargetDate.split('-').map(Number);
      targetDate = new Date(year, month - 1, day, 12, 0, 0);
    } else {
      targetDate = this.calculateTargetDate(weeksToGoal);
    }

    return {
      currentBMI,
      targetBMI,
      idealWeight,
      weeksToGoal,
      targetDate,
      dailyCalories,
      dailyDeficit: Math.round(dailyDeficit),
      fastingPlan,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee)
    };
  }
}


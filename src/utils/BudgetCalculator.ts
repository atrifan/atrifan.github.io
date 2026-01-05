import {
  FullBudgetInput,
  SavingsPlan,
  MonthlyBreakdown,
  INTENSITY_MULTIPLIERS,
} from '../types/budget';

/**
 * Budget Calculator - Calculates savings plans and budget breakdowns
 */
export class BudgetCalculator {
  
  /**
   * Calculate a complete savings plan
   */
  static calculatePlan(input: FullBudgetInput): SavingsPlan {
    const monthlyNetIncome = input.monthlyIncome - input.monthlyTaxes;
    const monthlyDisposable = monthlyNetIncome - input.monthlyFixedExpenses;
    
    const amountToSave = input.savingsGoal - input.currentSavings;
    const warnings: string[] = [];
    const tips: string[] = [];
    
    // Calculate months to goal based on intensity or target date
    let monthsToGoal: number;
    let monthlyTargetSavings: number;
    
    if (input.targetDate) {
      const target = new Date(input.targetDate);
      const now = new Date();
      monthsToGoal = Math.max(1, this.monthsBetween(now, target));
      monthlyTargetSavings = amountToSave / monthsToGoal;
    } else {
      // Calculate based on intensity
      monthlyTargetSavings = monthlyDisposable * INTENSITY_MULTIPLIERS[input.intensity];
      monthsToGoal = Math.ceil(amountToSave / monthlyTargetSavings);
    }
    
    const monthlyBudgetForLiving = monthlyDisposable - monthlyTargetSavings;
    const weeklyBudgetForLiving = monthlyBudgetForLiving / 4.33;
    const dailyBudgetForLiving = monthlyBudgetForLiving / 30;
    
    // Check if achievable
    let isAchievable = true;
    if (monthlyTargetSavings > monthlyDisposable) {
      isAchievable = false;
      warnings.push('⚠️ Your savings goal exceeds your disposable income. Consider extending your timeline or reducing the goal.');
    }
    if (monthlyBudgetForLiving < 0) {
      isAchievable = false;
      warnings.push('⚠️ This plan leaves no budget for living expenses. Please adjust your parameters.');
    }
    if (monthlyBudgetForLiving < 200) {
      warnings.push('⚠️ Your living budget is very tight. Make sure this is sustainable for you.');
    }
    
    // Calculate target date
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + monthsToGoal);
    
    // Generate tips based on intensity
    tips.push(...this.generateTips(input.intensity, monthlyBudgetForLiving));
    
    // Calculate advanced expenses if provided
    let estimatedMonthlyDiningOut: number | undefined;
    let estimatedMonthlyGroceries: number | undefined;
    let potentialMonthlySavings: number | undefined;
    
    if (input.advancedMode && input.advancedExpenses) {
      const adv = input.advancedExpenses;
      
      // Estimate dining out costs
      const avgMealCost = (adv.burgerPrice + adv.pizzaPrice) / 2;
      const avgDrinkCost = (adv.waterPrice + adv.cokePrice + adv.beerPrice + adv.espressoPrice) / 4;
      estimatedMonthlyDiningOut = adv.weeklyDiningOut * (avgMealCost + avgDrinkCost * 2) * 4.33;
      
      // Estimate grocery costs
      const weeklyGroceries = 
        (adv.breadPrice * adv.weeklyBreadLoaves) +
        (adv.milkPrice * adv.weeklyMilkLiters) +
        (adv.waterPackPrice * adv.weeklyWaterPacks) +
        (adv.chickenPrice * adv.weeklyChickenKg);
      estimatedMonthlyGroceries = weeklyGroceries * 4.33;
      
      const totalEstimatedExpenses = estimatedMonthlyDiningOut + estimatedMonthlyGroceries;
      potentialMonthlySavings = monthlyBudgetForLiving - totalEstimatedExpenses;
      
      if (potentialMonthlySavings < 0) {
        warnings.push(`⚠️ Your estimated expenses (${Math.round(totalEstimatedExpenses)}) exceed your living budget. Consider reducing dining out.`);
      }
    }
    
    // Generate monthly breakdown
    const breakdown = this.generateBreakdown(input, monthsToGoal, monthlyTargetSavings, monthlyBudgetForLiving);
    
    return {
      monthlyNetIncome,
      monthlyDisposable,
      monthlyTargetSavings,
      monthlyBudgetForLiving,
      weeklyBudgetForLiving,
      dailyBudgetForLiving,
      monthsToGoal,
      targetDate,
      isAchievable,
      warnings,
      tips,
      breakdown,
      estimatedMonthlyDiningOut,
      estimatedMonthlyGroceries,
      potentialMonthlySavings,
    };
  }
  
  private static monthsBetween(d1: Date, d2: Date): number {
    return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  }
  
  private static generateTips(intensity: string, _budget: number): string[] {
    const tips: string[] = [];
    
    if (intensity === 'aggressive') {
      tips.push('🍳 Cook at home - eating out is the #1 budget killer');
      tips.push('☕ Make coffee at home - save €3-5 per day');
      tips.push('🚶 Walk or bike when possible - save on transport');
      tips.push('📱 Review subscriptions - cancel unused ones');
      tips.push('🛒 Meal prep on Sundays - reduces impulse food spending');
    } else if (intensity === 'medium') {
      tips.push('🍽️ Limit dining out to weekends only');
      tips.push('☕ Treat yourself to 1-2 coffees out per week');
      tips.push('🎬 Use free entertainment options when possible');
      tips.push('🛒 Make a shopping list and stick to it');
    } else {
      tips.push('💡 Small changes add up - track your spending');
      tips.push('🎯 Set up automatic transfers to savings');
      tips.push('🏷️ Look for deals and discounts');
    }
    
    return tips;
  }
  
  private static generateBreakdown(
    input: FullBudgetInput,
    months: number,
    monthlySavings: number,
    livingBudget: number
  ): MonthlyBreakdown[] {
    const breakdown: MonthlyBreakdown[] = [];
    let cumulativeSavings = input.currentSavings;
    const now = new Date();

    // Continue until we reach the goal or hit 60 months max
    const maxMonths = Math.min(Math.max(months, 60), 60);

    for (let i = 0; i < maxMonths; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const newCumulativeSavings = cumulativeSavings + monthlySavings;

      breakdown.push({
        month: monthName,
        startBalance: cumulativeSavings,
        income: input.monthlyIncome,
        taxes: input.monthlyTaxes,
        fixedExpenses: input.monthlyFixedExpenses,
        estimatedLiving: livingBudget,
        targetSavings: monthlySavings,
        endBalance: newCumulativeSavings,
        cumulativeSavings: newCumulativeSavings,
      });

      cumulativeSavings = newCumulativeSavings;

      // Stop once we've reached or exceeded the goal
      if (cumulativeSavings >= input.savingsGoal) {
        break;
      }
    }

    return breakdown;
  }
}


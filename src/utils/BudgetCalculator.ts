import {
  FullBudgetInput,
  SavingsPlan,
  MonthlyBreakdown,
  INTENSITY_MULTIPLIERS,
  CompoundingFrequency,
} from '../types/budget';

/**
 * Budget Calculator - Calculates savings plans and budget breakdowns
 */
export class BudgetCalculator {

  /**
   * Calculate a complete savings plan
   */
  // Helper to round to 2 decimal places (for currency)
  private static round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  static calculatePlan(input: FullBudgetInput): SavingsPlan {
    const monthlyNetIncome = this.round2(input.monthlyIncome - input.monthlyTaxes);
    const monthlyDisposable = this.round2(monthlyNetIncome - input.monthlyFixedExpenses);

    const warnings: string[] = [];
    const tips: string[] = [];

    // Determine savings mode and calculate accordingly
    const savingsMode = input.savingsMode || 'goal';
    const hasInterest = Boolean(input.interest?.enabled && input.interest.annualRate > 0);

    let monthsToGoal: number;
    let monthlyTargetSavings: number;

    if (savingsMode === 'duration') {
      // Duration mode: save for X months, calculate final balance
      monthsToGoal = input.savingsDurationMonths || 12;
      monthlyTargetSavings = this.round2(monthlyDisposable * INTENSITY_MULTIPLIERS[input.intensity]);
    } else {
      // Goal mode: reach a target amount
      const savingsGoal = input.savingsGoal || 0;
      const amountToSave = savingsGoal - input.currentSavings;

      if (input.targetDate) {
        const target = new Date(input.targetDate);
        const now = new Date();
        monthsToGoal = Math.max(1, this.monthsBetween(now, target));

        // If interest is enabled, we need to calculate monthly savings accounting for compound interest
        if (hasInterest) {
          monthlyTargetSavings = this.round2(this.calculateMonthlySavingsWithInterest(
            input.currentSavings,
            savingsGoal,
            monthsToGoal,
            input.interest!.annualRate,
            input.interest!.compounding
          ));
        } else {
          monthlyTargetSavings = this.round2(amountToSave / monthsToGoal);
        }
      } else {
        // Calculate based on intensity
        monthlyTargetSavings = this.round2(monthlyDisposable * INTENSITY_MULTIPLIERS[input.intensity]);

        // Calculate months to goal (with or without interest)
        if (hasInterest) {
          monthsToGoal = this.calculateMonthsToGoalWithInterest(
            input.currentSavings,
            savingsGoal,
            monthlyTargetSavings,
            input.interest!.annualRate,
            input.interest!.compounding
          );
        } else {
          monthsToGoal = Math.ceil(amountToSave / monthlyTargetSavings);
        }
      }
    }

    const monthlyBudgetForLiving = this.round2(monthlyDisposable - monthlyTargetSavings);
    const weeklyBudgetForLiving = this.round2(monthlyBudgetForLiving / 4.33);
    const dailyBudgetForLiving = this.round2(monthlyBudgetForLiving / 30);

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

    // Add interest tip if enabled
    if (hasInterest) {
      tips.push(`💰 Your ${input.interest!.annualRate}% interest (${input.interest!.compounding} compounding) will help you reach your goal faster!`);
    }

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

    // Generate monthly breakdown with interest
    const breakdown = this.generateBreakdown(input, monthsToGoal, monthlyTargetSavings, monthlyBudgetForLiving);

    // Calculate totals from breakdown
    const finalBalance = breakdown.length > 0 ? breakdown[breakdown.length - 1].cumulativeSavings : input.currentSavings;
    const totalInterestEarned = breakdown.length > 0 ? breakdown[breakdown.length - 1].cumulativeInterest : 0;

    return {
      monthlyNetIncome,
      monthlyDisposable,
      monthlyTargetSavings,
      monthlyBudgetForLiving,
      weeklyBudgetForLiving,
      dailyBudgetForLiving,
      monthsToGoal,
      targetDate,
      savingsMode,
      finalBalance,
      interestEnabled: hasInterest,
      totalInterestEarned,
      annualInterestRate: hasInterest ? input.interest!.annualRate : undefined,
      compoundingFrequency: hasInterest ? input.interest!.compounding : undefined,
      isAchievable,
      warnings,
      tips,
      breakdown,
      estimatedMonthlyDiningOut,
      estimatedMonthlyGroceries,
      potentialMonthlySavings,
    };
  }

  /**
   * Calculate monthly interest rate based on compounding frequency
   */
  private static getMonthlyInterestRate(annualRate: number, compounding: CompoundingFrequency): number {
    const r = annualRate / 100; // Convert percentage to decimal

    switch (compounding) {
      case 'yearly':
        // Convert annual rate to effective monthly rate
        return Math.pow(1 + r, 1/12) - 1;
      case 'monthly':
        return r / 12;
      case 'daily':
        // Convert daily compounding to effective monthly rate (assuming 30 days)
        return Math.pow(1 + r/365, 30) - 1;
      default:
        return r / 12;
    }
  }

  /**
   * Calculate how many months to reach goal with compound interest
   */
  private static calculateMonthsToGoalWithInterest(
    currentSavings: number,
    goal: number,
    monthlySavings: number,
    annualRate: number,
    compounding: CompoundingFrequency
  ): number {
    const monthlyRate = this.getMonthlyInterestRate(annualRate, compounding);

    // Simulate month by month
    let balance = currentSavings;
    let months = 0;
    const maxMonths = 600; // 50 years max

    while (balance < goal && months < maxMonths) {
      balance = balance * (1 + monthlyRate) + monthlySavings;
      months++;
    }

    return months;
  }

  /**
   * Calculate required monthly savings to reach goal with interest
   */
  private static calculateMonthlySavingsWithInterest(
    currentSavings: number,
    goal: number,
    months: number,
    annualRate: number,
    compounding: CompoundingFrequency
  ): number {
    const monthlyRate = this.getMonthlyInterestRate(annualRate, compounding);

    // Future value of current savings
    const fvCurrent = currentSavings * Math.pow(1 + monthlyRate, months);

    // Amount needed from monthly contributions
    const amountNeeded = goal - fvCurrent;

    if (amountNeeded <= 0) {
      // Current savings + interest will exceed goal
      return 0;
    }

    // PMT formula: PMT = FV * r / ((1+r)^n - 1)
    if (monthlyRate === 0) {
      return amountNeeded / months;
    }

    const pmt = amountNeeded * monthlyRate / (Math.pow(1 + monthlyRate, months) - 1);
    return Math.max(0, pmt);
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
    let balance = input.currentSavings;
    let cumulativeInterest = 0;
    const now = new Date();

    const hasInterest = input.interest?.enabled && input.interest.annualRate > 0;
    const compounding = input.interest?.compounding || 'yearly';
    const annualRate = hasInterest ? input.interest!.annualRate / 100 : 0;
    const dailyRate = annualRate / 365;

    const savingsMode = input.savingsMode || 'goal';
    const savingsGoal = input.savingsGoal || 0;

    // For duration mode, use the specified months; for goal mode, continue until goal reached
    const maxMonths = savingsMode === 'duration'
      ? (input.savingsDurationMonths || 12)
      : Math.min(Math.max(months, 60), 60);

    // For yearly compounding: track months in current year cycle
    let monthsInCurrentYear = 0;
    let yearStartBalance = input.currentSavings; // Balance at start of current year cycle

    for (let i = 0; i < maxMonths; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      // Get days in this month
      const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

      const startBalance = balance;
      let interestEarned = 0;
      let newBalance: number;
      let displayTotal: number; // What to show in Total column (includes hypothetical interest for yearly)
      let nextMonthStart: number; // What the next month's Start should be

      if (hasInterest) {
        if (compounding === 'yearly') {
          // Yearly compounding: interest is only credited after 12 months
          // Show HYPOTHETICAL interest - what you'd get if you closed NOW
          //
          // Money is added at END of month, so:
          // - Month 1: Add $400 at end → 0 months of interest → $0 interest
          // - Month 2: $400 (from month 1) earns 1 month interest, add $400 at end
          // - Month 3: $400 earns 2 months, $400 earns 1 month, add $400 at end
          //
          // Formula: Interest on startBalance for 1 month (it's been there since last month end)
          // The new savings added this month earn 0 interest this month

          monthsInCurrentYear++;

          // Add monthly savings to get new principal balance (actual balance in account)
          const principalBalance = startBalance + monthlySavings;

          // Calculate hypothetical interest if you close the deposit at end of this month
          // Only the startBalance has earned interest (for monthsInCurrentYear months)
          // The new monthlySavings added this month earns 0 interest
          const hypotheticalInterest = startBalance * annualRate * (monthsInCurrentYear / 12);

          // Round to avoid floating point issues
          interestEarned = Math.round(hypotheticalInterest * 1000000) / 1000000;
          cumulativeInterest = interestEarned;

          // Total column shows principal + hypothetical interest (what you'd get if you closed now)
          displayTotal = principalBalance + interestEarned;

          // Check if we've completed a year (12 months)
          if (monthsInCurrentYear === 12) {
            // Credit the interest to the balance - next month starts with this
            nextMonthStart = principalBalance + interestEarned;

            // Reset for next year
            monthsInCurrentYear = 0;
            yearStartBalance = nextMonthStart;
          } else {
            // Before year end: next month starts with just the principal (no interest yet)
            nextMonthStart = principalBalance;
          }

          newBalance = displayTotal;

        } else if (compounding === 'daily') {
          // Daily compounding: interest compounds every day
          // Each day's interest is added to balance, next day earns on new balance
          // Monthly savings are added at the END of the month
          //
          // Example with $1000, 1% annual (daily rate = 0.00274%):
          // Day 1: 1000 × 0.0000274 = 0.0274 → balance = 1000.0274
          // Day 2: 1000.0274 × 0.0000274 = 0.0274007 → balance = 1000.0548
          // ... continues for all days in month
          // End of month: add monthly savings

          let dailyBalance = startBalance;
          let monthInterest = 0;

          for (let day = 0; day < daysInMonth; day++) {
            const dayInterest = dailyBalance * dailyRate;
            monthInterest += dayInterest;
            dailyBalance += dayInterest; // Compound: interest added to balance for next day
          }

          // Round to avoid floating point precision issues
          monthInterest = Math.round(monthInterest * 1000000) / 1000000;
          dailyBalance = Math.round(dailyBalance * 1000000) / 1000000;

          // Add monthly savings at end of month (after all daily interest calculated)
          interestEarned = monthInterest;
          newBalance = dailyBalance + monthlySavings;
          displayTotal = newBalance;
          nextMonthStart = newBalance;
          cumulativeInterest += interestEarned;

        } else {
          // Monthly compounding - interest credited each month on current balance
          const monthlyRate = annualRate / 12;
          interestEarned = startBalance * monthlyRate;
          newBalance = startBalance + interestEarned + monthlySavings;
          displayTotal = newBalance;
          nextMonthStart = newBalance;
          cumulativeInterest += interestEarned;
        }
      } else {
        newBalance = startBalance + monthlySavings;
        displayTotal = newBalance;
        nextMonthStart = newBalance;
      }

      // Round all values to avoid floating point display issues
      const roundedStartBalance = BudgetCalculator.round2(startBalance);
      const roundedInterest = Math.round(interestEarned * 1000000) / 1000000;
      const roundedTotal = BudgetCalculator.round2(displayTotal);
      const roundedCumulativeInterest = Math.round(cumulativeInterest * 1000000) / 1000000;

      breakdown.push({
        month: monthName,
        startBalance: roundedStartBalance,
        income: input.monthlyIncome,
        taxes: input.monthlyTaxes,
        fixedExpenses: input.monthlyFixedExpenses,
        estimatedLiving: livingBudget,
        targetSavings: monthlySavings,
        interestEarned: roundedInterest,
        endBalance: BudgetCalculator.round2(newBalance),
        cumulativeSavings: roundedTotal,
        cumulativeInterest: roundedCumulativeInterest,
      });

      balance = BudgetCalculator.round2(nextMonthStart);

      // For goal mode, stop once we've reached or exceeded the goal
      if (savingsMode === 'goal' && savingsGoal > 0 && balance >= savingsGoal) {
        break;
      }
    }

    return breakdown;
  }
}


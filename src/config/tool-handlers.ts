/**
 * Tool Handlers Registry
 *
 * This file contains all execute handlers for NATIVE tools.
 * Each tool's handler is registered here and looked up by name in route.ts.
 *
 * For non-NATIVE tools (MCP, REST, GQL, A2A), handlers are determined dynamically
 * based on tool type and configuration from the database.
 */

import { ToolExecuteHandler, ToolWidgetRenderer, ToolTextFormatter, ToolResult } from './tools-definitions';
import { clerkClient } from '@clerk/nextjs/server';

// Import all calculators and utilities
import { WeightCalculator } from '../utils/WeightCalculator';
import { BudgetCalculator } from '../utils/BudgetCalculator';
import { DateCalculator } from '../utils/DateCalculator';
import { EclipseCalculator, EclipseFilter, EclipseLocation } from '../utils/EclipseCalculator';
import { calculateTip, TipCalculatorInput, CalculatorMode, ServiceQuality, MoodLevel, BudgetSituation } from '../utils/TipCalculator';
import {
  calculateDonationEligibility, calculateBloodCompatibility, calculateBabyBloodType,
  DonationEligibilityInput, BloodCompatibilityInput, BabyBloodTypeInput,
  Gender, UnitSystem, BloodTypeABO, RhFactor
} from '../utils/BloodCalculator';
import { calculateFlip, FlipCalculatorInput, FlipMode } from '../utils/FlipCalculator';
import { calculateZone, ZoneCalculatorInput } from '../utils/ZoneCalculator';
import { calculateSpin, SpinCalculatorInput } from '../utils/SpinCalculator';
import { makeDecision, DecisionCalculatorInput, DecisionMode } from '../utils/DecisionCalculator';
import { calculateCountdown as calculateCountdownShared, CountdownCalculatorInput } from '../utils/CountdownCalculator';
import { calculateCycle as calculateCycleShared, CycleCalculatorInput } from '../utils/CycleCalculator';
import { convertUnits as convertUnitsShared, ConvertInput } from '../utils/UnitConverter';
import { calculateAge as calculateAgeShared, AgeCalculatorInput } from '../utils/AgeCalculator';
import { calculatePercent as calculatePercentShared, PercentCalculatorInput, PercentOperation } from '../utils/PercentCalculator';
import { generateLuckyNumber, LuckyNumberInput } from '../utils/LuckyNumberCalculator';
import { calculatePositionSize, PositionSizeInput, CalculationMode, TradeDirection } from '../utils/PositionSizeCalculator';
import { generateNames, NamesGeneratorInput, GeneratorMode, NameCategory, HumanNameType, PetType, Gender as NameGender } from '../utils/NamesGenerator';
import { getSignFromDate, getCompatibility, getSignInfo, ZodiacSign } from '../data/zodiac';
import {
  calculateFunnel, WORLD_POPULATION,
  EyeColor, HairColor, SkinTone, Ethnicity, BloodType, Handedness
} from '../data/percentiles';
import {
  TestMode, TEST_MODE_CONFIG, getQuestionsForMode, calculateIQScore, getIQLabel
} from '../data/iqQuestions';
import { calculateVibe, getVibeQuestions, VibeAnswer } from '../utils/VibeCalculator';
import { calculateSleepNow, calculateWakeAt, calculateSleepAt, getQualityInfo, AgeGroup, SleepMode } from '../utils/SleepCalculator';

// ============================================================================
// EXECUTE HANDLERS - All NATIVE tool handlers
// ============================================================================

export const executeHandlers: Record<string, ToolExecuteHandler> = {
  // ============ HEALTH & FITNESS ============
  calculate_ideal_weight: (args) => {
    const idealWeight = WeightCalculator.calculateIdealWeight(
      args.height as number,
      args.sex as 'male' | 'female' | 'other'
    );
    return { idealWeight: Math.round(idealWeight * 10) / 10, unit: 'kg' };
  },

  generate_weight_loss_plan: (args) => {
    const plan = WeightCalculator.generatePlan({
      age: args.age as number,
      sex: args.sex as 'male' | 'female' | 'other',
      height: args.height as number,
      currentWeight: args.currentWeight as number,
      desiredWeight: args.desiredWeight as number,
      timeToWeight: args.timeToWeight as number | undefined,
    });
    return {
      currentBMI: { value: plan.currentBMI.value.toFixed(1), category: plan.currentBMI.category },
      targetBMI: { value: plan.targetBMI.value.toFixed(1), category: plan.targetBMI.category },
      idealWeight: Math.round(plan.idealWeight),
      weeksToGoal: plan.weeksToGoal,
      targetDate: plan.targetDate.toISOString().split('T')[0],
      dailyCalories: plan.dailyCalories,
      dailyDeficit: plan.dailyDeficit,
      fastingPlan: plan.fastingPlan,
      bmr: plan.bmr,
      tdee: plan.tdee,
    };
  },

  blood_calculator: (args) => {
    const mode = args.calculatorMode as 'donation' | 'compatibility' | 'baby';
    if (!mode) {
      throw new Error('Missing required field: calculatorMode. Must be one of: donation, compatibility, baby');
    }

    if (mode === 'donation') {
      const missing: string[] = [];
      if (args.age === undefined) missing.push('age');
      if (args.weight === undefined) missing.push('weight');
      if (args.gender === undefined) missing.push('gender');
      const unitSystem = (args.unitSystem as UnitSystem) || 'metric';
      if (unitSystem === 'metric' && args.height === undefined) missing.push('height');
      if (unitSystem === 'imperial' && args.heightFeet === undefined && args.heightInches === undefined) {
        missing.push('heightFeet or heightInches');
      }
      if (missing.length > 0) {
        throw new Error(`Missing required fields for donation mode: ${missing.join(', ')}`);
      }

      const input: DonationEligibilityInput = {
        age: args.age as number,
        weight: args.weight as number,
        height: args.height as number,
        gender: args.gender as Gender,
        unitSystem,
        heightFeet: args.heightFeet as number | undefined,
        heightInches: args.heightInches as number | undefined,
      };
      const result = calculateDonationEligibility(input);
      return { calculatorMode: 'donation', ...result };
    }

    if (mode === 'compatibility') {
      const missing: string[] = [];
      if (args.bloodType === undefined) missing.push('bloodType');
      if (args.rhFactor === undefined) missing.push('rhFactor');
      if (missing.length > 0) {
        throw new Error(`Missing required fields for compatibility mode: ${missing.join(', ')}`);
      }

      const input: BloodCompatibilityInput = {
        bloodType: args.bloodType as BloodTypeABO,
        rhFactor: args.rhFactor as RhFactor,
      };
      const result = calculateBloodCompatibility(input);
      return { calculatorMode: 'compatibility', ...result };
    }

    if (mode === 'baby') {
      const missing: string[] = [];
      if (args.fatherBloodType === undefined) missing.push('fatherBloodType');
      if (args.fatherRh === undefined) missing.push('fatherRh');
      if (args.motherBloodType === undefined) missing.push('motherBloodType');
      if (args.motherRh === undefined) missing.push('motherRh');
      if (missing.length > 0) {
        throw new Error(`Missing required fields for baby mode: ${missing.join(', ')}`);
      }

      const input: BabyBloodTypeInput = {
        fatherBloodType: args.fatherBloodType as BloodTypeABO,
        fatherRh: args.fatherRh as RhFactor,
        motherBloodType: args.motherBloodType as BloodTypeABO,
        motherRh: args.motherRh as RhFactor,
      };
      const result = calculateBabyBloodType(input);
      return { calculatorMode: 'baby', ...result };
    }

    throw new Error(`Invalid calculatorMode: ${mode}. Must be one of: donation, compatibility, baby`);
  },

  // ============ FINANCE ============
  calculate_savings_plan: (args) => {
    const savingsMode = (args.savingsMode as 'goal' | 'duration') || 'goal';
    const interestConfig = args.interestEnabled ? {
      enabled: true,
      annualRate: (args.interestRate as number) || 0,
      compounding: (args.compoundingFrequency as 'yearly' | 'monthly' | 'daily') || 'yearly',
    } : undefined;

    const plan = BudgetCalculator.calculatePlan({
      monthlyIncome: args.monthlyIncome as number,
      monthlyTaxes: (args.monthlyTaxes as number) || 0,
      monthlyFixedExpenses: args.monthlyFixedExpenses as number,
      currentSavings: args.currentSavings as number,
      savingsMode,
      savingsGoal: savingsMode === 'goal' ? (args.savingsGoal as number) : undefined,
      savingsDurationMonths: savingsMode === 'duration' ? (args.savingsDurationMonths as number) : undefined,
      intensity: args.intensity as 'light' | 'medium' | 'aggressive',
      currency: args.currency as 'EUR' | 'USD' | 'GBP' | 'RON' | 'JPY',
      advancedMode: false,
      interest: interestConfig,
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    return {
      savingsMode: plan.savingsMode,
      monthlyNetIncome: round2(plan.monthlyNetIncome),
      monthlyDisposable: round2(plan.monthlyDisposable),
      monthlyTargetSavings: round2(plan.monthlyTargetSavings),
      monthlyBudgetForLiving: round2(plan.monthlyBudgetForLiving),
      weeklyBudgetForLiving: round2(plan.weeklyBudgetForLiving),
      dailyBudgetForLiving: round2(plan.dailyBudgetForLiving),
      monthsToGoal: plan.monthsToGoal,
      targetDate: plan.targetDate.toISOString().split('T')[0],
      finalBalance: round2(plan.finalBalance),
      interestEnabled: plan.interestEnabled,
      totalInterestEarned: round2(plan.totalInterestEarned),
      annualInterestRate: plan.annualInterestRate,
      compoundingFrequency: plan.compoundingFrequency,
      isAchievable: plan.isAchievable,
      tips: plan.tips,
      warnings: plan.warnings,
      savingsRate: round2((plan.monthlyTargetSavings / plan.monthlyDisposable) * 100),
    };
  },

  calculate_tip: (args) => {
    const input: TipCalculatorInput = {
      billAmount: args.billAmount as number,
      tipPercentage: args.tipPercentage as number | undefined,
      splitBetween: args.splitBetween as number | undefined,
      calculatorMode: args.calculatorMode as CalculatorMode | undefined,
      serviceQuality: args.serviceQuality as ServiceQuality | number | undefined,
      mood: args.mood as MoodLevel | number | undefined,
      budgetSituation: args.budgetSituation as BudgetSituation | number | undefined,
    };
    const result = calculateTip(input);
    return {
      billAmount: result.billAmount,
      tipPercent: result.tipPercentage,
      tipAmount: result.tipAmount,
      total: result.total,
      perPerson: result.perPerson,
      splitWays: result.splitBetween,
      calculatorMode: result.calculatorMode,
      suggested: result.suggested,
    };
  },

  calculate_percentage: (args) => {
    const input: PercentCalculatorInput = {
      operation: args.operation as PercentOperation,
      value1: args.value1 as number,
      value2: args.value2 as number,
    };
    return calculatePercentShared(input);
  },

  calculate_position_size: (args) => {
    const input: PositionSizeInput = {
      mode: (args.mode as CalculationMode) || 'riskAndSL',
      capital: args.capital as number,
      entryPrice: args.entryPrice as number,
      direction: args.direction as TradeDirection,
      riskPercent: args.riskPercent as number | undefined,
      stopLossPrice: args.stopLossPrice as number | undefined,
      quantity: args.quantity as number | undefined,
    };
    return calculatePositionSize(input);
  },

  // ============ DATE & TIME ============
  calculate_age: (args) => {
    const input: AgeCalculatorInput = {
      birthDate: args.birthDate as string,
    };
    return calculateAgeShared(input);
  },

  calculate_countdown: (args) => {
    const input: CountdownCalculatorInput = {
      eventDate: args.eventDate as string,
      eventName: args.eventName as string | undefined,
    };
    return calculateCountdownShared(input);
  },

  calculate_cycle: (args) => {
    const dateInput = (args.date as string) || (args.lastPeriodDate as string);
    if (!dateInput) {
      throw new Error('Either date or lastPeriodDate is required');
    }
    const input: CycleCalculatorInput = {
      date: dateInput,
      isFirstDay: args.isFirstDay !== false,
      simplified: args.simplified === true,
      cycleLength: args.cycleLength as number | undefined,
      periodLength: args.periodLength as number | undefined,
    };
    return calculateCycleShared(input);
  },

  when_date_info: (args) => {
    const dateStr = args.date as string;
    if (!dateStr) {
      throw new Error('Missing required field: date (YYYY-MM-DD format)');
    }
    return DateCalculator.calculate(dateStr);
  },

  zone_calculator: (args) => {
    const input: ZoneCalculatorInput = {
      time: args.time as string,
      fromTimezone: args.fromTimezone as string,
      toTimezones: args.toTimezones as string[],
    };
    return calculateZone(input);
  },

  sleep_calculator: (args) => {
    const mode = (args.calculatorMode as SleepMode) || 'sleepNow';
    const ageGroup = (args.ageGroup as AgeGroup) || 'adult';
    const targetTime = args.targetTime as string | undefined;

    let result;
    switch (mode) {
      case 'sleepNow':
        result = calculateSleepNow(ageGroup);
        break;
      case 'wakeAt':
        if (!targetTime) throw new Error('targetTime is required for wakeAt mode');
        result = calculateWakeAt(targetTime, ageGroup);
        break;
      case 'sleepAt':
        if (!targetTime) throw new Error('targetTime is required for sleepAt mode');
        result = calculateSleepAt(targetTime, ageGroup);
        break;
      default:
        throw new Error(`Invalid calculatorMode: ${mode}`);
    }

    const enhancedResults = result.results.map(r => ({
      ...r,
      ...getQualityInfo(r.quality),
    }));

    return {
      mode: result.mode,
      ageGroup: result.ageGroup,
      recommendation: result.recommendation,
      results: enhancedResults,
      inputTime: result.inputTime,
    };
  },

  // ============ ASTRONOMY ============
  find_next_eclipse: (args) => {
    const filterType = (args.type as EclipseFilter) || 'any';
    const lat = args.latitude as number | undefined;
    const lon = args.longitude as number | undefined;
    const location: EclipseLocation | undefined = (lat !== undefined && lon !== undefined)
      ? { latitude: lat, longitude: lon }
      : undefined;

    const result = EclipseCalculator.findNextEclipse(filterType, location);
    if (!result) {
      return { error: 'No upcoming eclipses found' };
    }
    return result;
  },

  list_upcoming_eclipses: (args) => {
    const count = Math.min(Math.max((args.count as number) || 5, 1), 10);
    const filterType = (args.type as EclipseFilter) || 'any';
    const lat = args.latitude as number | undefined;
    const lon = args.longitude as number | undefined;
    const location: EclipseLocation | undefined = (lat !== undefined && lon !== undefined)
      ? { latitude: lat, longitude: lon }
      : undefined;

    return EclipseCalculator.listUpcomingEclipses(filterType, count, location);
  },

  // ============ CONVERSION ============
  convert_units: (args) => {
    const input: ConvertInput = {
      value: args.value as number,
      from: args.from as string,
      to: args.to as string,
    };
    const convResult = convertUnitsShared(input);
    return {
      value: convResult.value,
      from: convResult.from,
      to: convResult.to,
      result: convResult.result,
    };
  },

  // ============ RANDOM & FUN ============
  flip_tool: (args) => {
    const input: FlipCalculatorInput = {
      flipMode: args.flipMode as FlipMode | undefined,
      count: args.count as number | undefined,
      sides: args.sides as number | undefined,
    };
    return calculateFlip(input);
  },

  spin_wheel: (args) => {
    const input: SpinCalculatorInput = {
      options: args.options as string[],
    };
    return calculateSpin(input);
  },

  make_decision: (args) => {
    const input: DecisionCalculatorInput = {
      mode: (args.mode as DecisionMode) || 'pickOne',
      options: args.options as string[] | undefined,
      weights: args.weights as number[] | undefined,
    };
    return makeDecision(input);
  },

  lucky_number: (args) => {
    const input: LuckyNumberInput = {
      min: args.min as number | undefined,
      max: args.max as number | undefined,
      count: args.count as number | undefined,
    };
    return generateLuckyNumber(input);
  },

  generate_names: (args) => {
    const input: NamesGeneratorInput = {
      mode: (args.mode as GeneratorMode) || 'names',
      nameCategory: args.nameCategory as NameCategory | undefined,
      humanNameType: args.humanNameType as HumanNameType | undefined,
      petType: args.petType as PetType | undefined,
      gender: args.gender as NameGender | undefined,
      min: args.min as number | undefined,
      max: args.max as number | undefined,
      count: args.count as number | undefined,
    };
    return generateNames(input);
  },

  // ============ ZODIAC ============
  zodiac_compatibility: (args) => {
    const signFromDate = (date: string): ZodiacSign => {
      const [, m, d] = date.split('-').map(Number);
      return getSignFromDate(m, d);
    };

    let zodiacSign1: ZodiacSign;
    if (args.sign1) {
      zodiacSign1 = (args.sign1 as string).toLowerCase() as ZodiacSign;
    } else if (args.date1) {
      zodiacSign1 = signFromDate(args.date1 as string);
    } else {
      throw new Error('Either sign1 or date1 is required');
    }

    let zodiacSign2: ZodiacSign;
    if (args.sign2) {
      zodiacSign2 = (args.sign2 as string).toLowerCase() as ZodiacSign;
    } else if (args.date2) {
      zodiacSign2 = signFromDate(args.date2 as string);
    } else {
      throw new Error('Either sign2 or date2 is required');
    }

    const compat = getCompatibility(zodiacSign1, zodiacSign2);
    const info1 = getSignInfo(zodiacSign1);
    const info2 = getSignInfo(zodiacSign2);
    return {
      person1: { sign: zodiacSign1, name: info1?.name, symbol: info1?.symbol, element: info1?.element },
      person2: { sign: zodiacSign2, name: info2?.name, symbol: info2?.symbol, element: info2?.element },
      compatibility: compat,
      level: compat >= 80 ? 'Excellent' : compat >= 60 ? 'Good' : compat >= 40 ? 'Moderate' : 'Challenging',
    };
  },

  // ============ QUIZZES ============
  vibe_quiz: (args) => {
    const answers = (args.answers as string[]) || [];
    const vibeAnswers: VibeAnswer[] = answers.map(a => (a === 'A' || a === 'B') ? a : null);
    const result = calculateVibe(vibeAnswers);
    return {
      type: result.type,
      percentage: result.percentage,
      catScore: result.catScore,
      dogScore: result.dogScore,
      title: result.title,
      description: result.description,
      emoji: result.emoji,
      color: result.color,
      totalQuestions: getVibeQuestions().length,
    };
  },

  calculate_iq_score: (args) => {
    const testMode = (args.testMode as TestMode) || 'quick';
    const modeConfig = TEST_MODE_CONFIG[testMode];
    const questions = getQuestionsForMode(testMode);
    const totalQuestions = questions.length;

    const answersArray = args.answers as number[] | undefined;
    if (answersArray && answersArray.length > 0) {
      const result = calculateIQScore(answersArray, questions);
      const labelInfo = getIQLabel(result.iq);
      return {
        testMode,
        testInfo: { name: modeConfig.name, questionCount: modeConfig.questionCount, estimatedMinutes: modeConfig.estimatedMinutes, emoji: modeConfig.emoji },
        iqScore: result.iq,
        category: labelInfo.label,
        emoji: labelInfo.emoji,
        color: labelInfo.color,
        percentile: result.percentile,
        correctAnswers: result.correctCount,
        totalQuestions,
        accuracy: Math.round((result.correctCount / totalQuestions) * 100),
        categoryScores: result.categoryScores,
      };
    }

    const correct = (args.correctAnswers as number) || 0;
    const percentage = totalQuestions > 0 ? correct / totalQuestions : 0;
    const iq = Math.round(70 + percentage * 75);
    const labelInfo = getIQLabel(iq);

    const z = (iq - 100) / 15;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    const percentile = Math.round((z > 0 ? 1 - p : p) * 100);

    return {
      testMode,
      testInfo: { name: modeConfig.name, questionCount: modeConfig.questionCount, estimatedMinutes: modeConfig.estimatedMinutes, emoji: modeConfig.emoji },
      iqScore: iq,
      category: labelInfo.label,
      emoji: labelInfo.emoji,
      color: labelInfo.color,
      percentile,
      correctAnswers: correct,
      totalQuestions,
      accuracy: Math.round(percentage * 100),
    };
  },

  // ============ UNIQUENESS ============
  calculate_uniqueness: (args) => {
    const ageMonths = args.ageMonths as number | undefined;
    const ageYears = args.age as number | undefined;
    const age = ageMonths !== undefined ? ageMonths / 12 : (ageYears ?? null);
    const isBabyMode = age !== null && age < 2;

    const gender = (args.gender as 'male' | 'female') || null;
    const heightCm = (args.heightCm as number) || null;
    const weightKg = (args.weightKg as number) || null;
    const eyeColor = (args.eyeColor as EyeColor) || null;
    const hairColor = (args.hairColor as HairColor) || null;
    const skinTone = (args.skinTone as SkinTone) || null;
    const ethnicity = (args.ethnicity as Ethnicity) || null;
    const bloodType = (args.bloodType as BloodType) || null;
    const handedness = (args.handedness as Handedness) || null;

    const funnelSteps = calculateFunnel(
      age, gender, heightCm, weightKg,
      eyeColor, hairColor, skinTone, ethnicity, bloodType, handedness
    );

    const finalStep = funnelSteps[funnelSteps.length - 1];
    const matchingPeople = finalStep?.population ?? WORLD_POPULATION;
    const uniquenessRatio = WORLD_POPULATION / matchingPeople;

    const steps = funnelSteps.map(step => ({
      dimension: step.dimension,
      label: step.label,
      description: step.description,
      population: step.population,
      percentage: Math.round(step.percentage * 100) / 100,
    }));

    return {
      worldPopulation: WORLD_POPULATION,
      matchingPeople,
      rarity: `1 in ${Math.round(uniquenessRatio).toLocaleString()}`,
      isBabyMode,
      steps,
    };
  },

  // ============ NOTIFICATIONS ============
  send_push_notification: async (args, context) => {
    if (!context?.userId) {
      return { success: false, sent: 0, failed: 0, message: 'User not authenticated' };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || process.env.NEXT_PUBLIC_HOST || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    try {
      const response = await fetch(`${baseUrl}/api/push/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Call': process.env.INTERNAL_API_SECRET || '',
        },
        body: JSON.stringify({
          userId: context.userId,
          title: args.title as string,
          body: args.body as string,
          data: {
            url: args.url as string,
            type: args.type as string || 'info',
            automationId: args.automationId as string,
            executionId: args.executionId as string,
          },
          tag: args.tag as string,
          requireInteraction: args.requireInteraction as boolean,
          // Send to all channels by default (don't filter by type) - matches CLI behavior
          channels: args.channels as string[] || ['all'],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, sent: 0, failed: 0, message: error.error || 'Failed to send notification' };
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        sent: 0,
        failed: 0,
        message: error instanceof Error ? error.message : 'Failed to send notification'
      };
    }
  },

  send_email: async (args, context) => {
    if (!context?.userId) {
      return { success: false, error: 'User not authenticated' };
    }

    // If no 'to' address provided, get user's email from Clerk
    let toEmail = args.to as string;
    if (!toEmail) {
      try {
        const clerk = await clerkClient();
        const user = await clerk.users.getUser(context.userId);
        toEmail = user.emailAddresses?.[0]?.emailAddress || '';
        if (!toEmail) {
          return { success: false, error: 'No email address found for user' };
        }
      } catch (e) {
        return { success: false, error: 'Failed to fetch user email' };
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || process.env.NEXT_PUBLIC_HOST || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    try {
      const response = await fetch(`${baseUrl}/api/email/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Call': process.env.INTERNAL_API_SECRET || '',
          'X-User-Id': context.userId,
        },
        body: JSON.stringify({
          to: toEmail,
          subject: args.subject as string,
          body: args.body as string,
          isHtml: args.isHtml as boolean,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to send email' };
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email'
      };
    }
  },
};

// ============================================================================
// WIDGET RENDERERS (Claude Desktop)
// Each renderer returns the inner HTML content for the widget card
// ============================================================================

export const widgetRenderers: Record<string, ToolWidgetRenderer> = {
  // BMI Calculator
  calculate_bmi: (data) => {
    const bmi = Number(data.bmi).toFixed(1);
    const category = data.category as string;
    const colorMap: Record<string, string> = { underweight: '#60a5fa', normal: '#10b981', overweight: '#f59e0b', obese: '#ef4444' };
    const color = colorMap[category?.toLowerCase()] || '#fff';
    return `
      <div class="header">📏 BMI Calculator</div>
      <div class="big-number" style="color:${color}">${bmi}</div>
      <div class="label" style="background:${color}33;color:${color}">${category}</div>
      ${data.weight || data.height ? `<div class="stats">
        ${data.weight ? `<div class="stat-box"><div class="stat-label">Weight</div><div class="stat-value">${data.weight} kg</div></div>` : ''}
        ${data.height ? `<div class="stat-box"><div class="stat-label">Height</div><div class="stat-value">${data.height} cm</div></div>` : ''}
      </div>` : ''}`;
  },

  // Tip Calculator
  calculate_tip: (data) => `
    <div class="header">💵 Tip Calculator</div>
    <div class="big-number" style="color:#10b981">$${Number(data.total).toFixed(2)}</div>
    <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Total with ${data.tipPercent}% tip</div>
    <div class="stats">
      <div class="stat-box"><div class="stat-label">Bill</div><div class="stat-value">$${data.billAmount}</div></div>
      <div class="stat-box"><div class="stat-label">Tip</div><div class="stat-value">$${Number(data.tipAmount).toFixed(2)}</div></div>
      ${(data.splitWays as number) > 1 ? `<div class="stat-box" style="grid-column:span 2"><div class="stat-label">Per Person (${data.splitWays} ways)</div><div class="stat-value">$${Number(data.perPerson).toFixed(2)}</div></div>` : ''}
    </div>`,

  // Flip Calculator (coin/dice)
  flip_coin: (data) => {
    if (data.flipMode === 'dice') {
      const rolls = data.rolls as number[];
      const diceEmoji = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      return `
        <div class="header">🎲 Dice Roll</div>
        <div style="text-align:center;font-size:3rem;margin:1rem 0">${rolls.map(r => (data.sides === 6 && r <= 6) ? diceEmoji[r] : r).join(' ')}</div>
        <div class="big-number" style="color:#a78bfa">${data.total}</div>
        <div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">Total from ${rolls.length} ${data.sides}-sided dice</div>`;
    }
    const result = data.result as string;
    const count = data.count as number;
    const headsCount = data.headsCount as number;
    const tailsCount = data.tailsCount as number;
    const isHeads = result === 'heads';
    const coinColor = isHeads ? '#fbbf24' : '#9ca3af';
    const coinBg = isHeads ? 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #d97706 100%)' : 'linear-gradient(135deg, #f3f4f6 0%, #9ca3af 50%, #6b7280 100%)';
    return `
      <div class="header">🪙 Coin Flip</div>
      <div style="text-align:center;margin:1rem 0">
        <div style="width:80px;height:80px;border-radius:50%;background:${coinBg};display:inline-flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.3);border:3px solid ${isHeads ? '#b45309' : '#4b5563'}">
          <span style="font-size:2rem;font-weight:800;color:${isHeads ? '#92400e' : '#374151'}">${isHeads ? 'H' : 'T'}</span>
        </div>
      </div>
      <div class="big-number" style="color:${coinColor};font-size:2rem">${result.toUpperCase()}</div>
      ${count > 1 ? `
      <div class="stats">
        <div class="stat-box"><div class="stat-label">Heads</div><div class="stat-value" style="color:#fbbf24">${headsCount}</div></div>
        <div class="stat-box"><div class="stat-label">Tails</div><div class="stat-value" style="color:#9ca3af">${tailsCount}</div></div>
      </div>` : ''}`;
  },

  // Age Calculator
  calculate_age: (data) => `
    <div class="header">🎂 Age Calculator</div>
    <div class="big-number" style="color:#f472b6">${data.years}</div>
    <div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">Years Old</div>
    <div class="stats">
      <div class="stat-box"><div class="stat-label">Months</div><div class="stat-value">${data.months}</div></div>
      <div class="stat-box"><div class="stat-label">Days</div><div class="stat-value">${data.days}</div></div>
      <div class="stat-box"><div class="stat-label">Total Days</div><div class="stat-value">${Number(data.totalDays).toLocaleString()}</div></div>
      <div class="stat-box"><div class="stat-label">Next Birthday</div><div class="stat-value">${data.daysUntilNextBirthday} days</div></div>
    </div>`,

  // Zodiac Compatibility
  zodiac_compatibility: (data) => {
    const p1 = (data.person1 || { sign: '?', name: 'Unknown', symbol: '⭐' }) as { sign: string; name: string; symbol: string };
    const p2 = (data.person2 || { sign: '?', name: 'Unknown', symbol: '⭐' }) as { sign: string; name: string; symbol: string };
    const compat = (data.compatibility as number) || 50;
    const color = compat >= 80 ? '#10b981' : compat >= 60 ? '#fbbf24' : '#ef4444';
    return `
      <div class="header">💕 Zodiac Compatibility</div>
      <div style="display:flex;justify-content:center;align-items:center;gap:1rem;margin:1rem 0">
        <div style="text-align:center"><div style="font-size:2.5rem">${p1.symbol || '⭐'}</div><div style="color:#fff;font-size:0.8rem">${p1.name || 'Unknown'}</div></div>
        <div style="font-size:2rem">❤️</div>
        <div style="text-align:center"><div style="font-size:2.5rem">${p2.symbol || '⭐'}</div><div style="color:#fff;font-size:0.8rem">${p2.name || 'Unknown'}</div></div>
      </div>
      <div class="big-number" style="color:${color}">${compat}%</div>
      <div class="label" style="background:${color}33;color:${color}">${data.level || 'Moderate'}</div>`;
  },

  // Countdown
  calculate_countdown: (data) => {
    const isPast = data.isPast as boolean;
    const isToday = data.isToday as boolean;
    const absDays = data.absoluteDays ?? Math.abs(data.days as number);
    if (isToday) {
      return `
        <div class="header">⏳ Countdown</div>
        <div style="text-align:center;color:#fff;font-size:1.1rem;margin-bottom:0.5rem">${data.eventName}</div>
        <div class="big-number" style="color:#10b981">🎉</div>
        <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Today!</div>`;
    }
    return `
      <div class="header">⏳ Countdown</div>
      <div style="text-align:center;color:#fff;font-size:1.1rem;margin-bottom:0.5rem">${data.eventName}</div>
      <div class="big-number" style="color:${isPast ? '#94a3b8' : '#06b6d4'}">${absDays}</div>
      <div class="label" style="background:rgba(6,182,212,0.2);color:#06b6d4">days ${isPast ? 'ago' : 'to go'}</div>
      <div class="stats">
        <div class="stat-box"><div class="stat-label">Weeks</div><div class="stat-value">${data.weeks}</div></div>
        <div class="stat-box"><div class="stat-label">Months</div><div class="stat-value">${data.months}</div></div>
      </div>`;
  },

  // Decision Maker
  make_decision: (data) => {
    const icon = data.icon || '🎱';
    const mode = data.mode as string;
    const modeLabel = mode === 'yesNo' ? 'Yes/No Oracle' : mode === 'weighted' ? 'Weighted Choice' : 'Random Pick';
    return `
      <div class="header">🎱 Decision Maker</div>
      <div style="text-align:center;font-size:4rem;margin:1rem 0">${icon}</div>
      <div class="big-number" style="color:#a78bfa;font-size:1.8rem">${data.decision}</div>
      <div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">${modeLabel}</div>
      ${data.totalOptions ? `<div class="stats"><div class="stat-box"><div class="stat-label">Options</div><div class="stat-value">${data.totalOptions}</div></div><div class="stat-box"><div class="stat-label">Confidence</div><div class="stat-value">${data.confidence}%</div></div></div>` : ''}`;
  },

  // Lucky Number
  lucky_number: (data) => {
    const numbers = (data.numbers as number[]) || [data.luckyNumber];
    const count = data.count as number || 1;
    return `
      <div class="header">🍀 Lucky Number${count > 1 ? 's' : ''}</div>
      <div style="text-align:center;font-size:3rem;margin:0.5rem 0">🍀</div>
      <div class="big-number" style="color:#10b981">${count > 1 ? numbers.join(', ') : data.luckyNumber}</div>
      <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Range: ${data.range || `${data.min} - ${data.max}`}</div>`;
  },

  // Spin Wheel
  spin_wheel: (data) => {
    const options = (data.options as string[]) || [];
    const wheelColors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
    const segmentAngle = 360 / options.length;
    const segments = options.map((opt: string, i: number) => {
      const color = wheelColors[i % wheelColors.length];
      const startAngle = i * segmentAngle;
      const endAngle = (i + 1) * segmentAngle;
      const startRad = (startAngle - 90) * Math.PI / 180;
      const endRad = (endAngle - 90) * Math.PI / 180;
      const x1 = 50 + 45 * Math.cos(startRad);
      const y1 = 50 + 45 * Math.sin(startRad);
      const x2 = 50 + 45 * Math.cos(endRad);
      const y2 = 50 + 45 * Math.sin(endRad);
      const largeArc = segmentAngle > 180 ? 1 : 0;
      return `<path d="M50,50 L${x1},${y1} A45,45 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}"/>`;
    }).join('');
    const winnerColor = wheelColors[(data.index as number) % wheelColors.length];
    return `
      <div class="header">🎡 Spin Wheel</div>
      <div style="text-align:center;margin:0.5rem 0">
        <svg viewBox="0 0 100 100" style="width:120px;height:120px">
          ${segments}
          <circle cx="50" cy="50" r="8" fill="#1e1e32" stroke="#fff" stroke-width="2"/>
          <polygon points="50,5 45,15 55,15" fill="#fff"/>
        </svg>
      </div>
      <div class="big-number" style="color:${winnerColor};font-size:1.8rem">${data.result}</div>
      <div class="label" style="background:rgba(139,92,246,0.2);color:#8b5cf6">Winner from ${options.length} options</div>`;
  },

  // Ideal Weight
  calculate_ideal_weight: (data) => `
    <div class="header">⚖️ Ideal Weight</div>
    <div class="big-number" style="color:#10b981">${Number(data.idealWeight).toFixed(1)}</div>
    <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">kg (${data.formula})</div>
    <div class="stats">
      <div class="stat-box"><div class="stat-label">Height</div><div class="stat-value">${data.height} cm</div></div>
      <div class="stat-box"><div class="stat-label">Gender</div><div class="stat-value">${data.gender}</div></div>
    </div>`,

  // BMR Calculator
  calculate_bmr: (data) => `
    <div class="header">🔥 BMR Calculator</div>
    <div class="big-number" style="color:#f59e0b">${Math.round(data.bmr as number)}</div>
    <div class="label" style="background:rgba(245,158,11,0.2);color:#f59e0b">calories/day</div>
    <div class="stats">
      <div class="stat-box"><div class="stat-label">TDEE</div><div class="stat-value">${Math.round(data.tdee as number)} cal</div></div>
      <div class="stat-box"><div class="stat-label">Activity</div><div class="stat-value">${data.activityLevel}</div></div>
    </div>`,

  // Weight Loss Plan
  generate_weight_loss_plan: (data) => `
    <div class="header">📉 Weight Loss Plan</div>
    <div class="big-number" style="color:#10b981;font-size:2rem">${data.targetWeight} kg</div>
    <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Target in ${data.weeksToGoal} weeks</div>
    <div class="stats">
      <div class="stat-box"><div class="stat-label">Current</div><div class="stat-value">${data.currentWeight} kg</div></div>
      <div class="stat-box"><div class="stat-label">Daily Cal</div><div class="stat-value">${data.dailyCalories}</div></div>
    </div>`,

  // Savings Plan
  calculate_savings_plan: (data) => {
    const currency = (data.currency as string) || 'USD';
    const currencySymbol: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', RON: 'lei ' };
    const sym = currencySymbol[currency] || '$';
    const finalBalance = Number(data.finalBalance || 0).toLocaleString();
    const monthlyTargetSavings = Number(data.monthlyTargetSavings || 0).toLocaleString();
    const monthsToGoal = data.monthsToGoal || 0;
    const savingsMode = data.savingsMode === 'duration' ? '⏱️ Duration' : '🎯 Goal';
    const interestEnabled = data.interestEnabled;
    const totalInterestEarned = Number(data.totalInterestEarned || 0).toLocaleString();
    const annualInterestRate = data.annualInterestRate || 0;
    const savingsRate = data.savingsRate || 0;
    return `
      <div class="header">💰 Savings Plan</div>
      <div class="big-number" style="color:#10b981">${sym}${finalBalance}</div>
      <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">${savingsMode} • ${monthsToGoal} months</div>
      <div class="stats">
        <div class="stat-box"><div class="stat-label">Monthly Savings</div><div class="stat-value">${sym}${monthlyTargetSavings}</div></div>
        <div class="stat-box"><div class="stat-label">Savings Rate</div><div class="stat-value">${savingsRate}%</div></div>
        ${interestEnabled ? `
        <div class="stat-box"><div class="stat-label">Interest Rate</div><div class="stat-value">${annualInterestRate}%/yr</div></div>
        <div class="stat-box"><div class="stat-label">Interest Earned</div><div class="stat-value" style="color:#34d399">${sym}${totalInterestEarned}</div></div>
        ` : `
        <div class="stat-box"><div class="stat-label">Target Date</div><div class="stat-value">${data.targetDate || 'N/A'}</div></div>
        <div class="stat-box"><div class="stat-label">Achievable</div><div class="stat-value">${data.isAchievable ? '✅ Yes' : '⚠️ Stretch'}</div></div>
        `}
      </div>`;
  },

  // Days Between
  days_between: (data) => `
    <div class="header">📆 Days Between</div>
    <div class="big-number" style="color:#a78bfa">${Math.abs(data.days as number)}</div>
    <div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">days</div>
    <div class="stats">
      <div class="stat-box"><div class="stat-label">Weeks</div><div class="stat-value">${data.weeks}</div></div>
      <div class="stat-box"><div class="stat-label">Months</div><div class="stat-value">${data.months}</div></div>
    </div>`,

  // Percentage Calculator
  calculate_percentage: (data) => {
    const suffix = data.resultIsPercent ? '%' : '';
    return `
      <div class="header">📊 Percentage</div>
      <div class="big-number" style="color:#f472b6">${data.result}${suffix}</div>
      <div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6;font-size:0.9rem;padding:0.75rem 1rem">${data.explanation || `${data.value1} → ${data.value2}`}</div>`;
  },

  // Unit Converter
  convert_units: (data) => `
    <div class="header">🔄 Unit Converter</div>
    <div class="big-number" style="color:#60a5fa;font-size:2rem">${data.result}</div>
    <div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">${data.to || data.toUnit}</div>
    <div class="stats">
      <div class="stat-box" style="grid-column:span 2"><div class="stat-label">From</div><div class="stat-value">${data.value} ${data.from || data.fromUnit}</div></div>
    </div>`,

  // Cycle Tracker
  calculate_cycle: (data) => {
    const phaseInfo = data.phaseInfo as { emoji?: string; color?: string; name?: string } | undefined;
    const phaseColor = phaseInfo?.color || '#f472b6';
    const phaseEmoji = phaseInfo?.emoji || '🌸';
    const modeLabel = data.mode === 'simplified' ? ' (Simplified)' : '';
    return `
      <div class="header">🌸 Cycle Tracker${modeLabel}</div>
      <div class="big-number" style="color:#f472b6;font-size:1.5rem">${data.nextPeriodStart}</div>
      <div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">Next Period${data.daysUntilNextPeriod ? ` (in ${data.daysUntilNextPeriod} days)` : ''}</div>
      <div class="stats">
        <div class="stat-box"><div class="stat-label">Cycle Day</div><div class="stat-value">${data.currentDay || '—'}</div></div>
        <div class="stat-box"><div class="stat-label">Phase ${phaseEmoji}</div><div class="stat-value" style="color:${phaseColor}">${phaseInfo?.name || data.phase || '—'}</div></div>
        <div class="stat-box"><div class="stat-label">🥚 Ovulation</div><div class="stat-value">${data.ovulationDate || '—'}</div></div>
        <div class="stat-box"><div class="stat-label">💚 Fertile Window</div><div class="stat-value">${data.fertileWindowStart} - ${data.fertileWindowEnd}</div></div>
      </div>`;
  },

  // Name Generator
  generate_names: (data) => {
    const names = data.names as string[];
    return `
      <div class="header">👶 Name Generator</div>
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:1rem 0">
        ${names.slice(0, 8).map(n => `<span style="background:rgba(244,114,182,0.2);color:#f472b6;padding:0.5rem 1rem;border-radius:20px;font-weight:600">${n}</span>`).join('')}
      </div>
      <div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">${data.gender} names</div>`;
  },

  // Position Size Calculator
  calculate_position_size: (data) => {
    const riskColor = data.riskColor || '#eab308';
    const dir = data.direction === 'short' ? '🔴 SHORT' : '🟢 LONG';
    if (data.calculatedField === 'suggestions' && data.suggestions) {
      const suggRows = (data.suggestions as Array<{slDistancePercent: number; stopLoss: number; quantity: number}>)
        .slice(0, 3).map((s) => `<div style="display:flex;justify-content:space-between;padding:0.5rem;background:rgba(255,255,255,0.05);border-radius:8px;margin-bottom:0.25rem"><span style="color:#ef4444">SL: $${s.stopLoss}</span><span style="color:#60a5fa">Qty: ${s.quantity}</span></div>`).join('');
      return `
        <div class="header">📈 Position Suggestions</div>
        <div class="big-number" style="color:${riskColor}">${data.riskPercent}% Risk</div>
        <div class="label" style="background:rgba(234,179,8,0.2);color:#eab308">${dir} | $${data.riskAmount} at risk</div>
        <div style="margin-top:1rem">${suggRows}</div>`;
    }
    const calcLabel = data.calculatedField === 'quantity' ? '📦 Quantity' : data.calculatedField === 'stopLoss' ? '🛑 Stop Loss' : '⚠️ Risk %';
    return `
      <div class="header">📈 Position Size</div>
      <div class="big-number" style="color:${riskColor}">${data.riskPercent}%</div>
      <div class="label" style="background:${riskColor}33;color:${riskColor}">${data.riskLabel} | ${dir}</div>
      <div class="stats">
        <div class="stat-box"><div class="stat-label">🛑 Stop Loss</div><div class="stat-value" style="color:#ef4444">$${data.stopLoss}</div></div>
        <div class="stat-box"><div class="stat-label">📦 Quantity</div><div class="stat-value" style="color:#60a5fa">${data.quantity}</div></div>
        <div class="stat-box"><div class="stat-label">💰 Risk Amt</div><div class="stat-value">$${data.riskAmount}</div></div>
        <div class="stat-box"><div class="stat-label">${calcLabel}</div><div class="stat-value">✨ Calculated</div></div>
      </div>`;
  },

  // Sleep Calculator
  sleep_calculator: (data) => {
    const results = (data.results as Array<{ time: string; cycles: number; hours: number; quality: string; emoji: string; color: string }>) || [];
    const optimalResult = results.find(r => r.quality === 'optimal') || results[0];
    const rows = results.slice(0, 4).map(r =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.1)">
        <span>${r.emoji} ${r.time}</span>
        <span style="color:${r.color}">${r.cycles} cycles • ${r.hours.toFixed(1)}h</span>
      </div>`
    ).join('');
    return `
      <div class="header">😴 Sleep Calculator</div>
      <div class="big-number" style="color:#a78bfa;font-size:1.8rem">${optimalResult?.time || 'N/A'}</div>
      <div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">${data.mode === 'wakeAt' ? 'Go to sleep at' : 'Wake up at'}</div>
      <div style="margin-top:0.75rem">${rows}</div>`;
  },

  // Timezone Converter
  timezone_converter: (data) => {
    const conversions = (data.conversions || []) as Array<{ city: string; time: string; dayChange?: string }>;
    const rows = conversions.slice(0, 4).map(c =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem;background:rgba(96,165,250,0.1);border-radius:8px;margin-bottom:0.25rem">
        <span style="color:rgba(255,255,255,0.8)">${c.city}</span>
        <span style="color:#60a5fa;font-weight:700">${c.time}${c.dayChange ? ` <span style="font-size:0.75rem;color:#f59e0b">(${c.dayChange})</span>` : ''}</span>
      </div>`
    ).join('');
    return `
      <div class="header">🌍 Timezone Converter</div>
      <div class="big-number" style="color:#60a5fa;font-size:1.5rem">${data.sourceTime} ${data.sourceCity || data.sourceTimezone}</div>
      <div style="margin-top:1rem">${rows}</div>`;
  },

  // Vibe Quiz
  vibe_quiz: (data) => {
    const vibeType = data.type as string;
    const vibeColor = vibeType === 'cat' ? '#a78bfa' : '#f59e0b';
    return `
      <div class="header">${data.emoji} ${data.title}</div>
      <div class="big-number" style="color:${vibeColor}">${data.percentage}%</div>
      <div class="label" style="background:${vibeColor}33;color:${vibeColor}">${vibeType === 'cat' ? 'Cat Person' : 'Dog Person'}</div>
      <div class="stats">
        <div class="stat-box"><div class="stat-label">🐱 Cat</div><div class="stat-value">${data.catScore}</div></div>
        <div class="stat-box"><div class="stat-label">🐕 Dog</div><div class="stat-value">${data.dogScore}</div></div>
      </div>
      <div style="margin-top:0.75rem;font-size:0.85rem;color:rgba(255,255,255,0.8);line-height:1.4">${data.description}</div>`;
  },

  // IQ Score
  calculate_iq_score: (data) => {
    const iq = data.iqScore as number;
    const iqColor = data.color as string || (iq >= 130 ? '#10b981' : iq >= 100 ? '#60a5fa' : '#f59e0b');
    return `
      <div class="header">🧠 IQ Score</div>
      <div class="big-number" style="color:${iqColor}">${iq}</div>
      <div class="label" style="background:${iqColor}33;color:${iqColor}">${data.emoji || ''} ${data.category}</div>
      <div class="stats">
        <div class="stat-box"><div class="stat-label">Percentile</div><div class="stat-value">Top ${100 - (data.percentile as number)}%</div></div>
        <div class="stat-box"><div class="stat-label">Correct</div><div class="stat-value">${data.correctAnswers}/${data.totalQuestions}</div></div>
        <div class="stat-box"><div class="stat-label">Accuracy</div><div class="stat-value">${data.accuracy}%</div></div>
      </div>`;
  },

  // Uniqueness Calculator
  calculate_uniqueness: (data) => {
    const score = data.uniquenessScore as number;
    const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
    return `
      <div class="header">🦄 Uniqueness</div>
      <div class="big-number" style="color:${color}">${score}%</div>
      <div class="label" style="background:${color}33;color:${color}">${data.category}</div>`;
  },

  // When Date Info
  when_date_info: (data) => {
    const tenseColor = data.isPast ? '#ef4444' : data.isToday ? '#22c55e' : '#3b82f6';
    const tenseLabel = data.isPast ? 'Past' : data.isToday ? 'Today' : 'Future';
    const absDays = Math.abs(data.daysFromToday as number);
    return `
      <div class="header">📅 Date Info</div>
      <div class="big-number" style="color:#60a5fa;font-size:1.3rem">${data.formattedDate || data.date}</div>
      <div class="label" style="background:${tenseColor}33;color:${tenseColor}">${data.dayOfWeek} • ${tenseLabel}</div>
      <div class="stats">
        <div class="stat-box"><div class="stat-label">Days</div><div class="stat-value">${absDays}</div></div>
        <div class="stat-box"><div class="stat-label">Weeks</div><div class="stat-value">${data.weeks}</div></div>
        <div class="stat-box"><div class="stat-label">Week #</div><div class="stat-value">${data.weekOfYear}</div></div>
        <div class="stat-box"><div class="stat-label">Q</div><div class="stat-value">${data.quarter}</div></div>
      </div>
      <div style="margin-top:0.5rem;font-size:0.75rem;color:rgba(255,255,255,0.6)">${data.zodiacSign} • Day ${data.dayOfYear}${data.isLeapYear ? ' • Leap Year' : ''}</div>`;
  },

  // Blood Calculator (unified)
  blood_calculator: (data) => {
    const bloodData = data as {
      calculatorMode?: 'donation' | 'compatibility' | 'baby';
      eligible?: boolean; amount?: number; maxSafeAmount?: number; bloodVolume?: number; warnings?: string[];
      fullBloodType?: string; canDonateTo?: string[]; canReceiveFrom?: string[]; isUniversalDonor?: boolean; isUniversalRecipient?: boolean;
      possibleTypes?: { type: string; percentage: number }[]; rhIncompatibilityRisk?: boolean;
    };
    const mode = bloodData.calculatorMode || 'donation';

    if (mode === 'donation') {
      const eligibleColor = bloodData.eligible ? '#22c55e' : '#ef4444';
      const eligibleIcon = bloodData.eligible ? '✅' : '❌';
      const eligibleText = bloodData.eligible ? 'Eligible to Donate' : 'Not Eligible';
      const warnings = bloodData.warnings || [];
      return `
        <div class="header">🩸 Blood Donation</div>
        <div class="big-number" style="color:${eligibleColor}">${eligibleIcon}</div>
        <div class="label" style="background:${eligibleColor}33;color:${eligibleColor}">${eligibleText}</div>
        ${bloodData.eligible ? `<div class="stats">
          <div class="stat-box"><div class="stat-label">Recommended</div><div class="stat-value">${bloodData.amount} ml</div></div>
          <div class="stat-box"><div class="stat-label">Blood Volume</div><div class="stat-value">${bloodData.bloodVolume} L</div></div>
        </div>` : `<div class="stats">
          <div class="stat-box"><div class="stat-label">Blood Volume</div><div class="stat-value">${bloodData.bloodVolume} L</div></div>
          <div class="stat-box"><div class="stat-label">Max Safe Loss</div><div class="stat-value" style="color:#fbbf24">${bloodData.maxSafeAmount} ml</div></div>
        </div>
        <div style="margin-top:0.25rem;font-size:0.65rem;color:rgba(255,255,255,0.5)">Max safe blood loss (10.5% of blood volume)</div>`}
        ${warnings.length ? `<div style="margin-top:0.5rem;padding:0.5rem;background:rgba(251,191,36,0.1);border-radius:8px;font-size:0.75rem;color:#fbbf24">⚠️ ${warnings[0]}</div>` : ''}`;
    }

    if (mode === 'compatibility') {
      const isSpecial = bloodData.isUniversalDonor || bloodData.isUniversalRecipient;
      const specialLabel = bloodData.isUniversalDonor ? '🌟 Universal Donor' : bloodData.isUniversalRecipient ? '🌟 Universal Recipient' : '';
      const donateTo = bloodData.canDonateTo || [];
      const receiveFrom = bloodData.canReceiveFrom || [];
      return `
        <div class="header">🩸 Blood Compatibility</div>
        <div class="big-number" style="color:#ef4444;font-size:2.5rem">${bloodData.fullBloodType || ''}</div>
        ${isSpecial ? `<div class="label" style="background:rgba(251,191,36,0.2);color:#fbbf24">${specialLabel}</div>` : ''}
        <div class="stats">
          <div class="stat-box" style="background:rgba(34,197,94,0.1)"><div class="stat-label" style="color:#22c55e">Can Donate To</div><div class="stat-value" style="font-size:0.8rem">${donateTo.join(', ') || 'None'}</div></div>
          <div class="stat-box" style="background:rgba(59,130,246,0.1)"><div class="stat-label" style="color:#3b82f6">Can Receive From</div><div class="stat-value" style="font-size:0.8rem">${receiveFrom.join(', ') || 'None'}</div></div>
        </div>`;
    }

    // Baby mode
    const topTypes = (bloodData.possibleTypes || []).slice(0, 4);
    const hasRisk = bloodData.rhIncompatibilityRisk;
    return `
      <div class="header">👶 Baby Blood Type</div>
      ${hasRisk ? `<div class="label" style="background:rgba(239,68,68,0.2);color:#ef4444;margin-bottom:0.5rem">⚠️ Rh Incompatibility Risk</div>` : ''}
      <div class="stats" style="grid-template-columns:repeat(${Math.min(topTypes.length, 2)}, 1fr)">
        ${topTypes.map((t) => `
          <div class="stat-box">
            <div class="stat-value" style="font-size:1.5rem;color:#a78bfa">${t.type}</div>
            <div class="stat-label">${t.percentage}%</div>
          </div>
        `).join('')}
      </div>`;
  },

  // Find Next Eclipse
  find_next_eclipse: (data) => {
    const eclipseData = data as {
      date?: string; type?: string; subtype?: string; peakTimeUTC?: string;
      daysUntil?: number; bestVisibleFrom?: string; visibleFromLocation?: boolean | null;
      visibilityScore?: string; magnitude?: number; duration?: string;
      visibleRegions?: string[];
    };
    const icon = eclipseData.type === 'solar'
      ? (eclipseData.subtype === 'total' ? '🌑' : eclipseData.subtype === 'annular' ? '🔆' : '🌘')
      : (eclipseData.subtype === 'total' ? '🌕' : eclipseData.subtype === 'penumbral' ? '🌖' : '🌗');
    const visibleBadge = eclipseData.visibleFromLocation === true
      ? `<span style="color:#22c55e">✓ ${eclipseData.visibilityScore || 'Visible from your location'}</span>`
      : eclipseData.visibleFromLocation === false
        ? '<span style="color:#ef4444">✗ Not visible from your location</span>'
        : '';
    return `
      <div class="header">${icon} Next ${eclipseData.subtype || ''} ${eclipseData.type || ''} Eclipse</div>
      <div class="value" style="font-size:1.2rem">${eclipseData.date || 'Unknown'}</div>
      <div class="stats">
        <div class="stat-box"><div class="stat-label">Days Until</div><div class="stat-value" style="color:#a78bfa">${eclipseData.daysUntil || '?'}</div></div>
        <div class="stat-box"><div class="stat-label">Peak Time</div><div class="stat-value">${eclipseData.peakTimeUTC || '?'} UTC</div></div>
      </div>
      ${eclipseData.duration || eclipseData.magnitude ? `
      <div class="stats" style="margin-top:0.5rem">
        ${eclipseData.duration ? `<div class="stat-box"><div class="stat-label">Duration</div><div class="stat-value">${eclipseData.duration}</div></div>` : ''}
        ${eclipseData.magnitude ? `<div class="stat-box"><div class="stat-label">Magnitude</div><div class="stat-value">${eclipseData.magnitude.toFixed(3)}</div></div>` : ''}
      </div>` : ''}
      <div class="label" style="margin-top:0.5rem">🌍 Best visible from: ${eclipseData.bestVisibleFrom || 'Unknown'}</div>
      ${eclipseData.visibleRegions && eclipseData.visibleRegions.length > 0 ? `<div class="label" style="margin-top:0.25rem;font-size:0.75rem;color:rgba(255,255,255,0.6)">Regions: ${eclipseData.visibleRegions.join(', ')}</div>` : ''}
      ${visibleBadge ? `<div class="label" style="margin-top:0.25rem">${visibleBadge}</div>` : ''}`;
  },

  // List Upcoming Eclipses
  list_upcoming_eclipses: (data) => {
    const listData = data as {
      eclipses?: Array<{
        date: string; type: string; subtype: string; daysUntil: number;
        bestVisibleFrom: string; visibleFromLocation?: boolean | null; visibilityScore?: string;
      }>;
      totalCount?: number
    };
    const eclipses = (listData.eclipses || []).slice(0, 5);
    return `
      <div class="header">🌓 Upcoming Eclipses</div>
      <div class="label">${listData.totalCount || 0} eclipses found</div>
      <div style="margin-top:0.5rem">
        ${eclipses.map(e => {
          const icon = e.type === 'solar' ? '☀️' : '🌙';
          const visIcon = e.visibleFromLocation === true ? '✓' : e.visibleFromLocation === false ? '✗' : '';
          const visColor = e.visibleFromLocation === true ? '#22c55e' : e.visibleFromLocation === false ? '#ef4444' : '';
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.1)">
            <span>${icon} ${e.subtype} ${e.type}</span>
            <span style="display:flex;align-items:center;gap:0.5rem">
              ${visIcon ? `<span style="color:${visColor}">${visIcon}</span>` : ''}
              <span style="color:rgba(255,255,255,0.6)">${e.date} (${e.daysUntil}d)</span>
            </span>
          </div>`;
        }).join('')}
      </div>`;
  },
};

// ============================================================================
// WIDGET RENDERERS (OpenAI - ES5 compatible)
// Renderers registered here take precedence over the legacy switch in route.ts
// ============================================================================

export const widgetRenderersOpenAI: Record<string, ToolWidgetRenderer> = {
  // Tools will be migrated here gradually
};

// ============================================================================
// TEXT FORMATTERS
// Formatters registered here take precedence over the legacy switch in route.ts
// ============================================================================

export const textFormatters: Record<string, ToolTextFormatter> = {
  calculate_tip: (r) =>
    `Bill: $${r.billAmount} + Tip (${r.tipPercent}%): $${r.tipAmount} = Total: $${r.total}${(r.splitWays as number) > 1 ? ` ($${r.perPerson} per person)` : ''}`,

  flip_tool: (r) => {
    if (r.flipMode === 'dice') {
      return `🎲 Rolled: ${(r.rolls as number[]).join(', ')} (Total: ${r.total})`;
    } else {
      const count = r.count as number;
      if (count === 1) {
        return `🪙 Flipped: ${(r.result as string).toUpperCase()}`;
      }
      return `🪙 Flipped ${count} coins: ${r.headsCount} heads, ${r.tailsCount} tails`;
    }
  },

  calculate_age: (r) =>
    `Age: ${r.years} years, ${r.months} months, ${r.days} days (${r.totalDays} total days). Next birthday in ${r.daysUntilNextBirthday} days.`,

  zodiac_compatibility: (r) =>
    `${(r.person1 as { name: string }).name} ❤️ ${(r.person2 as { name: string }).name}: ${r.compatibility}% compatibility (${r.level})`,

  calculate_countdown: (r) => {
    if (r.isToday) {
      return `⏳ ${r.eventName} is today! 🎉`;
    }
    const cdAbsDays = r.absoluteDays ?? Math.abs(r.days as number);
    return `⏳ ${r.eventName}: ${cdAbsDays} days ${r.isPast ? 'ago' : 'to go'} (${r.weeks} weeks, ${r.months} months)`;
  },

  make_decision: (r) => {
    const decMode = r.mode as string;
    if (decMode === 'yesNo') {
      return `🎱 The oracle says: ${r.decision}`;
    }
    return `🎱 Decision: ${r.decision} (${r.confidence}% confidence from ${r.totalOptions} options)`;
  },

  lucky_number: (r) => {
    const luckyNums = (r.numbers as number[]) || [r.luckyNumber];
    const luckyCountVal = (r.count as number) || 1;
    return luckyCountVal > 1
      ? `🍀 Lucky numbers: ${luckyNums.join(', ')} (range: ${r.range})`
      : `🍀 Lucky number: ${r.luckyNumber} (range: ${r.range})`;
  },

  spin_wheel: (r) =>
    `🎡 The wheel landed on: ${r.result} (option ${(r.index as number) + 1} of ${r.totalOptions})`,

  blood_calculator: (r) => {
    const mode = r.calculatorMode as string;
    if (mode === 'donation') {
      if (r.eligible) {
        return `🩸 Eligible to donate! Recommended: ${r.amount}ml (Blood volume: ${r.bloodVolume}L)`;
      } else {
        const warnings = (r.warnings as string[]) || [];
        return `🩸 Not eligible to donate. Blood volume: ${r.bloodVolume}L, Max safe loss: ${r.maxSafeAmount}ml. ${warnings.length ? warnings[0] : ''}`;
      }
    } else if (mode === 'compatibility') {
      const special = r.isUniversalDonor ? ' (Universal Donor!)' : r.isUniversalRecipient ? ' (Universal Recipient!)' : '';
      return `🩸 Blood type ${r.fullBloodType}${special}. Can donate to: ${(r.canDonateTo as string[])?.join(', ')}. Can receive from: ${(r.canReceiveFrom as string[])?.join(', ')}.`;
    } else if (mode === 'baby') {
      const types = (r.possibleTypes as { type: string; percentage: number }[]) || [];
      const typeStr = types.map(t => `${t.type} (${t.percentage}%)`).join(', ');
      const warning = r.rhIncompatibilityRisk ? ' ⚠️ Rh incompatibility risk!' : '';
      return `👶 Possible baby blood types: ${typeStr}.${warning}`;
    }
    return '🩸 Blood calculation complete.';
  },

  find_next_eclipse: (r) => {
    const icon = r.type === 'solar' ? '☀️' : '🌙';
    const visibilityInfo = r.visibleFromLocation === true
      ? ` (${r.visibilityScore || 'Visible from your location'})`
      : r.visibleFromLocation === false
        ? ' (Not visible from your location)'
        : '';
    const durationInfo = r.duration ? ` Duration: ${r.duration}.` : '';
    return `${icon} Next ${r.subtype} ${r.type} eclipse: ${r.date} at ${r.peakTimeUTC} UTC (${r.daysUntil} days away).${durationInfo} Best visible from: ${r.bestVisibleFrom}.${visibilityInfo}`;
  },

  list_upcoming_eclipses: (r) => {
    const eclipses = (r.eclipses as Array<{ date: string; type: string; subtype: string; daysUntil: number; visibleFromLocation?: boolean | null }>) || [];
    const summary = eclipses.slice(0, 3).map(e => {
      const icon = e.type === 'solar' ? '☀️' : '🌙';
      const vis = e.visibleFromLocation === true ? '✓' : e.visibleFromLocation === false ? '✗' : '';
      return `${icon} ${e.subtype} ${e.type} on ${e.date}${vis ? ` ${vis}` : ''}`;
    }).join(', ');
    return `🌓 Found ${r.totalCount} upcoming eclipses: ${summary}${eclipses.length > 3 ? '...' : ''}`;
  },

  calculate_cycle: (r) => {
    const cycPhaseInfo = r.phaseInfo as { emoji?: string; name?: string } | undefined;
    const cycEmoji = cycPhaseInfo?.emoji || '🌸';
    const cycPhaseName = cycPhaseInfo?.name || r.phase;
    return `🌸 Next period: ${r.nextPeriodStart} (in ${r.daysUntilNextPeriod} days). Currently day ${r.currentDay} - ${cycEmoji} ${cycPhaseName}. Ovulation: ${r.ovulationDate}`;
  },

  vibe_quiz: (r) => {
    const vibeEmoji = r.type === 'cat' ? '🐱' : '🐕';
    return `${vibeEmoji} ${r.title} - ${r.percentage}% ${r.type} person! (Cat: ${r.catScore}, Dog: ${r.dogScore}). ${r.description}`;
  },

  sleep_calculator: (r) => {
    const sleepResults = (r.results as Array<{ time: string; cycles: number; hours: number; quality: string }>) || [];
    const optimal = sleepResults.find(res => res.quality === 'optimal');
    const modeLabel = r.mode === 'wakeAt' ? 'Go to sleep at' : 'Wake up at';
    const times = sleepResults.slice(0, 3).map(res => `${res.time} (${res.cycles} cycles)`).join(', ');
    return `😴 ${modeLabel}: ${optimal ? `${optimal.time} (optimal)` : times}. Age group: ${r.ageGroup}. Recommended: ${(r.recommendation as { min: number; max: number }).min}-${(r.recommendation as { min: number; max: number }).max}h`;
  },

  calculate_iq_score: (r) =>
    `🧠 IQ Score: ${r.iqScore} (${r.category}) ${r.emoji || ''}. Top ${100 - (r.percentile as number)}% of population. ${r.correctAnswers}/${r.totalQuestions} correct (${r.accuracy}% accuracy). Test: ${(r.testInfo as { name: string }).name}`,
};

// ============================================================================
// TEMPLATE DATA (for widget previews)
// Template data registered here takes precedence over the legacy object in route.ts
// ============================================================================

export const templateData: Record<string, ToolResult> = {
  // Tools will be migrated here gradually
};


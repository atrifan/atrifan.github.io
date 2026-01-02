import { NextRequest, NextResponse } from 'next/server';
import { WeightCalculator } from '@/src/utils/WeightCalculator';
import { BudgetCalculator } from '@/src/utils/BudgetCalculator';
import { DateCalculator } from '@/src/utils/DateCalculator';
import { getSignFromDate, getCompatibility, getSignInfo, ZODIAC_SIGNS, ZodiacSign } from '@/src/data/zodiac';

// MCP Protocol Types
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// Tool definitions for MCP
const TOOLS = [
  {
    name: 'calculate_bmi',
    description: 'Calculate Body Mass Index (BMI) from weight and height',
    inputSchema: {
      type: 'object',
      properties: {
        weight: { type: 'number', description: 'Weight in kilograms' },
        height: { type: 'number', description: 'Height in centimeters' },
      },
      required: ['weight', 'height'],
    },
  },
  {
    name: 'calculate_ideal_weight',
    description: 'Calculate ideal weight using the Devine formula',
    inputSchema: {
      type: 'object',
      properties: {
        height: { type: 'number', description: 'Height in centimeters' },
        sex: { type: 'string', enum: ['male', 'female', 'other'], description: 'Biological sex' },
      },
      required: ['height', 'sex'],
    },
  },
  {
    name: 'calculate_bmr',
    description: 'Calculate Basal Metabolic Rate using Mifflin-St Jeor equation',
    inputSchema: {
      type: 'object',
      properties: {
        weight: { type: 'number', description: 'Weight in kilograms' },
        height: { type: 'number', description: 'Height in centimeters' },
        age: { type: 'number', description: 'Age in years' },
        sex: { type: 'string', enum: ['male', 'female', 'other'], description: 'Biological sex' },
      },
      required: ['weight', 'height', 'age', 'sex'],
    },
  },
  {
    name: 'generate_weight_loss_plan',
    description: 'Generate a complete weight loss plan with calorie targets and fasting recommendations',
    inputSchema: {
      type: 'object',
      properties: {
        age: { type: 'number', description: 'Age in years' },
        sex: { type: 'string', enum: ['male', 'female', 'other'] },
        height: { type: 'number', description: 'Height in centimeters' },
        currentWeight: { type: 'number', description: 'Current weight in kg' },
        desiredWeight: { type: 'number', description: 'Target weight in kg' },
        timeToWeight: { type: 'number', description: 'Weeks to reach goal (optional)' },
      },
      required: ['age', 'sex', 'height', 'currentWeight', 'desiredWeight'],
    },
  },
  {
    name: 'calculate_savings_plan',
    description: 'Calculate a budget and savings plan',
    inputSchema: {
      type: 'object',
      properties: {
        monthlyIncome: { type: 'number', description: 'Monthly gross income' },
        monthlyTaxes: { type: 'number', description: 'Monthly taxes' },
        monthlyFixedExpenses: { type: 'number', description: 'Fixed monthly expenses (rent, utilities, etc.)' },
        currentSavings: { type: 'number', description: 'Current savings amount' },
        savingsGoal: { type: 'number', description: 'Target savings amount' },
        intensity: { type: 'string', enum: ['light', 'medium', 'aggressive'], description: 'Savings intensity' },
        currency: { type: 'string', description: 'Currency code (EUR, USD, etc.)' },
      },
      required: ['monthlyIncome', 'monthlyTaxes', 'monthlyFixedExpenses', 'currentSavings', 'savingsGoal', 'intensity', 'currency'],
    },
  },
  {
    name: 'calculate_date_info',
    description: 'Get information about a specific date (day of week, leap year, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
      },
      required: ['date'],
    },
  },
  {
    name: 'days_between_dates',
    description: 'Calculate the number of days between two dates',
    inputSchema: {
      type: 'object',
      properties: {
        date1: { type: 'string', description: 'First date in YYYY-MM-DD format' },
        date2: { type: 'string', description: 'Second date in YYYY-MM-DD format' },
      },
      required: ['date1', 'date2'],
    },
  },
  {
    name: 'random_number',
    description: 'Generate a random number between min and max (inclusive)',
    inputSchema: {
      type: 'object',
      properties: {
        min: { type: 'number', description: 'Minimum value' },
        max: { type: 'number', description: 'Maximum value' },
      },
      required: ['min', 'max'],
    },
  },
  {
    name: 'coin_flip',
    description: 'Flip a coin and get heads or tails',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pick_random',
    description: 'Pick a random item from a list',
    inputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' }, description: 'List of items to choose from' },
      },
      required: ['items'],
    },
  },
  {
    name: 'calculate_tip',
    description: 'Calculate tip amount and total bill',
    inputSchema: {
      type: 'object',
      properties: {
        billAmount: { type: 'number', description: 'Bill amount before tip' },
        tipPercent: { type: 'number', description: 'Tip percentage (e.g., 15, 18, 20)' },
        splitWays: { type: 'number', description: 'Number of people to split the bill (optional)' },
      },
      required: ['billAmount', 'tipPercent'],
    },
  },
  {
    name: 'calculate_percentage',
    description: 'Calculate percentage of a number or percentage change',
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['of', 'change', 'increase', 'decrease'], description: 'Type of calculation' },
        value: { type: 'number', description: 'The main value' },
        percent: { type: 'number', description: 'The percentage' },
      },
      required: ['operation', 'value', 'percent'],
    },
  },
  // AGE - Calculate age from birth date
  {
    name: 'calculate_age',
    description: 'Calculate exact age from birth date including years, months, days, and days until next birthday',
    inputSchema: {
      type: 'object',
      properties: {
        birthDate: { type: 'string', description: 'Birth date in YYYY-MM-DD format' },
      },
      required: ['birthDate'],
    },
  },
  // CONVERT - Unit conversion
  {
    name: 'convert_units',
    description: 'Convert between units (weight, length, temperature)',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'Value to convert' },
        from: { type: 'string', description: 'Source unit (kg, lbs, oz, cm, in, m, ft, km, mi, C, F, K)' },
        to: { type: 'string', description: 'Target unit' },
      },
      required: ['value', 'from', 'to'],
    },
  },
  // CYCLE - Menstrual cycle calculator
  {
    name: 'calculate_cycle',
    description: 'Calculate menstrual cycle predictions including next period, fertile window, and ovulation date',
    inputSchema: {
      type: 'object',
      properties: {
        lastPeriodDate: { type: 'string', description: 'Last period start date in YYYY-MM-DD format' },
        cycleLength: { type: 'number', description: 'Average cycle length in days (default: 28)' },
        periodLength: { type: 'number', description: 'Average period length in days (default: 5)' },
      },
      required: ['lastPeriodDate'],
    },
  },
  // DAYS - Countdown calculator
  {
    name: 'calculate_countdown',
    description: 'Calculate days, weeks, months until or since a date',
    inputSchema: {
      type: 'object',
      properties: {
        eventDate: { type: 'string', description: 'Event date in YYYY-MM-DD format' },
        eventName: { type: 'string', description: 'Name of the event (optional)' },
      },
      required: ['eventDate'],
    },
  },
  // DECIDE - Decision maker
  {
    name: 'make_decision',
    description: 'Make a random decision - yes/no or pick from custom options',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['yesNo', 'custom'], description: 'Decision mode' },
        options: { type: 'array', items: { type: 'string' }, description: 'Custom options (required if mode is custom)' },
      },
      required: ['mode'],
    },
  },
  // MATCH - Zodiac compatibility
  {
    name: 'zodiac_compatibility',
    description: 'Calculate zodiac sign compatibility between two people',
    inputSchema: {
      type: 'object',
      properties: {
        person1: { type: 'string', description: 'First person zodiac sign or birth date (YYYY-MM-DD)' },
        person2: { type: 'string', description: 'Second person zodiac sign or birth date (YYYY-MM-DD)' },
      },
      required: ['person1', 'person2'],
    },
  },
  // MATCH - Get zodiac sign from date
  {
    name: 'get_zodiac_sign',
    description: 'Get zodiac sign from a birth date',
    inputSchema: {
      type: 'object',
      properties: {
        birthDate: { type: 'string', description: 'Birth date in YYYY-MM-DD format' },
      },
      required: ['birthDate'],
    },
  },
  // NAMES - Generate random names
  {
    name: 'generate_names',
    description: 'Generate random names (human first names, full names, fantasy names, or pet names)',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['first', 'full', 'fantasy', 'pet'], description: 'Type of name to generate' },
        gender: { type: 'string', enum: ['male', 'female', 'any'], description: 'Gender preference' },
        petType: { type: 'string', enum: ['dog', 'cat'], description: 'Pet type (only for pet names)' },
        count: { type: 'number', description: 'Number of names to generate (default: 5)' },
      },
      required: ['type'],
    },
  },
  // RISK - Trading position size calculator
  {
    name: 'calculate_position_size',
    description: 'Calculate trading position size based on risk management',
    inputSchema: {
      type: 'object',
      properties: {
        capital: { type: 'number', description: 'Total trading capital' },
        entryPrice: { type: 'number', description: 'Entry price' },
        stopLossPrice: { type: 'number', description: 'Stop loss price' },
        riskPercent: { type: 'number', description: 'Risk percentage of capital (e.g., 1 for 1%)' },
        direction: { type: 'string', enum: ['long', 'short'], description: 'Trade direction' },
      },
      required: ['capital', 'entryPrice', 'stopLossPrice', 'riskPercent', 'direction'],
    },
  },
  // SLEEP - Sleep cycle calculator
  {
    name: 'calculate_sleep_times',
    description: 'Calculate optimal sleep/wake times based on sleep cycles',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['wakeAt', 'sleepAt', 'sleepNow'], description: 'Calculation mode' },
        time: { type: 'string', description: 'Time in HH:MM format (for wakeAt or sleepAt modes)' },
        ageGroup: { type: 'string', enum: ['adult', 'teen', 'child', 'toddler', 'infant'], description: 'Age group (default: adult)' },
      },
      required: ['mode'],
    },
  },
  // SPIN - Wheel spinner
  {
    name: 'spin_wheel',
    description: 'Spin a wheel with custom options and get a random result',
    inputSchema: {
      type: 'object',
      properties: {
        options: { type: 'array', items: { type: 'string' }, description: 'Options on the wheel' },
      },
      required: ['options'],
    },
  },
  // ZONE - Timezone converter
  {
    name: 'convert_timezone',
    description: 'Convert time between timezones',
    inputSchema: {
      type: 'object',
      properties: {
        time: { type: 'string', description: 'Time in HH:MM format' },
        fromTimezone: { type: 'string', description: 'Source timezone (e.g., UTC, UTC+2, America/New_York)' },
        toTimezones: { type: 'array', items: { type: 'string' }, description: 'Target timezones' },
      },
      required: ['time', 'fromTimezone', 'toTimezones'],
    },
  },
  // UNIQUE - UUID/ID generator
  {
    name: 'generate_unique_id',
    description: 'Generate unique identifiers (UUID, short ID, numeric ID)',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['uuid', 'short', 'numeric', 'alphanumeric'], description: 'Type of ID to generate' },
        count: { type: 'number', description: 'Number of IDs to generate (default: 1)' },
        length: { type: 'number', description: 'Length for short/numeric/alphanumeric IDs (default: 8)' },
      },
      required: ['type'],
    },
  },
  // LUCK - Random number with optional max
  {
    name: 'lucky_number',
    description: 'Generate a lucky random number',
    inputSchema: {
      type: 'object',
      properties: {
        max: { type: 'number', description: 'Maximum value (default: 2147483647)' },
      },
    },
  },
  // DICE - Roll dice
  {
    name: 'roll_dice',
    description: 'Roll dice with customizable sides and count',
    inputSchema: {
      type: 'object',
      properties: {
        sides: { type: 'number', description: 'Number of sides on each die (default: 6)' },
        count: { type: 'number', description: 'Number of dice to roll (default: 1)' },
      },
    },
  },
  // VIBE - Cat vs Dog personality check
  {
    name: 'vibe_check',
    description: 'Determine if someone is more of a cat person or dog person based on personality traits. Provide answers to 10 questions.',
    inputSchema: {
      type: 'object',
      properties: {
        answers: {
          type: 'array',
          items: { type: 'string', enum: ['A', 'B'] },
          description: 'Array of 10 answers (A=cat-leaning, B=dog-leaning) for questions about: 1) Saturday preference, 2) Meeting people, 3) Living space, 4) Stress handling, 5) Exercise, 6) Routines, 7) Communication, 8) Affection, 9) Sleep, 10) Conflict',
        },
      },
      required: ['answers'],
    },
  },
  // BRAIN - IQ test score calculator
  {
    name: 'calculate_iq_score',
    description: 'Calculate estimated IQ score based on correct answers to logic/pattern questions',
    inputSchema: {
      type: 'object',
      properties: {
        correctAnswers: { type: 'number', description: 'Number of correct answers (out of 15)' },
        totalQuestions: { type: 'number', description: 'Total questions answered (default: 15)' },
        timeTakenSeconds: { type: 'number', description: 'Time taken in seconds (optional, affects score)' },
      },
      required: ['correctAnswers'],
    },
  },
  // UNIQUE/RANK - Calculate uniqueness based on physical traits
  {
    name: 'calculate_uniqueness',
    description: 'Calculate how unique/rare a person is based on their physical characteristics compared to world population',
    inputSchema: {
      type: 'object',
      properties: {
        age: { type: 'number', description: 'Age in years' },
        gender: { type: 'string', enum: ['male', 'female'], description: 'Gender' },
        heightCm: { type: 'number', description: 'Height in centimeters' },
        weightKg: { type: 'number', description: 'Weight in kilograms' },
        eyeColor: { type: 'string', enum: ['brown', 'blue', 'hazel', 'green', 'gray', 'amber'], description: 'Eye color (optional)' },
        hairColor: { type: 'string', enum: ['black', 'brown', 'blonde', 'red', 'gray', 'white'], description: 'Hair color (optional)' },
      },
      required: ['age', 'gender'],
    },
  },
  // WHEN - Extended date information
  {
    name: 'when_date_info',
    description: 'Get comprehensive information about a date including day of week, week number, zodiac, holidays, and time breakdowns',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
      },
      required: ['date'],
    },
  },
];

// Tool execution handlers
function executeTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case 'calculate_bmi': {
      const bmi = WeightCalculator.calculateBMI(args.weight as number, args.height as number);
      const result = WeightCalculator.getBMIResult(bmi);
      return { bmi: result.value.toFixed(1), category: result.category };
    }
    case 'calculate_ideal_weight': {
      const idealWeight = WeightCalculator.calculateIdealWeight(
        args.height as number,
        args.sex as 'male' | 'female' | 'other'
      );
      return { idealWeight: Math.round(idealWeight * 10) / 10, unit: 'kg' };
    }
    case 'calculate_bmr': {
      const bmr = WeightCalculator.calculateBMR(
        args.weight as number,
        args.height as number,
        args.age as number,
        args.sex as 'male' | 'female' | 'other'
      );
      const tdee = WeightCalculator.calculateTDEE(bmr);
      return { bmr: Math.round(bmr), tdee: Math.round(tdee), unit: 'calories/day' };
    }
    case 'generate_weight_loss_plan': {
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
    }
    case 'calculate_savings_plan': {
      const plan = BudgetCalculator.calculatePlan({
        monthlyIncome: args.monthlyIncome as number,
        monthlyTaxes: args.monthlyTaxes as number,
        monthlyFixedExpenses: args.monthlyFixedExpenses as number,
        currentSavings: args.currentSavings as number,
        savingsGoal: args.savingsGoal as number,
        intensity: args.intensity as 'light' | 'medium' | 'aggressive',
        currency: args.currency as 'EUR' | 'USD' | 'GBP' | 'RON',
        advancedMode: false,
      });
      return {
        monthlyNetIncome: Math.round(plan.monthlyNetIncome),
        monthlyDisposable: Math.round(plan.monthlyDisposable),
        monthlyTargetSavings: Math.round(plan.monthlyTargetSavings),
        monthlyBudgetForLiving: Math.round(plan.monthlyBudgetForLiving),
        weeklyBudgetForLiving: Math.round(plan.weeklyBudgetForLiving),
        dailyBudgetForLiving: Math.round(plan.dailyBudgetForLiving),
        monthsToGoal: plan.monthsToGoal,
        targetDate: plan.targetDate.toISOString().split('T')[0],
        isAchievable: plan.isAchievable,
        tips: plan.tips,
        warnings: plan.warnings,
      };
    }
    case 'calculate_date_info': {
      return DateCalculator.calculate(args.date as string);
    }
    case 'days_between_dates': {
      const [y1, m1, d1] = (args.date1 as string).split('-').map(Number);
      const [y2, m2, d2] = (args.date2 as string).split('-').map(Number);
      const date1 = new Date(y1, m1 - 1, d1);
      const date2 = new Date(y2, m2 - 1, d2);
      const days = DateCalculator.daysBetween(date1, date2);
      return { days, absoluteDays: Math.abs(days) };
    }
    case 'random_number': {
      const min = args.min as number;
      const max = args.max as number;
      const result = Math.floor(Math.random() * (max - min + 1)) + min;
      return { result, min, max };
    }
    case 'coin_flip': {
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      return { result };
    }
    case 'pick_random': {
      const items = args.items as string[];
      const index = Math.floor(Math.random() * items.length);
      return { selected: items[index], index, totalItems: items.length };
    }
    case 'calculate_tip': {
      const bill = args.billAmount as number;
      const tipPercent = args.tipPercent as number;
      const splitWays = (args.splitWays as number) || 1;
      const tipAmount = bill * (tipPercent / 100);
      const total = bill + tipAmount;
      const perPerson = total / splitWays;
      return {
        billAmount: bill,
        tipPercent,
        tipAmount: Math.round(tipAmount * 100) / 100,
        total: Math.round(total * 100) / 100,
        perPerson: Math.round(perPerson * 100) / 100,
        splitWays,
      };
    }
    case 'calculate_percentage': {
      const op = args.operation as string;
      const value = args.value as number;
      const percent = args.percent as number;
      let result: number;
      switch (op) {
        case 'of':
          result = value * (percent / 100);
          break;
        case 'change':
          result = ((percent - value) / value) * 100;
          break;
        case 'increase':
          result = value * (1 + percent / 100);
          break;
        case 'decrease':
          result = value * (1 - percent / 100);
          break;
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
      return { operation: op, value, percent, result: Math.round(result * 100) / 100 };
    }
    case 'calculate_age': {
      const [y, m, d] = (args.birthDate as string).split('-').map(Number);
      const birth = new Date(y, m - 1, d);
      const now = new Date();
      let years = now.getFullYear() - birth.getFullYear();
      let months = now.getMonth() - birth.getMonth();
      let days = now.getDate() - birth.getDate();
      if (days < 0) { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
      if (months < 0) { years--; months += 12; }
      const nextBirthday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
      if (nextBirthday < now) nextBirthday.setFullYear(nextBirthday.getFullYear() + 1);
      const daysUntilBirthday = Math.ceil((nextBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const totalDays = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
      return { years, months, days, totalDays, daysUntilNextBirthday: daysUntilBirthday };
    }
    case 'convert_units': {
      const val = args.value as number;
      const from = (args.from as string).toLowerCase();
      const to = (args.to as string).toLowerCase();
      const conversions: Record<string, Record<string, (v: number) => number>> = {
        kg: { lbs: v => v * 2.20462, oz: v => v * 35.274, g: v => v * 1000 },
        lbs: { kg: v => v / 2.20462, oz: v => v * 16, g: v => v * 453.592 },
        oz: { kg: v => v / 35.274, lbs: v => v / 16, g: v => v * 28.3495 },
        g: { kg: v => v / 1000, lbs: v => v / 453.592, oz: v => v / 28.3495 },
        cm: { in: v => v / 2.54, m: v => v / 100, ft: v => v / 30.48, mm: v => v * 10 },
        in: { cm: v => v * 2.54, m: v => v * 0.0254, ft: v => v / 12, mm: v => v * 25.4 },
        m: { cm: v => v * 100, in: v => v / 0.0254, ft: v => v * 3.28084, km: v => v / 1000 },
        ft: { cm: v => v * 30.48, in: v => v * 12, m: v => v / 3.28084, mi: v => v / 5280 },
        km: { m: v => v * 1000, mi: v => v / 1.60934, ft: v => v * 3280.84 },
        mi: { km: v => v * 1.60934, m: v => v * 1609.34, ft: v => v * 5280 },
        c: { f: v => v * 9/5 + 32, k: v => v + 273.15 },
        f: { c: v => (v - 32) * 5/9, k: v => (v - 32) * 5/9 + 273.15 },
        k: { c: v => v - 273.15, f: v => (v - 273.15) * 9/5 + 32 },
      };
      if (from === to) return { value: val, from, to, result: val };
      const converter = conversions[from]?.[to];
      if (!converter) throw new Error(`Cannot convert from ${from} to ${to}`);
      return { value: val, from, to, result: Math.round(converter(val) * 10000) / 10000 };
    }
    case 'calculate_cycle': {
      const [y, m, d] = (args.lastPeriodDate as string).split('-').map(Number);
      const lastPeriod = new Date(y, m - 1, d);
      const cycleLength = (args.cycleLength as number) || 28;
      const periodLength = (args.periodLength as number) || 5;
      const nextPeriod = new Date(lastPeriod.getTime() + cycleLength * 24 * 60 * 60 * 1000);
      const ovulationDate = new Date(nextPeriod.getTime() - 14 * 24 * 60 * 60 * 1000);
      const fertileStart = new Date(ovulationDate.getTime() - 5 * 24 * 60 * 60 * 1000);
      const fertileEnd = new Date(ovulationDate.getTime() + 1 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date(nextPeriod.getTime() + periodLength * 24 * 60 * 60 * 1000);
      return {
        nextPeriodStart: nextPeriod.toISOString().split('T')[0],
        nextPeriodEnd: periodEnd.toISOString().split('T')[0],
        ovulationDate: ovulationDate.toISOString().split('T')[0],
        fertileWindowStart: fertileStart.toISOString().split('T')[0],
        fertileWindowEnd: fertileEnd.toISOString().split('T')[0],
        cycleLength, periodLength,
      };
    }
    case 'calculate_countdown': {
      const [y, m, d] = (args.eventDate as string).split('-').map(Number);
      const eventDate = new Date(y, m - 1, d);
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const diffMs = eventDate.getTime() - now.getTime();
      const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
      const weeks = Math.floor(Math.abs(days) / 7);
      const months = Math.floor(Math.abs(days) / 30.44);
      return {
        eventName: args.eventName || 'Event',
        eventDate: args.eventDate,
        days, weeks, months,
        isPast: days < 0,
        isToday: days === 0,
      };
    }
    case 'make_decision': {
      const mode = args.mode as string;
      if (mode === 'yesNo') {
        return { decision: Math.random() < 0.5 ? 'Yes' : 'No', mode };
      }
      const options = args.options as string[];
      if (!options || options.length === 0) throw new Error('Options required for custom mode');
      return { decision: options[Math.floor(Math.random() * options.length)], mode, options };
    }
    case 'zodiac_compatibility': {
      const parseSign = (input: string): ZodiacSign => {
        if (input.includes('-')) {
          const [y, m, d] = input.split('-').map(Number);
          return getSignFromDate(m, d);
        }
        return input.toLowerCase() as ZodiacSign;
      };
      const sign1 = parseSign(args.person1 as string);
      const sign2 = parseSign(args.person2 as string);
      const compat = getCompatibility(sign1, sign2);
      const info1 = getSignInfo(sign1);
      const info2 = getSignInfo(sign2);
      return {
        person1: { sign: sign1, name: info1?.name, symbol: info1?.symbol, element: info1?.element },
        person2: { sign: sign2, name: info2?.name, symbol: info2?.symbol, element: info2?.element },
        compatibility: compat,
        level: compat >= 80 ? 'Excellent' : compat >= 60 ? 'Good' : compat >= 40 ? 'Moderate' : 'Challenging',
      };
    }
    case 'get_zodiac_sign': {
      const [, m, d] = (args.birthDate as string).split('-').map(Number);
      const sign = getSignFromDate(m, d);
      const info = getSignInfo(sign);
      return { sign, name: info?.name, symbol: info?.symbol, element: info?.element, traits: info?.traits };
    }
    case 'generate_names': {
      const type = args.type as string;
      const gender = (args.gender as string) || 'any';
      const count = (args.count as number) || 5;
      const maleFirst = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth'];
      const femaleFirst = ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle'];
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
      const fantasyPrefixes = ['Aer', 'Bal', 'Cor', 'Dra', 'El', 'Fae', 'Gal', 'Ith', 'Kal', 'Lor', 'Mal', 'Nar', 'Ori', 'Pyr', 'Quel', 'Rav', 'Syl', 'Thal', 'Val', 'Zar'];
      const fantasySuffixes = ['ius', 'ara', 'eon', 'ith', 'orn', 'wyn', 'dor', 'iel', 'ath', 'rix', 'oth', 'ael', 'ion', 'ira', 'oth'];
      const dogNames = ['Max', 'Buddy', 'Charlie', 'Cooper', 'Rocky', 'Bear', 'Duke', 'Tucker', 'Jack', 'Milo', 'Bella', 'Luna', 'Lucy', 'Daisy', 'Sadie', 'Molly', 'Bailey', 'Maggie', 'Sophie', 'Chloe'];
      const catNames = ['Oliver', 'Leo', 'Milo', 'Charlie', 'Simba', 'Max', 'Jack', 'Loki', 'Tiger', 'Jasper', 'Luna', 'Bella', 'Chloe', 'Lucy', 'Nala', 'Kitty', 'Cleo', 'Willow', 'Lily', 'Gracie'];
      const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
      const names: string[] = [];
      for (let i = 0; i < count; i++) {
        if (type === 'first') {
          const pool = gender === 'male' ? maleFirst : gender === 'female' ? femaleFirst : [...maleFirst, ...femaleFirst];
          names.push(pick(pool));
        } else if (type === 'full') {
          const pool = gender === 'male' ? maleFirst : gender === 'female' ? femaleFirst : [...maleFirst, ...femaleFirst];
          names.push(`${pick(pool)} ${pick(lastNames)}`);
        } else if (type === 'fantasy') {
          names.push(`${pick(fantasyPrefixes)}${pick(fantasySuffixes)}`);
        } else if (type === 'pet') {
          const petType = args.petType as string;
          const pool = petType === 'dog' ? dogNames : petType === 'cat' ? catNames : [...dogNames, ...catNames];
          names.push(pick(pool));
        }
      }
      return { type, gender, count, names };
    }
    case 'calculate_position_size': {
      const capital = args.capital as number;
      const entry = args.entryPrice as number;
      const stopLoss = args.stopLossPrice as number;
      const riskPercent = args.riskPercent as number;
      const direction = args.direction as string;
      const riskAmount = capital * (riskPercent / 100);
      const priceDiff = direction === 'long' ? entry - stopLoss : stopLoss - entry;
      if (priceDiff <= 0) throw new Error('Invalid stop loss for direction');
      const positionSize = riskAmount / priceDiff;
      const positionValue = positionSize * entry;
      return {
        positionSize: Math.round(positionSize * 100) / 100,
        positionValue: Math.round(positionValue * 100) / 100,
        riskAmount: Math.round(riskAmount * 100) / 100,
        riskPercent,
        stopLossDistance: Math.round(priceDiff * 100) / 100,
        stopLossPercent: Math.round((priceDiff / entry) * 10000) / 100,
      };
    }
    case 'calculate_sleep_times': {
      const mode = args.mode as string;
      const ageGroup = (args.ageGroup as string) || 'adult';
      const cycleMinutes = 90;
      const fallAsleepMinutes = 15;
      const cycles: Record<string, number[]> = {
        adult: [4, 5, 6], teen: [5, 6, 7], child: [5, 6, 7], toddler: [6, 7, 8], infant: [7, 8, 9],
      };
      const targetCycles = cycles[ageGroup] || cycles.adult;
      const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const formatTime = (mins: number) => { const h = Math.floor(((mins % 1440) + 1440) % 1440 / 60); const m = ((mins % 1440) + 1440) % 1440 % 60; return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`; };
      if (mode === 'wakeAt') {
        const wakeMinutes = parseTime(args.time as string);
        const sleepTimes = targetCycles.map(c => formatTime(wakeMinutes - c * cycleMinutes - fallAsleepMinutes));
        return { mode, wakeTime: args.time, suggestedBedtimes: sleepTimes, cycles: targetCycles };
      } else if (mode === 'sleepAt') {
        const sleepMinutes = parseTime(args.time as string);
        const wakeTimes = targetCycles.map(c => formatTime(sleepMinutes + fallAsleepMinutes + c * cycleMinutes));
        return { mode, bedtime: args.time, suggestedWakeTimes: wakeTimes, cycles: targetCycles };
      } else {
        const now = new Date();
        const sleepMinutes = now.getHours() * 60 + now.getMinutes();
        const wakeTimes = targetCycles.map(c => formatTime(sleepMinutes + fallAsleepMinutes + c * cycleMinutes));
        return { mode, currentTime: formatTime(sleepMinutes), suggestedWakeTimes: wakeTimes, cycles: targetCycles };
      }
    }
    case 'spin_wheel': {
      const options = args.options as string[];
      if (!options || options.length === 0) throw new Error('Options required');
      const index = Math.floor(Math.random() * options.length);
      return { result: options[index], index, totalOptions: options.length, options };
    }
    case 'convert_timezone': {
      const time = args.time as string;
      const fromTz = args.fromTimezone as string;
      const toTzs = args.toTimezones as string[];
      const [h, m] = time.split(':').map(Number);
      const getOffset = (tz: string): number => {
        if (tz === 'UTC') return 0;
        const match = tz.match(/UTC([+-])(\d+)/);
        if (match) return parseInt(match[1] + match[2]);
        const cityOffsets: Record<string, number> = {
          'America/New_York': -5, 'America/Los_Angeles': -8, 'America/Chicago': -6,
          'Europe/London': 0, 'Europe/Paris': 1, 'Europe/Berlin': 1,
          'Asia/Tokyo': 9, 'Asia/Shanghai': 8, 'Asia/Singapore': 8,
          'Australia/Sydney': 10,
        };
        return cityOffsets[tz] || 0;
      };
      const fromOffset = getOffset(fromTz);
      const results = toTzs.map(tz => {
        const toOffset = getOffset(tz);
        const diff = toOffset - fromOffset;
        let newH = h + diff;
        let dayChange = '';
        if (newH >= 24) { newH -= 24; dayChange = ' (+1 day)'; }
        if (newH < 0) { newH += 24; dayChange = ' (-1 day)'; }
        return { timezone: tz, time: `${newH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}${dayChange}` };
      });
      return { sourceTime: time, sourceTimezone: fromTz, conversions: results };
    }
    case 'generate_unique_id': {
      const type = args.type as string;
      const count = (args.count as number) || 1;
      const length = (args.length as number) || 8;
      const ids: string[] = [];
      for (let i = 0; i < count; i++) {
        if (type === 'uuid') {
          ids.push('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          }));
        } else if (type === 'short') {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
          ids.push(Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
        } else if (type === 'numeric') {
          ids.push(Array.from({ length }, () => Math.floor(Math.random() * 10)).join(''));
        } else if (type === 'alphanumeric') {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          ids.push(Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
        }
      }
      return { type, count, length: type === 'uuid' ? 36 : length, ids };
    }
    case 'lucky_number': {
      const max = (args.max as number) || 2147483647;
      return { luckyNumber: Math.floor(Math.random() * max) + 1, max };
    }
    case 'roll_dice': {
      const sides = (args.sides as number) || 6;
      const count = (args.count as number) || 1;
      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
      return { sides, count, rolls, total: rolls.reduce((a, b) => a + b, 0) };
    }
    case 'vibe_check': {
      const answers = args.answers as ('A' | 'B')[];
      if (!answers || answers.length !== 10) throw new Error('Exactly 10 answers required');
      const catScore = answers.filter(a => a === 'A').length;
      const dogScore = answers.filter(a => a === 'B').length;
      const type = catScore >= dogScore ? 'cat' : 'dog';
      const percentage = Math.round((Math.max(catScore, dogScore) / 10) * 100);
      let title: string, description: string;
      if (type === 'cat') {
        if (percentage >= 80) { title = 'Total Cat Person! 🐱'; description = 'Independent, mysterious, values personal space.'; }
        else if (percentage >= 60) { title = 'Mostly Cat Person 😺'; description = 'Leans towards independence but can be social.'; }
        else { title = 'Cat-Leaning 🐈'; description = 'Nice balance but slightly prefers the cat lifestyle.'; }
      } else {
        if (percentage >= 80) { title = 'Total Dog Person! 🐕'; description = 'Loyal, enthusiastic, loves being around people.'; }
        else if (percentage >= 60) { title = 'Mostly Dog Person 🐶'; description = 'Social and friendly but appreciates downtime.'; }
        else { title = 'Dog-Leaning 🦮'; description = 'Nice balance but slightly prefers the dog lifestyle.'; }
      }
      return { type, catScore, dogScore, percentage, title, description };
    }
    case 'calculate_iq_score': {
      const correct = args.correctAnswers as number;
      const total = (args.totalQuestions as number) || 15;
      const time = args.timeTakenSeconds as number | undefined;
      const baseScore = 85 + (correct / total) * 45; // Range: 85-130 base
      let timeBonus = 0;
      if (time && time < 300) timeBonus = 5; // Under 5 min bonus
      else if (time && time < 600) timeBonus = 2; // Under 10 min small bonus
      const estimatedIQ = Math.round(baseScore + timeBonus);
      let category: string;
      if (estimatedIQ >= 130) category = 'Very Superior';
      else if (estimatedIQ >= 120) category = 'Superior';
      else if (estimatedIQ >= 110) category = 'High Average';
      else if (estimatedIQ >= 90) category = 'Average';
      else if (estimatedIQ >= 80) category = 'Low Average';
      else category = 'Below Average';
      return { estimatedIQ, category, correctAnswers: correct, totalQuestions: total, accuracy: Math.round((correct / total) * 100) };
    }
    case 'calculate_uniqueness': {
      const age = args.age as number;
      const gender = args.gender as 'male' | 'female';
      const heightCm = args.heightCm as number | undefined;
      const weightKg = args.weightKg as number | undefined;
      const eyeColor = args.eyeColor as string | undefined;
      const hairColor = args.hairColor as string | undefined;
      const worldPop = 8_000_000_000;
      let remaining = worldPop;
      const steps: { trait: string; percentage: number; remaining: number }[] = [];
      // Gender filter (roughly 50/50)
      remaining = Math.round(remaining * 0.5);
      steps.push({ trait: `Gender: ${gender}`, percentage: 50, remaining });
      // Age filter (rough distribution)
      const agePercent = age < 18 ? 25 : age < 35 ? 20 : age < 50 ? 18 : age < 65 ? 15 : 12;
      remaining = Math.round(remaining * (agePercent / 100));
      steps.push({ trait: `Age: ~${age} years`, percentage: agePercent, remaining });
      // Height filter (if provided)
      if (heightCm) {
        const heightPercent = 15; // Approximate for specific height range
        remaining = Math.round(remaining * (heightPercent / 100));
        steps.push({ trait: `Height: ${heightCm}cm`, percentage: heightPercent, remaining });
      }
      // Weight filter (if provided)
      if (weightKg) {
        const weightPercent = 15;
        remaining = Math.round(remaining * (weightPercent / 100));
        steps.push({ trait: `Weight: ${weightKg}kg`, percentage: weightPercent, remaining });
      }
      // Eye color (if provided)
      const eyeColorPercents: Record<string, number> = { brown: 79, blue: 8, hazel: 5, green: 2, gray: 3, amber: 3 };
      if (eyeColor && eyeColorPercents[eyeColor]) {
        remaining = Math.round(remaining * (eyeColorPercents[eyeColor] / 100));
        steps.push({ trait: `Eye color: ${eyeColor}`, percentage: eyeColorPercents[eyeColor], remaining });
      }
      // Hair color (if provided)
      const hairColorPercents: Record<string, number> = { black: 75, brown: 11, blonde: 2, red: 1, gray: 8, white: 3 };
      if (hairColor && hairColorPercents[hairColor]) {
        remaining = Math.round(remaining * (hairColorPercents[hairColor] / 100));
        steps.push({ trait: `Hair color: ${hairColor}`, percentage: hairColorPercents[hairColor], remaining });
      }
      const uniquenessRatio = worldPop / remaining;
      return { worldPopulation: worldPop, matchingPeople: remaining, uniquenessRatio: `1 in ${Math.round(uniquenessRatio).toLocaleString()}`, steps };
    }
    case 'when_date_info': {
      const dateStr = args.date as string;
      const result = DateCalculator.calculate(dateStr);
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const diffDays = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const totalHours = Math.abs(diffDays) * 24;
      const totalMinutes = totalHours * 60;
      const weeks = Math.abs(diffDays) / 7;
      return {
        ...result,
        daysFromToday: diffDays,
        isPast: diffDays < 0,
        isFuture: diffDays > 0,
        isToday: diffDays === 0,
        totalHours,
        totalMinutes,
        weeks: Math.round(weeks * 10) / 10,
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Base URL for widgets
const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://tulzo.vercel.app';

// Map tool names to widget types
function getWidgetType(toolName: string): string | null {
  const widgetMap: Record<string, string> = {
    'calculate_bmi': 'bmi',
    'calculate_tip': 'tip',
    'coin_flip': 'coin_flip',
    'roll_dice': 'dice',
    'calculate_age': 'age',
    'zodiac_compatibility': 'zodiac',
    'calculate_countdown': 'countdown',
    'make_decision': 'decision',
    'random_number': 'random_number',
    'lucky_number': 'lucky_number',
    'pick_random': 'pick_random',
    'spin_wheel': 'pick_random',
  };
  return widgetMap[toolName] || null;
}

// Generate widget URL for embeddable results
function generateWidgetUrl(toolName: string, result: unknown, args: Record<string, unknown>): string | null {
  const widgetType = getWidgetType(toolName);
  if (!widgetType) return null;

  // Prepare widget data based on tool type
  let widgetData: Record<string, unknown> = result as Record<string, unknown>;

  // Add input args to widget data for context
  if (toolName === 'calculate_bmi') {
    widgetData = { ...widgetData, weight: args.weight, height: args.height };
  } else if (toolName === 'spin_wheel') {
    // Map spin_wheel result to pick_random format
    widgetData = { selected: (result as { result: string }).result, totalItems: (args.options as string[]).length };
  }

  const encodedData = encodeURIComponent(JSON.stringify(widgetData));
  return `${BASE_URL}/embed?tool=${widgetType}&data=${encodedData}`;
}

// Format result as human-readable text
function formatResultText(toolName: string, result: unknown): string {
  const r = result as Record<string, unknown>;

  switch (toolName) {
    case 'calculate_bmi':
      return `BMI: ${r.bmi} (${r.category})`;
    case 'calculate_tip':
      return `Bill: $${r.billAmount} + Tip (${r.tipPercent}%): $${r.tipAmount} = Total: $${r.total}${(r.splitWays as number) > 1 ? ` ($${r.perPerson} per person)` : ''}`;
    case 'coin_flip':
      return `🪙 Result: ${(r.result as string).toUpperCase()}`;
    case 'roll_dice':
      return `🎲 Rolled: ${(r.rolls as number[]).join(', ')} (Total: ${r.total})`;
    case 'calculate_age':
      return `Age: ${r.years} years, ${r.months} months, ${r.days} days (${r.totalDays} total days). Next birthday in ${r.daysUntilNextBirthday} days.`;
    case 'zodiac_compatibility':
      return `${(r.person1 as { name: string }).name} ❤️ ${(r.person2 as { name: string }).name}: ${r.compatibility}% compatibility (${r.level})`;
    case 'calculate_countdown':
      return `${r.eventName}: ${Math.abs(r.days as number)} days ${r.isPast ? 'ago' : 'to go'} (${r.weeks} weeks, ${r.months} months)`;
    case 'make_decision':
      return `Decision: ${r.decision}`;
    case 'random_number':
      return `Random number (${r.min}-${r.max}): ${r.result}`;
    case 'lucky_number':
      return `🍀 Lucky number: ${r.luckyNumber}`;
    case 'pick_random':
    case 'spin_wheel':
      return `Selected: ${r.result || r.selected}`;
    default:
      return JSON.stringify(result, null, 2);
  }
}

// Handle MCP requests
function handleMCPRequest(request: MCPRequest): MCPResponse {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'tulzo-mcp', version: '1.0.0' },
          },
        };
      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
      case 'tools/call': {
        const toolName = (params as { name: string }).name;
        const toolArgs = (params as { arguments?: Record<string, unknown> }).arguments || {};
        const result = executeTool(toolName, toolArgs);

        // Generate widget URL if available
        const widgetUrl = generateWidgetUrl(toolName, result, toolArgs);

        // Build content array with text and optional widget
        const content: Array<{ type: string; text?: string; url?: string; mimeType?: string }> = [
          { type: 'text', text: formatResultText(toolName, result) },
        ];

        // Add JSON data as secondary text content
        content.push({ type: 'text', text: `\n\nRaw data:\n${JSON.stringify(result, null, 2)}` });

        // Add widget URL as resource if available (for clients that support it)
        if (widgetUrl) {
          content.push({
            type: 'resource',
            url: widgetUrl,
            mimeType: 'text/html',
          });
          // Also add as text for clients that don't support resources
          content.push({ type: 'text', text: `\n\n📊 Interactive widget: ${widgetUrl}` });
        }

        return { jsonrpc: '2.0', id, result: { content } };
      }
      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
  } catch (error) {
    return { jsonrpc: '2.0', id, error: { code: -32000, message: String(error) } };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = handleMCPRequest(body as MCPRequest);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Tulzo MCP Server',
    version: '1.0.0',
    description: 'Model Context Protocol server for Tulzo tools',
    tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
  });
}


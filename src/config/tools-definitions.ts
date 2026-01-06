/**
 * Shared Tool Definitions
 *
 * This file is the SINGLE SOURCE OF TRUTH for all MCP tool definitions.
 * Both the MCP API route (/api/mcp) and the tools documentation API (/api/tools) use these.
 *
 * To add a new tool:
 * 1. Add the tool definition to TOOL_DEFINITIONS array below (including invocationMessages)
 * 2. Add the execution handler in app/api/mcp/route.ts (executeTool function)
 * 3. Add widget HTML generator in app/api/mcp/route.ts (generateWidgetHtml function)
 * 4. Add template data in app/api/mcp/route.ts (getTemplateData function)
 * 5. Add formatResultText in app/api/mcp/route.ts
 */

import { TIMEZONE_IDS } from '../utils/ZoneCalculator';
import { ALL_UNITS } from '../utils/UnitConverter';
import { PERCENT_OPERATIONS } from '../utils/PercentCalculator';

/**
 *
 * GUIDELINE FOR UNIFYING MCP TOOLS WITH UI:
 * When a tool has both MCP and UI implementations, follow this pattern (see calculate_tip as example):
 *
 * 1. CREATE SHARED CALCULATOR: Create a shared function in src/utils/<ToolName>Calculator.ts
 *    - Define input/output types with all parameters
 *    - Use enums for categorical parameters (e.g., 'static' | 'mood')
 *    - Handle defaults inside the function
 *    - Only billAmount-like core params should be required; rest computed with defaults
 *
 * 2. UPDATE THIS FILE (tools-definitions.ts):
 *    - inputSchema properties must match the shared function's input type
 *    - Use enum arrays for categorical params
 *    - Only truly required params in 'required' array
 *    - Description should explain mode behavior
 *
 * 3. UPDATE MCP EXECUTION (route.ts):
 *    - Import and call the shared function
 *    - Map args to the shared function's input type
 *    - Return result (may need field name mapping for widget compatibility)
 *
 * 4. UPDATE UI COMPONENT:
 *    - Import and use the shared function
 *    - Remove duplicate calculation logic
 *
 * Example: calculate_tip uses src/utils/TipCalculator.ts
 */

// Tool categories
export const TOOL_CATEGORIES = {
  HEALTH: 'Health & Fitness',
  FINANCE: 'Finance',
  DATE_TIME: 'Date & Time',
  FUN: 'Fun & Games',
  UTILITIES: 'Utilities',
  ASTRONOMY: 'Astronomy',
} as const;

export type ToolCategory = typeof TOOL_CATEGORIES[keyof typeof TOOL_CATEGORIES];

// Schema types
export interface SchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  items?: { type: string; enum?: string[]; properties?: Record<string, SchemaProperty> };
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required: string[];
}

export interface ToolOutputSchema {
  type: 'object';
  properties: Record<string, SchemaProperty | { type: string; items?: unknown }>;
}

export interface InvocationMessages {
  invoking: string;
  invoked: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  hasWidget: boolean;
  inputSchema: ToolInputSchema;
  outputSchema: ToolOutputSchema;
  invocationMessages?: InvocationMessages;
}

/**
 * All tool definitions - shared between MCP and documentation APIs
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // ============ HEALTH & FITNESS ============
  {
    name: 'calculate_bmi',
    description: 'Calculate Body Mass Index (BMI) from weight and height',
    category: TOOL_CATEGORIES.HEALTH,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating BMI...', invoked: 'BMI calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        weight: { type: 'number', description: 'Weight in kilograms' },
        height: { type: 'number', description: 'Height in centimeters' },
      },
      required: ['weight', 'height'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        bmi: { type: 'number', description: 'Calculated BMI value' },
        category: { type: 'string', enum: ['Underweight', 'Normal', 'Overweight', 'Obese'], description: 'BMI category' },
        weight: { type: 'number', description: 'Input weight in kg' },
        height: { type: 'number', description: 'Input height in cm' },
      },
    },
  },
  {
    name: 'calculate_ideal_weight',
    description: 'Calculate ideal weight using the Devine formula',
    category: TOOL_CATEGORIES.HEALTH,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating ideal weight...', invoked: 'Ideal weight calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        height: { type: 'number', description: 'Height in centimeters' },
        sex: { type: 'string', enum: ['male', 'female', 'other'], description: 'Biological sex' },
      },
      required: ['height', 'sex'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        idealWeight: { type: 'number', description: 'Ideal weight in kg' },
        formula: { type: 'string', description: 'Formula used (Devine)' },
        height: { type: 'number' },
        gender: { type: 'string' },
      },
    },
  },
  {
    name: 'calculate_bmr',
    description: 'Calculate Basal Metabolic Rate using Mifflin-St Jeor equation and TDEE',
    category: TOOL_CATEGORIES.HEALTH,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating metabolic rate...', invoked: 'BMR calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        weight: { type: 'number', description: 'Weight in kilograms' },
        height: { type: 'number', description: 'Height in centimeters' },
        age: { type: 'number', description: 'Age in years' },
        sex: { type: 'string', enum: ['male', 'female', 'other'], description: 'Biological sex' },
        activityLevel: { type: 'string', enum: ['sedentary', 'light', 'moderate', 'active', 'veryActive'], description: 'Activity level' },
      },
      required: ['weight', 'height', 'age', 'sex'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        bmr: { type: 'number', description: 'Basal Metabolic Rate in calories/day' },
        tdee: { type: 'number', description: 'Total Daily Energy Expenditure' },
        activityLevel: { type: 'string' },
      },
    },
  },
  {
    name: 'generate_weight_loss_plan',
    description: 'Generate a complete weight loss plan with calorie targets and fasting recommendations',
    category: TOOL_CATEGORIES.HEALTH,
    hasWidget: true,
    invocationMessages: { invoking: 'Generating weight loss plan...', invoked: 'Plan generated' },
    inputSchema: {
      type: 'object',
      properties: {
        age: { type: 'number', description: 'Age in years' },
        sex: { type: 'string', enum: ['male', 'female', 'other'] },
        height: { type: 'number', description: 'Height in centimeters' },
        currentWeight: { type: 'number', description: 'Current weight in kg' },
        desiredWeight: { type: 'number', description: 'Target weight in kg' },
        timeToWeight: { type: 'number', description: 'Weeks to reach goal (optional)' },
        activityLevel: { type: 'string', enum: ['sedentary', 'light', 'moderate', 'active', 'veryActive'] },
      },
      required: ['age', 'sex', 'height', 'currentWeight', 'desiredWeight'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        currentWeight: { type: 'number' },
        targetWeight: { type: 'number' },
        weeksToGoal: { type: 'number' },
        dailyCalories: { type: 'number' },
        weeklyWeightLoss: { type: 'number' },
        bmr: { type: 'number' },
        tdee: { type: 'number' },
      },
    },
  },
  {
    name: 'calculate_sleep',
    description: 'Calculate optimal sleep and wake times based on sleep cycles',
    category: TOOL_CATEGORIES.HEALTH,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating sleep times...', invoked: 'Sleep times ready' },
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['wakeAt', 'sleepAt', 'sleepNow'], description: 'Calculation mode' },
        time: { type: 'string', description: 'Time in HH:MM format (24-hour)' },
      },
      required: ['mode'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string' },
        inputTime: { type: 'string' },
        times: { type: 'array', items: { type: 'object' } },
      },
    },
  },
  {
    name: 'calculate_cycle',
    description: 'Calculate menstrual cycle predictions including next period date, fertile window, ovulation date, and current cycle phase. Supports both simplified mode (average 28-day cycle) and advanced mode with custom cycle/period lengths.',
    category: TOOL_CATEGORIES.HEALTH,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating cycle predictions...', invoked: 'Cycle predictions ready!' },
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date of period in YYYY-MM-DD format. Example: "2026-01-01"' },
        isFirstDay: { type: 'boolean', description: 'If true (default), date is first day of period. If false, date is last day of bleeding.' },
        simplified: { type: 'boolean', description: 'If true, use simplified mode with average 28-day cycle and 5-day period. Ignores cycleLength and periodLength.' },
        cycleLength: { type: 'number', description: 'Average cycle length in days (default: 28). Only used when simplified is false.' },
        periodLength: { type: 'number', description: 'Average period length in days (default: 5). Only used when simplified is false.' },
      },
      required: ['date'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        nextPeriodStart: { type: 'string', description: 'Next period start date (YYYY-MM-DD)' },
        nextPeriodEnd: { type: 'string', description: 'Next period end date (YYYY-MM-DD)' },
        ovulationDate: { type: 'string', description: 'Predicted ovulation date (YYYY-MM-DD)' },
        fertileWindowStart: { type: 'string', description: 'Fertile window start date (YYYY-MM-DD)' },
        fertileWindowEnd: { type: 'string', description: 'Fertile window end date (YYYY-MM-DD)' },
        currentDay: { type: 'number', description: 'Current day in the cycle (1-based)' },
        phase: { type: 'string', description: 'Current phase: menstrual, follicular, ovulation, or luteal' },
        daysUntilNextPeriod: { type: 'number', description: 'Days until next period starts' },
        cycleLength: { type: 'number', description: 'Cycle length used for calculation' },
        periodLength: { type: 'number', description: 'Period length used for calculation' },
        mode: { type: 'string', description: '"simplified" or "advanced"' },
        phaseInfo: { type: 'object', description: 'Phase details with name, emoji, color, and description' },
      },
    },
  },
  {
    name: 'blood_calculator',
    description: 'Blood calculator with three modes: "donation" (check donation eligibility), "compatibility" (blood type transfusion compatibility), "baby" (predict baby blood type from parents). Mode determines required fields - tool will error with missing fields for each mode.',
    category: TOOL_CATEGORIES.HEALTH,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating blood info...', invoked: 'Blood calculation complete' },
    inputSchema: {
      type: 'object',
      properties: {
        // Mode selector
        calculatorMode: { type: 'string', enum: ['donation', 'compatibility', 'baby'], description: 'Calculator mode: "donation" for eligibility, "compatibility" for transfusion matching, "baby" for predicting baby blood type' },
        // Donation mode fields
        age: { type: 'number', description: 'Age in years (donation mode)' },
        weight: { type: 'number', description: 'Weight in kg (metric) or lbs (imperial) (donation mode)' },
        height: { type: 'number', description: 'Height in cm (metric only) (donation mode)' },
        gender: { type: 'string', enum: ['male', 'female'], description: 'Gender for blood volume calculation (donation mode)' },
        unitSystem: { type: 'string', enum: ['metric', 'imperial'], description: 'Unit system. Default: metric (donation mode)' },
        heightFeet: { type: 'number', description: 'Height feet component (imperial only) (donation mode)' },
        heightInches: { type: 'number', description: 'Height inches component (imperial only) (donation mode)' },
        // Compatibility mode fields
        bloodType: { type: 'string', enum: ['A', 'B', 'AB', 'O'], description: 'ABO blood type (compatibility mode)' },
        rhFactor: { type: 'string', enum: ['+', '-'], description: 'Rh factor positive or negative (compatibility mode)' },
        // Baby mode fields
        fatherBloodType: { type: 'string', enum: ['A', 'B', 'AB', 'O'], description: 'Father\'s ABO blood type (baby mode)' },
        fatherRh: { type: 'string', enum: ['+', '-'], description: 'Father\'s Rh factor (baby mode)' },
        motherBloodType: { type: 'string', enum: ['A', 'B', 'AB', 'O'], description: 'Mother\'s ABO blood type (baby mode)' },
        motherRh: { type: 'string', enum: ['+', '-'], description: 'Mother\'s Rh factor (baby mode)' },
      },
      required: ['calculatorMode'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        // Common
        calculatorMode: { type: 'string' },
        // Donation mode output
        eligible: { type: 'boolean' },
        amount: { type: 'number' },
        maxSafeAmount: { type: 'number' },
        bloodVolume: { type: 'number' },
        warnings: { type: 'array', items: { type: 'string' } },
        tips: { type: 'array', items: { type: 'string' } },
        // Compatibility mode output
        fullBloodType: { type: 'string' },
        canDonateTo: { type: 'array', items: { type: 'string' } },
        canReceiveFrom: { type: 'array', items: { type: 'string' } },
        isUniversalDonor: { type: 'boolean' },
        isUniversalRecipient: { type: 'boolean' },
        // Baby mode output
        possibleTypes: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, percentage: { type: 'number' } } } },
        rhIncompatibilityRisk: { type: 'boolean' },
        rhWarning: { type: 'string' },
      },
    },
  },
  // ============ FINANCE ============
  {
    name: 'calculate_tip',
    description: 'Calculate tip amount and total bill. Supports two modes: "static" (provide tipPercentage directly) or "mood" (compute tip from serviceQuality, mood, and budgetSituation). If tipPercentage is not provided, mood mode is used automatically.',
    category: TOOL_CATEGORIES.FINANCE,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating tip...', invoked: 'Tip calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        billAmount: { type: 'number', description: 'Bill amount before tip (required)' },
        tipPercentage: { type: 'number', description: 'Tip percentage (e.g., 15, 18, 20). Required for static mode, ignored in mood mode.' },
        splitBetween: { type: 'number', description: 'Number of people to split between (default: 1)' },
        calculatorMode: { type: 'string', enum: ['static', 'mood'], description: 'Calculator mode: "static" uses tipPercentage directly, "mood" computes from feelings. Default: "static" if tipPercentage provided, else "mood".' },
        serviceQuality: { type: 'string', enum: ['terrible', 'poor', 'okay', 'good', 'amazing'], description: 'How was the service? Used in mood mode. Default: "okay".' },
        mood: { type: 'string', enum: ['awful', 'meh', 'neutral', 'happy', 'great'], description: 'How are you feeling? Used in mood mode. Default: "neutral".' },
        budgetSituation: { type: 'string', enum: ['very_tight', 'tight', 'normal', 'comfortable', 'generous'], description: 'Budget situation. Used in mood mode. Default: "normal".' },
      },
      required: ['billAmount'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        billAmount: { type: 'number' },
        tipPercentage: { type: 'number' },
        tipAmount: { type: 'number' },
        total: { type: 'number' },
        perPerson: { type: 'number' },
        splitBetween: { type: 'number' },
        calculatorMode: { type: 'string' },
        suggested: { type: 'boolean' },
      },
    },
  },
  {
    name: 'calculate_compound_interest',
    description: 'Calculate compound interest growth over time',
    category: TOOL_CATEGORIES.FINANCE,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating compound interest...', invoked: 'Interest calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        principal: { type: 'number', description: 'Initial investment amount' },
        rate: { type: 'number', description: 'Annual interest rate (percentage)' },
        time: { type: 'number', description: 'Time period in years' },
        compoundingFrequency: { type: 'string', enum: ['annually', 'semi-annually', 'quarterly', 'monthly', 'daily'] },
        monthlyContribution: { type: 'number', description: 'Monthly contribution (optional)' },
      },
      required: ['principal', 'rate', 'time'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        finalAmount: { type: 'number' },
        totalInterest: { type: 'number' },
        totalContributions: { type: 'number' },
        effectiveRate: { type: 'number' },
      },
    },
  },
  {
    name: 'calculate_position_size',
    description: 'Calculate trading position size based on risk management',
    category: TOOL_CATEGORIES.FINANCE,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating position size...', invoked: 'Position size ready' },
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['riskAndSL', 'riskOnly'] },
        capital: { type: 'number', description: 'Total trading capital' },
        entryPrice: { type: 'number', description: 'Entry price' },
        stopLossPrice: { type: 'number', description: 'Stop loss price' },
        riskPercent: { type: 'number', description: 'Risk percentage of capital' },
        direction: { type: 'string', enum: ['long', 'short'] },
      },
      required: ['capital', 'entryPrice', 'riskPercent', 'direction'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        positionSize: { type: 'number' },
        shares: { type: 'number' },
        riskAmount: { type: 'number' },
        stopLoss: { type: 'number' },
        stopLossPercent: { type: 'number' },
      },
    },
  },
  {
    name: 'calculate_savings_plan',
    description: 'Calculate a budget and savings plan. Supports two modes: (1) Goal mode - save until you reach a target amount, (2) Duration mode - save for a specific number of months. Optionally include compound interest from a savings account.',
    category: TOOL_CATEGORIES.FINANCE,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating savings plan...', invoked: 'Savings plan ready' },
    inputSchema: {
      type: 'object',
      properties: {
        monthlyIncome: { type: 'number', description: 'Monthly net income (after taxes)' },
        monthlyTaxes: { type: 'number', description: 'Monthly taxes (set to 0 if using net income)' },
        monthlyFixedExpenses: { type: 'number', description: 'Fixed monthly expenses (rent, utilities, subscriptions)' },
        currentSavings: { type: 'number', description: 'Current savings amount' },
        savingsMode: { type: 'string', enum: ['goal', 'duration'], description: 'Mode: "goal" to reach a target amount, "duration" to save for X months' },
        savingsGoal: { type: 'number', description: 'Target savings amount (required if savingsMode is "goal")' },
        savingsDurationMonths: { type: 'number', description: 'Number of months to save (required if savingsMode is "duration")' },
        intensity: { type: 'string', enum: ['light', 'medium', 'aggressive'], description: 'Savings intensity: light (10%), medium (25%), aggressive (40%) of disposable income' },
        currency: { type: 'string', enum: ['USD', 'EUR', 'GBP', 'JPY', 'RON'] },
        interestEnabled: { type: 'boolean', description: 'Enable compound interest from savings account (optional)' },
        interestRate: { type: 'number', description: 'Annual interest rate as percentage, e.g., 5 for 5% (optional, requires interestEnabled)' },
        compoundingFrequency: { type: 'string', enum: ['yearly', 'monthly', 'daily'], description: 'How often interest compounds (optional, default: yearly)' },
      },
      required: ['monthlyIncome', 'monthlyFixedExpenses', 'currentSavings', 'intensity', 'currency'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        monthlySavings: { type: 'number', description: 'Amount to save each month' },
        monthsToGoal: { type: 'number', description: 'Number of months in the plan' },
        finalBalance: { type: 'number', description: 'Final savings balance at end of plan' },
        totalInterestEarned: { type: 'number', description: 'Total interest earned (if interest enabled)' },
        disposableIncome: { type: 'number', description: 'Monthly disposable income after fixed expenses' },
        savingsRate: { type: 'number', description: 'Percentage of disposable income being saved' },
        savingsMode: { type: 'string', description: 'The savings mode used (goal or duration)' },
      },
    },
  },
  // ============ DATE & TIME ============
  {
    name: 'calculate_age',
    description: 'Calculate age from birthdate with detailed breakdown',
    category: TOOL_CATEGORIES.DATE_TIME,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating age...', invoked: 'Age calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        birthDate: { type: 'string', description: 'Birth date in YYYY-MM-DD format' },
      },
      required: ['birthDate'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        years: { type: 'number' },
        months: { type: 'number' },
        days: { type: 'number' },
        totalDays: { type: 'number' },
        nextBirthday: { type: 'string' },
        daysUntilBirthday: { type: 'number' },
      },
    },
  },
  {
    name: 'zone_calculator',
    description: 'Convert time between timezones. Supports UTC offsets (e.g., UTC+5, UTC-8) and major city timezones (e.g., America/New_York, Europe/London, Asia/Tokyo). Returns converted times with day change indicators.',
    category: TOOL_CATEGORIES.DATE_TIME,
    hasWidget: true,
    invocationMessages: { invoking: 'Converting timezone...', invoked: 'Timezone converted' },
    inputSchema: {
      type: 'object',
      properties: {
        time: { type: 'string', description: 'Time in HH:MM format (24-hour), e.g., "14:30"' },
        fromTimezone: { type: 'string', enum: TIMEZONE_IDS, description: 'Source timezone. Use UTC offsets (UTC-5, UTC+8) or IANA timezone IDs (America/New_York, Europe/London, Asia/Tokyo)' },
        toTimezones: { type: 'array', items: { type: 'string', enum: TIMEZONE_IDS }, description: 'Target timezones to convert to. Use UTC offsets or IANA timezone IDs' },
      },
      required: ['time', 'fromTimezone', 'toTimezones'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        sourceTime: { type: 'string', description: 'Original time in HH:MM format' },
        sourceTimezone: { type: 'string', description: 'Source timezone ID' },
        sourceCity: { type: 'string', description: 'Source city name' },
        conversions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              timezone: { type: 'string', description: 'Target timezone ID' },
              city: { type: 'string', description: 'Target city name' },
              time: { type: 'string', description: 'Converted time in HH:MM format' },
              offset: { type: 'number', description: 'UTC offset of target timezone' },
              offsetDiff: { type: 'number', description: 'Offset difference from source' },
              dayChange: { type: 'string', description: 'Day change indicator (+1 day, -1 day, or empty)' },
            },
          },
        },
      },
    },
  },
  {
    name: 'calculate_countdown',
    description: 'Calculate the number of days, weeks, and months until or since a specific date. Perfect for tracking upcoming events, anniversaries, deadlines, or calculating how long ago something happened.',
    category: TOOL_CATEGORIES.DATE_TIME,
    hasWidget: true,
    invocationMessages: { invoking: 'Counting the days...', invoked: 'Countdown calculated!' },
    inputSchema: {
      type: 'object',
      properties: {
        eventDate: { type: 'string', description: 'Target date in YYYY-MM-DD format. Example: "2026-12-25" for Christmas 2026' },
        eventName: { type: 'string', description: 'Name of the event for display. Example: "Christmas", "My Birthday", "Project Deadline"' },
      },
      required: ['eventDate'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        eventName: { type: 'string', description: 'Name of the event' },
        eventDate: { type: 'string', description: 'Target date in YYYY-MM-DD format' },
        days: { type: 'number', description: 'Days until/since event (negative if past)' },
        absoluteDays: { type: 'number', description: 'Absolute number of days (always positive)' },
        weeks: { type: 'number', description: 'Number of complete weeks' },
        months: { type: 'number', description: 'Approximate number of months' },
        isPast: { type: 'boolean', description: 'Whether the event is in the past' },
        isToday: { type: 'boolean', description: 'Whether the event is today' },
        direction: { type: 'string', description: '"until", "since", or "today"' },
        summary: { type: 'string', description: 'Human-readable summary text' },
      },
    },
  },

  {
    name: 'when_date_info',
    description: 'Get comprehensive information about a date including day of week, zodiac sign, time calculations from today (days, hours, minutes, weeks), and calendar info (day of year, week number, quarter, leap year).',
    category: TOOL_CATEGORIES.DATE_TIME,
    hasWidget: true,
    invocationMessages: { invoking: 'Analyzing date...', invoked: 'Date info ready' },
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (required)' },
      },
      required: ['date'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        // Core date info
        date: { type: 'string', description: 'Input date in YYYY-MM-DD format' },
        dayOfWeek: { type: 'string', description: 'Full day name (e.g., Monday)' },
        dayOfWeekShort: { type: 'string', description: 'Short day name (e.g., Mon)' },
        formattedDate: { type: 'string', description: 'Human-readable date (e.g., January 15th, 2026)' },
        message: { type: 'string', description: 'Contextual message about the date' },
        // Days calculation
        daysFromToday: { type: 'number', description: 'Days from today (negative = past, positive = future)' },
        isPast: { type: 'boolean' },
        isFuture: { type: 'boolean' },
        isToday: { type: 'boolean' },
        // Time breakdowns
        totalHours: { type: 'number', description: 'Total hours from today' },
        totalMinutes: { type: 'number', description: 'Total minutes from today' },
        weeks: { type: 'number', description: 'Weeks from today (rounded to 1 decimal)' },
        // Calendar info
        dayOfYear: { type: 'number', description: 'Day of year (1-366)' },
        weekOfYear: { type: 'number', description: 'Week of year (1-53)' },
        quarter: { type: 'number', description: 'Quarter of year (1-4)' },
        isLeapYear: { type: 'boolean' },
        zodiacSign: { type: 'string', description: 'Zodiac sign for the date' },
      },
    },
  },
  // ============ FUN & GAMES ============
  {
    name: 'random_number',
    description: 'Generate a random integer between min and max (inclusive)',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Generating random number...', invoked: 'Number generated' },
    inputSchema: {
      type: 'object',
      properties: {
        min: { type: 'number', description: 'Minimum value (inclusive)' },
        max: { type: 'number', description: 'Maximum value (inclusive)' },
      },
      required: ['min', 'max'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'number' },
        min: { type: 'number' },
        max: { type: 'number' },
      },
    },
  },
  {
    name: 'flip_tool',
    description: 'Flip coins or roll dice. Use flipMode to select: "coin" for coin flips (heads/tails), "dice" for dice rolls.',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Flipping...', invoked: 'Result ready' },
    inputSchema: {
      type: 'object',
      properties: {
        flipMode: { type: 'string', enum: ['coin', 'dice'], description: 'Mode: "coin" for coin flip, "dice" for dice roll (default: coin)' },
        count: { type: 'number', description: 'Number of coins to flip or dice to roll (default: 1, max: 6 for dice, 100 for coins)' },
        sides: { type: 'number', description: 'Number of sides on dice (default: 6, only used in dice mode)' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        flipMode: { type: 'string', description: 'Mode used: coin or dice' },
        // Coin mode outputs
        result: { type: 'string', description: 'Single coin result (heads/tails)' },
        results: { type: 'array', items: { type: 'string' }, description: 'All coin flip results' },
        headsCount: { type: 'number', description: 'Number of heads (coin mode)' },
        tailsCount: { type: 'number', description: 'Number of tails (coin mode)' },
        // Dice mode outputs
        rolls: { type: 'array', items: { type: 'number' }, description: 'All dice roll results' },
        total: { type: 'number', description: 'Sum of all dice rolls' },
        sides: { type: 'number', description: 'Number of sides on dice' },
        count: { type: 'number', description: 'Number of coins/dice used' },
      },
    },
  },
  {
    name: 'spin_wheel',
    description: 'Spin a wheel to randomly select from custom options. Great for making decisions, picking winners, or choosing randomly between choices. Requires at least 2 options.',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Spinning the wheel...', invoked: 'The wheel has stopped!' },
    inputSchema: {
      type: 'object',
      properties: {
        options: { type: 'array', items: { type: 'string' }, description: 'List of options to spin between (minimum 2 required). Examples: ["Pizza", "Burger", "Sushi"] or ["Yes", "No", "Maybe"]' },
      },
      required: ['options'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string', description: 'The winning option selected by the wheel' },
        index: { type: 'number', description: 'Index of the winning option (0-based)' },
        totalOptions: { type: 'number', description: 'Total number of options in the wheel' },
        options: { type: 'array', items: { type: 'string' }, description: 'All options that were in the wheel' },
        finalRotation: { type: 'number', description: 'Final rotation angle in degrees (for animation)' },
        segmentAngle: { type: 'number', description: 'Angle of each segment in degrees' },
      },
    },
  },
  {
    name: 'make_decision',
    description: 'Help make a decision. Supports three modes: "yesNo" for yes/no questions (no options needed), "pickOne" for random selection from options, and "weighted" for weighted random selection. Great for making choices, answering questions, or picking randomly.',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Consulting the oracle...', invoked: 'The oracle has spoken!' },
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['yesNo', 'pickOne', 'weighted'], description: 'Decision mode: "yesNo" for yes/no questions, "pickOne" for random selection, "weighted" for weighted selection' },
        options: { type: 'array', items: { type: 'string' }, description: 'Options to choose from (required for pickOne and weighted modes). Example: ["Pizza", "Burger", "Sushi"]' },
        weights: { type: 'array', items: { type: 'number' }, description: 'Optional weights for each option (only used in weighted mode). Higher weight = higher chance. Example: [3, 2, 1]' },
      },
      required: ['mode'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        decision: { type: 'string', description: 'The decision result' },
        mode: { type: 'string', description: 'The mode used for the decision' },
        index: { type: 'number', description: 'Index of selected option (for pickOne/weighted modes)' },
        totalOptions: { type: 'number', description: 'Total number of options considered' },
        options: { type: 'array', items: { type: 'string' }, description: 'All options that were considered' },
        confidence: { type: 'number', description: 'Confidence level (0-100)' },
        icon: { type: 'string', description: 'Emoji icon for the result' },
      },
    },
  },
  {
    name: 'generate_password',
    description: 'Generate a secure random password',
    category: TOOL_CATEGORIES.UTILITIES,
    hasWidget: true,
    invocationMessages: { invoking: 'Generating password...', invoked: 'Password generated' },
    inputSchema: {
      type: 'object',
      properties: {
        length: { type: 'number', description: 'Password length (8-128)' },
        includeUppercase: { type: 'boolean', description: 'Include uppercase letters' },
        includeLowercase: { type: 'boolean', description: 'Include lowercase letters' },
        includeNumbers: { type: 'boolean', description: 'Include numbers' },
        includeSymbols: { type: 'boolean', description: 'Include symbols' },
      },
      required: ['length'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        password: { type: 'string' },
        length: { type: 'number' },
        strength: { type: 'string' },
      },
    },
  },
  {
    name: 'calculate_percentage',
    description: 'Calculate percentages with 5 operations: whatIsXPercentOfY (X% of Y), xIsWhatPercentOfY (X is what % of Y), increaseByPercent (Y + X%), decreaseByPercent (Y - X%), percentChange (change from X to Y as %).',
    category: TOOL_CATEGORIES.UTILITIES,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating percentage...', invoked: 'Percentage calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: [...PERCENT_OPERATIONS],
          description: 'Operation: whatIsXPercentOfY (X% of Y), xIsWhatPercentOfY (X is what % of Y), increaseByPercent (Y increased by X%), decreaseByPercent (Y decreased by X%), percentChange (% change from X to Y)',
        },
        value1: { type: 'number', description: 'First value: percentage for whatIs/increase/decrease, or base value for percentOf/percentChange' },
        value2: { type: 'number', description: 'Second value: base value for whatIs/increase/decrease, or total for percentOf, or new value for percentChange' },
      },
      required: ['operation', 'value1', 'value2'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'number', description: 'The calculated result' },
        operation: { type: 'string', description: 'The operation performed' },
        value1: { type: 'number', description: 'First input value' },
        value2: { type: 'number', description: 'Second input value' },
        explanation: { type: 'string', description: 'Human-readable explanation of the calculation' },
        resultIsPercent: { type: 'boolean', description: 'Whether the result is a percentage' },
      },
    },
  },
  {
    name: 'convert_units',
    description: 'Convert between different units of measurement. Supports weight (kg, lbs, oz, g), length (cm, in, m, ft, km, mi, mm), and temperature (c, f, k).',
    category: TOOL_CATEGORIES.UTILITIES,
    hasWidget: true,
    invocationMessages: { invoking: 'Converting units...', invoked: 'Conversion complete' },
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'Value to convert' },
        from: { type: 'string', enum: [...ALL_UNITS], description: 'Source unit (kg, lbs, oz, g, cm, in, m, ft, km, mi, mm, c, f, k)' },
        to: { type: 'string', enum: [...ALL_UNITS], description: 'Target unit (kg, lbs, oz, g, cm, in, m, ft, km, mi, mm, c, f, k)' },
        category: { type: 'string', enum: ['weight', 'length', 'temperature'], description: 'Optional: category hint for the conversion' },
      },
      required: ['value', 'from', 'to'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'number', description: 'Converted value' },
        value: { type: 'number', description: 'Original value' },
        from: { type: 'string', description: 'Source unit' },
        to: { type: 'string', description: 'Target unit' },
      },
    },
  },
  {
    name: 'calculate_uniqueness',
    description: 'Calculate how unique/rare a person is based on physical characteristics',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating uniqueness...', invoked: 'Uniqueness calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        age: { type: 'number', description: 'Age in years' },
        ageMonths: { type: 'number', description: 'Age in months for babies (0-24)' },
        gender: { type: 'string', enum: ['male', 'female'] },
        heightCm: { type: 'number', description: 'Height in centimeters' },
        weightKg: { type: 'number', description: 'Weight in kilograms' },
        eyeColor: { type: 'string', enum: ['brown', 'blue', 'hazel', 'green', 'gray', 'amber'] },
        hairColor: { type: 'string', enum: ['black', 'brown', 'blonde', 'red', 'gray', 'auburn'] },
        bloodType: { type: 'string', enum: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] },
        handedness: { type: 'string', enum: ['right', 'left', 'ambidextrous'] },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        worldPopulation: { type: 'number' },
        matchingPeople: { type: 'number' },
        rarity: { type: 'string' },
        isBabyMode: { type: 'boolean' },
      },
    },
  },
  {
    name: 'calculate_risk',
    description: 'Calculate risk score for various activities or decisions',
    category: TOOL_CATEGORIES.UTILITIES,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating risk...', invoked: 'Risk calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        activity: { type: 'string', description: 'Activity or decision to assess' },
        factors: { type: 'array', items: { type: 'object' }, description: 'Risk factors with severity and likelihood' },
      },
      required: ['activity'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        riskScore: { type: 'number' },
        riskLevel: { type: 'string' },
        factors: { type: 'array', items: { type: 'object' } },
        recommendations: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'analyze_vibe',
    description: 'Analyze the vibe/mood of text or situation',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Checking vibe...', invoked: 'Vibe checked' },
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to analyze' },
        context: { type: 'string', description: 'Additional context (optional)' },
      },
      required: ['text'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        vibe: { type: 'string' },
        score: { type: 'number' },
        emoji: { type: 'string' },
        description: { type: 'string' },
      },
    },
  },
  // ============ ASTRONOMY ============
  {
    name: 'find_next_eclipse',
    description: 'Find the next upcoming solar or lunar eclipse with visibility info',
    category: TOOL_CATEGORIES.ASTRONOMY,
    hasWidget: true,
    invocationMessages: { invoking: 'Finding next eclipse...', invoked: 'Eclipse found' },
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['solar', 'lunar', 'any'], description: 'Type of eclipse to find' },
        latitude: { type: 'number', description: 'Latitude for visibility check (-90 to 90)' },
        longitude: { type: 'number', description: 'Longitude for visibility check (-180 to 180)' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        type: { type: 'string' },
        subtype: { type: 'string' },
        peakTimeUTC: { type: 'string' },
        duration: { type: 'string' },
        magnitude: { type: 'number' },
        bestVisibleFrom: { type: 'string' },
        visibleRegions: { type: 'array', items: { type: 'string' } },
        daysUntil: { type: 'number' },
        visibleFromLocation: { type: 'boolean' },
      },
    },
  },
  {
    name: 'list_upcoming_eclipses',
    description: 'List upcoming solar and lunar eclipses with dates and visibility',
    category: TOOL_CATEGORIES.ASTRONOMY,
    hasWidget: true,
    invocationMessages: { invoking: 'Listing upcoming eclipses...', invoked: 'Eclipses listed' },
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of eclipses to return (1-10)' },
        type: { type: 'string', enum: ['solar', 'lunar', 'any'], description: 'Filter by eclipse type' },
        latitude: { type: 'number', description: 'Latitude for visibility check' },
        longitude: { type: 'number', description: 'Longitude for visibility check' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        eclipses: { type: 'array', items: { type: 'object' } },
        totalCount: { type: 'number' },
      },
    },
  },
  // ============ ADDITIONAL TOOLS ============
  {
    name: 'calculate_iq_score',
    description: 'Calculate and interpret IQ score with percentile ranking',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating IQ...', invoked: 'IQ estimated' },
    inputSchema: {
      type: 'object',
      properties: {
        score: { type: 'number', description: 'IQ score to analyze' },
      },
      required: ['score'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        score: { type: 'number' },
        percentile: { type: 'number' },
        classification: { type: 'string' },
        description: { type: 'string' },
      },
    },
  },
  {
    name: 'days_between_dates',
    description: 'Calculate the number of days between two dates',
    category: TOOL_CATEGORIES.DATE_TIME,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating days...', invoked: 'Days calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        endDate: { type: 'string', description: 'End date in YYYY-MM-DD format' },
      },
      required: ['startDate', 'endDate'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number' },
        weeks: { type: 'number' },
        months: { type: 'number' },
        years: { type: 'number' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
      },
    },
  },
  {
    name: 'generate_names',
    description: 'Generate random names for characters, projects, or businesses',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Generating names...', invoked: 'Names generated' },
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['person', 'business', 'project', 'fantasy'], description: 'Type of name to generate' },
        count: { type: 'number', description: 'Number of names to generate (1-10)' },
        gender: { type: 'string', enum: ['male', 'female', 'neutral'], description: 'Gender for person names' },
      },
      required: ['type'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' } },
        type: { type: 'string' },
      },
    },
  },
  {
    name: 'lucky_number',
    description: 'Generate random lucky number(s) within a range. Default range is 1 to 2,147,483,647. Can generate multiple numbers at once (up to 10).',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Finding lucky number...', invoked: 'Lucky number found' },
    inputSchema: {
      type: 'object',
      properties: {
        min: { type: 'number', description: 'Minimum value (default: 1)' },
        max: { type: 'number', description: 'Maximum value (default: 2147483647)' },
        count: { type: 'number', description: 'Number of lucky numbers to generate (1-10, default: 1)' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        luckyNumber: { type: 'number', description: 'The primary lucky number' },
        numbers: { type: 'array', items: { type: 'number' }, description: 'All generated lucky numbers' },
        min: { type: 'number', description: 'Minimum value used' },
        max: { type: 'number', description: 'Maximum value used' },
        count: { type: 'number', description: 'Number of numbers generated' },
        range: { type: 'string', description: 'Human-readable range description' },
      },
    },
  },
  {
    name: 'pick_random',
    description: 'Pick random items from a list',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Picking random item...', invoked: 'Item selected' },
    inputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' }, description: 'List of items to pick from' },
        count: { type: 'number', description: 'Number of items to pick (default: 1)' },
        allowDuplicates: { type: 'boolean', description: 'Allow picking same item multiple times' },
      },
      required: ['items'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        picked: { type: 'array', items: { type: 'string' } },
        totalItems: { type: 'number' },
      },
    },
  },
  {
    name: 'zodiac_compatibility',
    description: 'Check zodiac compatibility between two people. Provide either sign names or birth dates for each person.',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Checking compatibility...', invoked: 'Compatibility calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        sign1: { type: 'string', description: 'First zodiac sign name', enum: ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'] },
        sign2: { type: 'string', description: 'Second zodiac sign name', enum: ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'] },
        date1: { type: 'string', description: 'First person birth date (YYYY-MM-DD) - alternative to sign1' },
        date2: { type: 'string', description: 'Second person birth date (YYYY-MM-DD) - alternative to sign2' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        compatibility: { type: 'number' },
        level: { type: 'string' },
        person1: { type: 'object' },
        person2: { type: 'object' },
      },
    },
  },
];

// Helper to get total tool count
export const TOTAL_TOOL_COUNT = TOOL_DEFINITIONS.length;

// Helper to get tools by category
export const getToolsByCategory = (category: ToolCategory): ToolDefinition[] => {
  return TOOL_DEFINITIONS.filter(t => t.category === category);
};

// Helper to get all unique categories
export const getAllCategories = (): ToolCategory[] => {
  return [...new Set(TOOL_DEFINITIONS.map(t => t.category))];
};

// Helper to get a tool by name
export const getToolByName = (name: string): ToolDefinition | undefined => {
  return TOOL_DEFINITIONS.find(t => t.name === name);
};

// Default invocation messages
const DEFAULT_INVOCATION_MESSAGES: InvocationMessages = {
  invoking: 'Processing...',
  invoked: 'Complete',
};

// Pre-computed lookup map for O(1) access (built once at module load)
const INVOCATION_MESSAGES_MAP = new Map<string, InvocationMessages>(
  TOOL_DEFINITIONS.map(t => [t.name, t.invocationMessages || DEFAULT_INVOCATION_MESSAGES])
);

// Helper to get invocation messages for a tool - O(1) lookup
export const getInvocationMessages = (toolName: string): InvocationMessages => {
  return INVOCATION_MESSAGES_MAP.get(toolName) || DEFAULT_INVOCATION_MESSAGES;
};


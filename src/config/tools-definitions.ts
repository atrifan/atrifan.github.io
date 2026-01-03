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
  items?: { type: string; properties?: Record<string, SchemaProperty> };
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
    description: 'Calculate menstrual cycle predictions including next period, fertile window, and ovulation date',
    category: TOOL_CATEGORIES.HEALTH,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating cycle...', invoked: 'Cycle predictions ready' },
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        isFirstDay: { type: 'boolean', description: 'If true, date is first day of period' },
        simplified: { type: 'boolean', description: 'Use simplified mode with average cycle' },
        cycleLength: { type: 'number', description: 'Average cycle length in days (default: 28)' },
        periodLength: { type: 'number', description: 'Average period length in days (default: 5)' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        nextPeriod: { type: 'string' },
        ovulationDate: { type: 'string' },
        fertileStart: { type: 'string' },
        fertileEnd: { type: 'string' },
        currentDay: { type: 'number' },
        phase: { type: 'string' },
        daysUntilNextPeriod: { type: 'number' },
      },
    },
  },
  {
    name: 'blood_donation_eligibility',
    description: 'Calculate blood donation eligibility based on weight, height, age, and sex',
    category: TOOL_CATEGORIES.HEALTH,
    hasWidget: true,
    invocationMessages: { invoking: 'Checking donation eligibility...', invoked: 'Eligibility checked' },
    inputSchema: {
      type: 'object',
      properties: {
        weight: { type: 'number', description: 'Weight in kilograms' },
        height: { type: 'number', description: 'Height in centimeters' },
        age: { type: 'number', description: 'Age in years' },
        sex: { type: 'string', enum: ['male', 'female'] },
      },
      required: ['weight', 'height', 'age', 'sex'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        eligible: { type: 'boolean' },
        bloodVolume: { type: 'number' },
        maxSafeAmount: { type: 'number' },
        amount: { type: 'number' },
        warnings: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'blood_type_compatibility',
    description: 'Check blood type compatibility for transfusions',
    category: TOOL_CATEGORIES.HEALTH,
    hasWidget: true,
    invocationMessages: { invoking: 'Checking blood compatibility...', invoked: 'Compatibility ready' },
    inputSchema: {
      type: 'object',
      properties: {
        bloodType: { type: 'string', enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
      },
      required: ['bloodType'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        bloodType: { type: 'string' },
        canDonateTo: { type: 'array', items: { type: 'string' } },
        canReceiveFrom: { type: 'array', items: { type: 'string' } },
        isUniversalDonor: { type: 'boolean' },
        isUniversalRecipient: { type: 'boolean' },
      },
    },
  },
  {
    name: 'baby_blood_type',
    description: 'Predict possible blood types for a baby based on parents blood types',
    category: TOOL_CATEGORIES.HEALTH,
    hasWidget: true,
    invocationMessages: { invoking: 'Predicting baby blood type...', invoked: 'Prediction ready' },
    inputSchema: {
      type: 'object',
      properties: {
        fatherBloodType: { type: 'string', enum: ['A', 'B', 'AB', 'O'] },
        fatherRh: { type: 'string', enum: ['+', '-'] },
        motherBloodType: { type: 'string', enum: ['A', 'B', 'AB', 'O'] },
        motherRh: { type: 'string', enum: ['+', '-'] },
      },
      required: ['fatherBloodType', 'fatherRh', 'motherBloodType', 'motherRh'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        possibleTypes: { type: 'array', items: { type: 'object' } },
        rhIncompatibilityRisk: { type: 'boolean' },
        rhWarning: { type: 'string' },
      },
    },
  },
  // ============ FINANCE ============
  {
    name: 'calculate_tip',
    description: 'Calculate tip amount and total bill',
    category: TOOL_CATEGORIES.FINANCE,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating tip...', invoked: 'Tip calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        billAmount: { type: 'number', description: 'Bill amount before tip' },
        tipPercentage: { type: 'number', description: 'Tip percentage (e.g., 15, 18, 20)' },
        splitBetween: { type: 'number', description: 'Number of people to split between (default: 1)' },
      },
      required: ['billAmount', 'tipPercentage'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        tipAmount: { type: 'number' },
        totalAmount: { type: 'number' },
        perPerson: { type: 'number' },
        billAmount: { type: 'number' },
        tipPercentage: { type: 'number' },
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
    description: 'Calculate a budget and savings plan',
    category: TOOL_CATEGORIES.FINANCE,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating savings plan...', invoked: 'Savings plan ready' },
    inputSchema: {
      type: 'object',
      properties: {
        monthlyIncome: { type: 'number', description: 'Monthly gross income' },
        monthlyTaxes: { type: 'number', description: 'Monthly taxes' },
        monthlyFixedExpenses: { type: 'number', description: 'Fixed monthly expenses' },
        currentSavings: { type: 'number', description: 'Current savings amount' },
        savingsGoal: { type: 'number', description: 'Target savings amount' },
        intensity: { type: 'string', enum: ['light', 'medium', 'aggressive'] },
        currency: { type: 'string', enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'] },
      },
      required: ['monthlyIncome', 'monthlyTaxes', 'monthlyFixedExpenses', 'currentSavings', 'savingsGoal', 'intensity', 'currency'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        monthlySavings: { type: 'number' },
        monthsToGoal: { type: 'number' },
        totalSaved: { type: 'number' },
        disposableIncome: { type: 'number' },
        savingsRate: { type: 'number' },
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
    name: 'convert_timezone',
    description: 'Convert time between timezones',
    category: TOOL_CATEGORIES.DATE_TIME,
    hasWidget: true,
    invocationMessages: { invoking: 'Converting timezone...', invoked: 'Timezone converted' },
    inputSchema: {
      type: 'object',
      properties: {
        time: { type: 'string', description: 'Time in HH:MM format (24-hour)' },
        fromTimezone: { type: 'string', description: 'Source timezone' },
        toTimezones: { type: 'array', items: { type: 'string' }, description: 'Target timezones' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (optional)' },
      },
      required: ['time', 'fromTimezone', 'toTimezones'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        originalTime: { type: 'string' },
        fromTimezone: { type: 'string' },
        conversions: { type: 'array', items: { type: 'object' } },
      },
    },
  },
  {
    name: 'calculate_countdown',
    description: 'Calculate days, weeks, months until or since a date',
    category: TOOL_CATEGORIES.DATE_TIME,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating countdown...', invoked: 'Countdown ready' },
    inputSchema: {
      type: 'object',
      properties: {
        eventDate: { type: 'string', description: 'Event date in YYYY-MM-DD format' },
        eventName: { type: 'string', description: 'Name of the event (optional)' },
      },
      required: ['eventDate'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        eventName: { type: 'string' },
        days: { type: 'number' },
        weeks: { type: 'number' },
        months: { type: 'number' },
        isPast: { type: 'boolean' },
        isToday: { type: 'boolean' },
      },
    },
  },
  {
    name: 'calculate_date_info',
    description: 'Get information about a specific date (day of week, leap year, week number, etc.)',
    category: TOOL_CATEGORIES.DATE_TIME,
    hasWidget: true,
    invocationMessages: { invoking: 'Analyzing date...', invoked: 'Date info ready' },
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
      },
      required: ['date'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        formatted: { type: 'string' },
        dayOfWeek: { type: 'string' },
        dayOfYear: { type: 'number' },
        weekNumber: { type: 'number' },
        quarter: { type: 'number' },
        isLeapYear: { type: 'boolean' },
        daysInMonth: { type: 'number' },
      },
    },
  },
  {
    name: 'when_date_info',
    description: 'Get comprehensive information about a date including zodiac and time calculations from today',
    category: TOOL_CATEGORIES.DATE_TIME,
    hasWidget: true,
    invocationMessages: { invoking: 'Analyzing date...', invoked: 'Date info ready' },
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
      },
      required: ['date'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        dayOfWeek: { type: 'string' },
        dayOfYear: { type: 'number' },
        weekNumber: { type: 'number' },
        quarter: { type: 'number' },
        isLeapYear: { type: 'boolean' },
        zodiacSign: { type: 'string' },
        daysFromToday: { type: 'number' },
        isPast: { type: 'boolean' },
        isFuture: { type: 'boolean' },
        isToday: { type: 'boolean' },
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
    name: 'flip_coin',
    description: 'Flip a coin and get heads or tails',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Flipping coin...', invoked: 'Coin flipped' },
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of flips (default: 1, max: 100)' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string' },
        results: { type: 'array', items: { type: 'string' } },
        headsCount: { type: 'number' },
        tailsCount: { type: 'number' },
      },
    },
  },
  {
    name: 'roll_dice',
    description: 'Roll dice with customizable sides and count',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Rolling dice...', invoked: 'Dice rolled' },
    inputSchema: {
      type: 'object',
      properties: {
        sides: { type: 'number', description: 'Number of sides (default: 6)' },
        count: { type: 'number', description: 'Number of dice (default: 1)' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        rolls: { type: 'array', items: { type: 'number' } },
        total: { type: 'number' },
        sides: { type: 'number' },
        count: { type: 'number' },
      },
    },
  },
  {
    name: 'spin_wheel',
    description: 'Spin a wheel with custom options',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Spinning wheel...', invoked: 'Wheel stopped' },
    inputSchema: {
      type: 'object',
      properties: {
        options: { type: 'array', items: { type: 'string' }, description: 'List of options to choose from' },
      },
      required: ['options'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        index: { type: 'number' },
      },
    },
  },
  {
    name: 'make_decision',
    description: 'Help make a decision between multiple options',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Making decision...', invoked: 'Decision made' },
    inputSchema: {
      type: 'object',
      properties: {
        options: { type: 'array', items: { type: 'string' }, description: 'Options to choose from' },
        weights: { type: 'array', items: { type: 'number' }, description: 'Optional weights for each option' },
      },
      required: ['options'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        decision: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number' },
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
    description: 'Calculate percentages (what is X% of Y, X is what % of Y, etc.)',
    category: TOOL_CATEGORIES.UTILITIES,
    hasWidget: true,
    invocationMessages: { invoking: 'Calculating percentage...', invoked: 'Percentage calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['percentOf', 'whatPercent', 'percentChange'], description: 'Calculation mode' },
        value1: { type: 'number', description: 'First value' },
        value2: { type: 'number', description: 'Second value' },
      },
      required: ['mode', 'value1', 'value2'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'number' },
        mode: { type: 'string' },
        explanation: { type: 'string' },
      },
    },
  },
  {
    name: 'convert_units',
    description: 'Convert between different units of measurement',
    category: TOOL_CATEGORIES.UTILITIES,
    hasWidget: true,
    invocationMessages: { invoking: 'Converting units...', invoked: 'Conversion complete' },
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'Value to convert' },
        fromUnit: { type: 'string', description: 'Source unit' },
        toUnit: { type: 'string', description: 'Target unit' },
        category: { type: 'string', enum: ['length', 'weight', 'temperature', 'volume', 'area', 'speed', 'time', 'data'] },
      },
      required: ['value', 'fromUnit', 'toUnit'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'number' },
        fromValue: { type: 'number' },
        fromUnit: { type: 'string' },
        toUnit: { type: 'string' },
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
    name: 'generate_unique_id',
    description: 'Generate unique identifiers (UUID, nanoid, etc.)',
    category: TOOL_CATEGORIES.UTILITIES,
    hasWidget: true,
    invocationMessages: { invoking: 'Generating ID...', invoked: 'ID generated' },
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['uuid', 'nanoid', 'timestamp', 'random'], description: 'Type of ID to generate' },
        count: { type: 'number', description: 'Number of IDs to generate (1-10)' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        type: { type: 'string' },
      },
    },
  },
  {
    name: 'get_zodiac_sign',
    description: 'Get zodiac sign from birth date with personality traits',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Looking up zodiac...', invoked: 'Zodiac found' },
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
        sign: { type: 'string' },
        element: { type: 'string' },
        symbol: { type: 'string' },
        dateRange: { type: 'string' },
        traits: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'lucky_number',
    description: 'Generate lucky numbers based on various methods',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Finding lucky number...', invoked: 'Lucky number found' },
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['random', 'birthdate', 'name'], description: 'Method to generate lucky number' },
        birthDate: { type: 'string', description: 'Birth date for birthdate method' },
        name: { type: 'string', description: 'Name for name method' },
        count: { type: 'number', description: 'Number of lucky numbers (1-10)' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        numbers: { type: 'array', items: { type: 'number' } },
        method: { type: 'string' },
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
    description: 'Check zodiac compatibility between two signs',
    category: TOOL_CATEGORIES.FUN,
    hasWidget: true,
    invocationMessages: { invoking: 'Checking compatibility...', invoked: 'Compatibility calculated' },
    inputSchema: {
      type: 'object',
      properties: {
        sign1: { type: 'string', description: 'First zodiac sign' },
        sign2: { type: 'string', description: 'Second zodiac sign' },
      },
      required: ['sign1', 'sign2'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        compatibility: { type: 'number' },
        level: { type: 'string' },
        description: { type: 'string' },
        sign1: { type: 'string' },
        sign2: { type: 'string' },
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

// Helper to get invocation messages for a tool
export const getInvocationMessages = (toolName: string): InvocationMessages => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === toolName);
  return tool?.invocationMessages || DEFAULT_INVOCATION_MESSAGES;
};


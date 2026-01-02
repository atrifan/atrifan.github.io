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

// Standard annotations for read-only tools (all our calculators are read-only)
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// OpenAI widget metadata for tool definitions
const OPENAI_WIDGET_META = {
  'openai/toolInvocation/invoking': 'Calculating...',
  'openai/toolInvocation/invoked': 'Calculation complete',
  'openai/widgetAccessible': true,
  'openai/resultCanProduceWidget': true,
  'openai/widgetPrefersBorder': true,
};

// Tool-specific invoking/invoked messages
const TOOL_INVOCATION_MESSAGES: Record<string, { invoking: string; invoked: string }> = {
  calculate_bmi: { invoking: 'Calculating BMI...', invoked: 'BMI calculated' },
  calculate_ideal_weight: { invoking: 'Calculating ideal weight...', invoked: 'Ideal weight calculated' },
  calculate_bmr: { invoking: 'Calculating metabolic rate...', invoked: 'BMR calculated' },
  generate_weight_loss_plan: { invoking: 'Generating weight loss plan...', invoked: 'Plan generated' },
  calculate_savings_plan: { invoking: 'Calculating savings plan...', invoked: 'Savings plan ready' },
  calculate_date_info: { invoking: 'Analyzing date...', invoked: 'Date info ready' },
  days_between_dates: { invoking: 'Calculating days...', invoked: 'Days calculated' },
  random_number: { invoking: 'Generating random number...', invoked: 'Number generated' },
  coin_flip: { invoking: 'Flipping coin...', invoked: 'Coin flipped' },
  pick_random: { invoking: 'Picking random item...', invoked: 'Item selected' },
  calculate_tip: { invoking: 'Calculating tip...', invoked: 'Tip calculated' },
  calculate_percentage: { invoking: 'Calculating percentage...', invoked: 'Percentage calculated' },
  calculate_age: { invoking: 'Calculating age...', invoked: 'Age calculated' },
  convert_units: { invoking: 'Converting units...', invoked: 'Conversion complete' },
  calculate_cycle: { invoking: 'Calculating cycle...', invoked: 'Cycle predictions ready' },
  calculate_countdown: { invoking: 'Calculating countdown...', invoked: 'Countdown ready' },
  make_decision: { invoking: 'Making decision...', invoked: 'Decision made' },
  zodiac_compatibility: { invoking: 'Checking compatibility...', invoked: 'Compatibility calculated' },
  get_zodiac_sign: { invoking: 'Looking up zodiac...', invoked: 'Zodiac found' },
  generate_names: { invoking: 'Generating names...', invoked: 'Names generated' },
  calculate_position_size: { invoking: 'Calculating position size...', invoked: 'Position size ready' },
  calculate_sleep_times: { invoking: 'Calculating sleep times...', invoked: 'Sleep times ready' },
  spin_wheel: { invoking: 'Spinning wheel...', invoked: 'Wheel stopped' },
  convert_timezone: { invoking: 'Converting timezone...', invoked: 'Timezone converted' },
  generate_unique_id: { invoking: 'Generating ID...', invoked: 'ID generated' },
  lucky_number: { invoking: 'Finding lucky number...', invoked: 'Lucky number found' },
  roll_dice: { invoking: 'Rolling dice...', invoked: 'Dice rolled' },
  vibe_check: { invoking: 'Checking vibe...', invoked: 'Vibe checked' },
  calculate_iq_score: { invoking: 'Calculating IQ...', invoked: 'IQ estimated' },
  calculate_uniqueness: { invoking: 'Calculating uniqueness...', invoked: 'Uniqueness calculated' },
  when_date_info: { invoking: 'Analyzing date...', invoked: 'Date info ready' },
};

// Helper to generate _meta for a tool
function generateToolMeta(toolName: string) {
  const messages = TOOL_INVOCATION_MESSAGES[toolName] || { invoking: 'Processing...', invoked: 'Complete' };
  return {
    'openai/outputTemplate': `ui://widget/${toolName}.html`,
    'openai/mimeType': 'text/html+skybridge',
    'openai/toolInvocation/invoking': messages.invoking,
    'openai/toolInvocation/invoked': messages.invoked,
    'openai/widgetAccessible': true,
    'openai/resultCanProduceWidget': true,
    'openai/widgetPrefersBorder': true,
  };
}

// Tool definitions for MCP with inputSchema, outputSchema, annotations, and _meta
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
    outputSchema: {
      type: 'object',
      properties: {
        bmi: { type: 'number', description: 'Calculated BMI value' },
        category: { type: 'string', enum: ['Underweight', 'Normal', 'Overweight', 'Obese'], description: 'BMI category' },
        weight: { type: 'number', description: 'Input weight in kg' },
        height: { type: 'number', description: 'Input height in cm' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_bmi'),
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
    outputSchema: {
      type: 'object',
      properties: {
        idealWeight: { type: 'number', description: 'Ideal weight in kg' },
        formula: { type: 'string', description: 'Formula used (Devine)' },
        height: { type: 'number' },
        gender: { type: 'string' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_ideal_weight'),
  },
  {
    name: 'calculate_bmr',
    description: 'Calculate Basal Metabolic Rate using Mifflin-St Jeor equation and TDEE',
    inputSchema: {
      type: 'object',
      properties: {
        weight: { type: 'number', description: 'Weight in kilograms' },
        height: { type: 'number', description: 'Height in centimeters' },
        age: { type: 'number', description: 'Age in years' },
        sex: { type: 'string', enum: ['male', 'female', 'other'], description: 'Biological sex' },
        activityLevel: { type: 'string', enum: ['sedentary', 'light', 'moderate', 'active', 'veryActive'], description: 'Activity level (default: sedentary)' },
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
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_bmr'),
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
        timeToWeight: { type: 'number', description: 'Weeks to reach goal (optional, auto-calculated if not provided)' },
        activityLevel: { type: 'string', enum: ['sedentary', 'light', 'moderate', 'active', 'veryActive'], description: 'Activity level' },
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
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('generate_weight_loss_plan'),
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
        currency: { type: 'string', enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'], description: 'Currency code' },
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
        savingsRate: { type: 'number', description: 'Percentage of income saved' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_savings_plan'),
  },
  {
    name: 'calculate_date_info',
    description: 'Get information about a specific date (day of week, leap year, week number, etc.)',
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
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_date_info'),
  },
  {
    name: 'days_between_dates',
    description: 'Calculate the number of days, weeks, and months between two dates',
    inputSchema: {
      type: 'object',
      properties: {
        date1: { type: 'string', description: 'First date in YYYY-MM-DD format' },
        date2: { type: 'string', description: 'Second date in YYYY-MM-DD format' },
      },
      required: ['date1', 'date2'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number' },
        weeks: { type: 'number' },
        months: { type: 'number' },
        years: { type: 'number' },
        businessDays: { type: 'number' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('days_between_dates'),
  },
  {
    name: 'random_number',
    description: 'Generate a random integer between min and max (inclusive)',
    inputSchema: {
      type: 'object',
      properties: {
        min: { type: 'integer', description: 'Minimum value (inclusive)' },
        max: { type: 'integer', description: 'Maximum value (inclusive)' },
      },
      required: ['min', 'max'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'integer' },
        min: { type: 'integer' },
        max: { type: 'integer' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('random_number'),
  },
  {
    name: 'coin_flip',
    description: 'Flip a coin and get heads or tails',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string', enum: ['heads', 'tails'] },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('coin_flip'),
  },
  {
    name: 'pick_random',
    description: 'Pick a random item from a list of options',
    inputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' }, description: 'List of items to choose from', minItems: 2 },
      },
      required: ['items'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        selected: { type: 'string', description: 'The randomly selected item' },
        totalItems: { type: 'number' },
        index: { type: 'number', description: 'Index of selected item (0-based)' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('pick_random'),
  },
  {
    name: 'calculate_tip',
    description: 'Calculate tip amount, total bill, and per-person split. Can also suggest tip based on service quality.',
    inputSchema: {
      type: 'object',
      properties: {
        billAmount: { type: 'number', description: 'Bill amount before tip' },
        tipPercent: { type: 'number', description: 'Tip percentage (e.g., 15, 18, 20). If not provided, use suggestTip mode.' },
        splitWays: { type: 'integer', description: 'Number of people to split the bill (default: 1)', minimum: 1, maximum: 20 },
        serviceQuality: { type: 'integer', description: 'Service quality 1-5 for tip suggestion (1=terrible, 5=amazing)', minimum: 1, maximum: 5 },
        mood: { type: 'integer', description: 'Your mood 1-5 for tip suggestion (1=awful, 5=great)', minimum: 1, maximum: 5 },
        budget: { type: 'integer', description: 'Budget situation 1-5 for tip suggestion (1=very tight, 5=generous)', minimum: 1, maximum: 5 },
      },
      required: ['billAmount'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        billAmount: { type: 'number' },
        tipPercent: { type: 'number' },
        tipAmount: { type: 'number' },
        total: { type: 'number' },
        splitWays: { type: 'number' },
        perPerson: { type: 'number' },
        suggested: { type: 'boolean', description: 'Whether tip was auto-suggested' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_tip'),
  },
  {
    name: 'calculate_percentage',
    description: 'Calculate percentage of a number, percentage change, or increase/decrease by percentage',
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['of', 'change', 'increase', 'decrease'], description: 'of: X% of Y, change: % change from X to Y, increase/decrease: X increased/decreased by Y%' },
        value: { type: 'number', description: 'The main value' },
        percent: { type: 'number', description: 'The percentage (for of/increase/decrease) or second value (for change)' },
      },
      required: ['operation', 'value', 'percent'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'number' },
        operation: { type: 'string' },
        formula: { type: 'string', description: 'Human-readable formula used' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_percentage'),
  },
  {
    name: 'calculate_age',
    description: 'Calculate exact age from birth date including years, months, days, total days lived, and days until next birthday',
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
        totalDays: { type: 'number', description: 'Total days lived' },
        totalWeeks: { type: 'number' },
        totalMonths: { type: 'number' },
        daysUntilNextBirthday: { type: 'number' },
        nextBirthdayAge: { type: 'number' },
        zodiacSign: { type: 'string' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_age'),
  },
  {
    name: 'convert_units',
    description: 'Convert between units of weight, length, or temperature',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'Value to convert' },
        from: { type: 'string', enum: ['kg', 'lbs', 'oz', 'g', 'cm', 'in', 'm', 'ft', 'km', 'mi', 'C', 'F', 'K'], description: 'Source unit' },
        to: { type: 'string', enum: ['kg', 'lbs', 'oz', 'g', 'cm', 'in', 'm', 'ft', 'km', 'mi', 'C', 'F', 'K'], description: 'Target unit' },
      },
      required: ['value', 'from', 'to'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'number' },
        fromValue: { type: 'number' },
        fromUnit: { type: 'string' },
        toUnit: { type: 'string' },
        formula: { type: 'string' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('convert_units'),
  },
  {
    name: 'calculate_cycle',
    description: 'Calculate menstrual cycle predictions including next period, fertile window, ovulation date, and current phase. Supports simplified mode where only a date is needed (uses average 28-day cycle and 5-day period).',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format. In simplified mode, this is the only required field.' },
        isFirstDay: { type: 'boolean', description: 'If true, date is first day of period (bleeding started). If false, date is last day of period (bleeding ended). Default: true (first day).' },
        simplified: { type: 'boolean', description: 'If true, uses simplified mode with average cycle (28 days) and period (5 days) lengths. Default: false.' },
        lastPeriodDate: { type: 'string', description: 'Last period start date in YYYY-MM-DD format (used in advanced mode, or as alias for date+isFirstDay=true)' },
        cycleLength: { type: 'integer', description: 'Average cycle length in days (default: 28)', minimum: 21, maximum: 35 },
        periodLength: { type: 'integer', description: 'Average period length in days (default: 5)', minimum: 2, maximum: 10 },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        nextPeriod: { type: 'string', description: 'Next period start date' },
        ovulationDate: { type: 'string' },
        fertileStart: { type: 'string' },
        fertileEnd: { type: 'string' },
        currentDay: { type: 'number', description: 'Current day of cycle' },
        phase: { type: 'string', enum: ['menstrual', 'follicular', 'ovulation', 'luteal'] },
        daysUntilNextPeriod: { type: 'number' },
        mode: { type: 'string', enum: ['simplified', 'advanced'], description: 'Which mode was used for calculation' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_cycle'),
  },
  {
    name: 'calculate_countdown',
    description: 'Calculate days, weeks, months until or since a date',
    inputSchema: {
      type: 'object',
      properties: {
        eventDate: { type: 'string', description: 'Event date in YYYY-MM-DD format' },
        eventName: { type: 'string', description: 'Name of the event (optional, default: "Event")' },
      },
      required: ['eventDate'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        eventName: { type: 'string' },
        days: { type: 'number', description: 'Days until/since (negative if past)' },
        weeks: { type: 'number' },
        months: { type: 'number' },
        isPast: { type: 'boolean' },
        isToday: { type: 'boolean' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_countdown'),
  },
  {
    name: 'make_decision',
    description: 'Make a random decision - yes/no or pick from custom options',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['yesNo', 'custom'], description: 'yesNo: random yes/no, custom: pick from provided options' },
        options: { type: 'array', items: { type: 'string' }, description: 'Custom options (required if mode is custom)', minItems: 2 },
        question: { type: 'string', description: 'The question being decided (optional)' },
      },
      required: ['mode'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        decision: { type: 'string' },
        mode: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        question: { type: 'string' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('make_decision'),
  },
  {
    name: 'zodiac_compatibility',
    description: 'Calculate zodiac sign compatibility between two people with detailed analysis',
    inputSchema: {
      type: 'object',
      properties: {
        person1: { type: 'string', description: 'First person: zodiac sign name (e.g., "aries") or birth date (YYYY-MM-DD)' },
        person2: { type: 'string', description: 'Second person: zodiac sign name or birth date' },
      },
      required: ['person1', 'person2'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        person1: { type: 'object', properties: { sign: { type: 'string' }, name: { type: 'string' }, symbol: { type: 'string' }, element: { type: 'string' } } },
        person2: { type: 'object', properties: { sign: { type: 'string' }, name: { type: 'string' }, symbol: { type: 'string' }, element: { type: 'string' } } },
        compatibility: { type: 'number', description: 'Compatibility percentage 0-100' },
        level: { type: 'string', enum: ['Soulmates', 'Excellent', 'Good', 'Moderate', 'Challenging'] },
        description: { type: 'string' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('zodiac_compatibility'),
  },
  {
    name: 'get_zodiac_sign',
    description: 'Get zodiac sign details from a birth date',
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
        name: { type: 'string' },
        symbol: { type: 'string' },
        element: { type: 'string', enum: ['Fire', 'Earth', 'Air', 'Water'] },
        dates: { type: 'string', description: 'Date range for this sign' },
        traits: { type: 'array', items: { type: 'string' } },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('get_zodiac_sign'),
  },
  {
    name: 'generate_names',
    description: 'Generate random names: human first names, full names, fantasy names, or pet names',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['human', 'pet'], description: 'Name category' },
        type: { type: 'string', enum: ['first', 'full', 'fantasy'], description: 'Type of human name (for category=human)' },
        petType: { type: 'string', enum: ['dog', 'cat', 'other'], description: 'Pet type (for category=pet)' },
        gender: { type: 'string', enum: ['male', 'female', 'any'], description: 'Gender preference (default: any)' },
        count: { type: 'integer', description: 'Number of names to generate (default: 5)', minimum: 1, maximum: 20 },
      },
      required: ['category'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' } },
        category: { type: 'string' },
        type: { type: 'string' },
        gender: { type: 'string' },
        count: { type: 'number' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('generate_names'),
  },
  {
    name: 'calculate_position_size',
    description: 'Calculate trading position size based on risk management. Supports multiple calculation modes.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['riskAndSL', 'riskOnly'], description: 'riskAndSL: calculate quantity from risk% and stop loss, riskOnly: suggest multiple SL/quantity combinations' },
        capital: { type: 'number', description: 'Total trading capital' },
        entryPrice: { type: 'number', description: 'Entry price' },
        stopLossPrice: { type: 'number', description: 'Stop loss price (required for riskAndSL mode)' },
        riskPercent: { type: 'number', description: 'Risk percentage of capital (e.g., 1 for 1%)', minimum: 0.1, maximum: 10 },
        direction: { type: 'string', enum: ['long', 'short'], description: 'Trade direction' },
      },
      required: ['capital', 'entryPrice', 'riskPercent', 'direction'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        positionSize: { type: 'number', description: 'Position size in currency' },
        shares: { type: 'number', description: 'Number of shares/units' },
        riskAmount: { type: 'number', description: 'Amount at risk in currency' },
        riskPercent: { type: 'number' },
        stopLoss: { type: 'number' },
        stopLossPercent: { type: 'number' },
        takeProfits: { type: 'array', items: { type: 'object', properties: { ratio: { type: 'string' }, price: { type: 'number' }, profit: { type: 'number' } } } },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_position_size'),
  },
  {
    name: 'calculate_sleep_times',
    description: 'Calculate optimal sleep/wake times based on 90-minute sleep cycles',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['wakeAt', 'sleepAt', 'sleepNow'], description: 'wakeAt: when to sleep to wake at X, sleepAt: when to wake if sleeping at X, sleepNow: when to wake if sleeping now' },
        time: { type: 'string', description: 'Time in HH:MM format (required for wakeAt and sleepAt modes)' },
        ageGroup: { type: 'string', enum: ['adult', 'teen', 'child', 'toddler', 'infant'], description: 'Age group affects recommended sleep duration (default: adult)' },
      },
      required: ['mode'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        times: { type: 'array', items: { type: 'object', properties: { time: { type: 'string' }, cycles: { type: 'number' }, hours: { type: 'number' }, quality: { type: 'string' } } } },
        recommendation: { type: 'string' },
        ageGroup: { type: 'string' },
        fallAsleepMinutes: { type: 'number', description: 'Minutes assumed to fall asleep' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_sleep_times'),
  },
  {
    name: 'spin_wheel',
    description: 'Spin a wheel with custom options and get a random result',
    inputSchema: {
      type: 'object',
      properties: {
        options: { type: 'array', items: { type: 'string' }, description: 'Options on the wheel', minItems: 2 },
      },
      required: ['options'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string' },
        index: { type: 'number' },
        totalOptions: { type: 'number' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('spin_wheel'),
  },
  {
    name: 'convert_timezone',
    description: 'Convert time between timezones',
    inputSchema: {
      type: 'object',
      properties: {
        time: { type: 'string', description: 'Time in HH:MM format (24-hour)' },
        fromTimezone: { type: 'string', description: 'Source timezone (e.g., UTC, UTC+2, UTC-5, America/New_York, Europe/London)' },
        toTimezones: { type: 'array', items: { type: 'string' }, description: 'Target timezones to convert to' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (optional, for DST accuracy)' },
      },
      required: ['time', 'fromTimezone', 'toTimezones'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        originalTime: { type: 'string' },
        fromTimezone: { type: 'string' },
        conversions: { type: 'array', items: { type: 'object', properties: { timezone: { type: 'string' }, time: { type: 'string' }, date: { type: 'string' }, offset: { type: 'string' } } } },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('convert_timezone'),
  },
  {
    name: 'generate_unique_id',
    description: 'Generate unique identifiers (UUID v4, short ID, numeric ID, or alphanumeric)',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['uuid', 'short', 'numeric', 'alphanumeric'], description: 'Type of ID to generate' },
        count: { type: 'integer', description: 'Number of IDs to generate (default: 1)', minimum: 1, maximum: 100 },
        length: { type: 'integer', description: 'Length for short/numeric/alphanumeric IDs (default: 8)', minimum: 4, maximum: 32 },
        prefix: { type: 'string', description: 'Optional prefix to add to each ID' },
      },
      required: ['type'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        type: { type: 'string' },
        count: { type: 'number' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('generate_unique_id'),
  },
  {
    name: 'lucky_number',
    description: 'Generate a lucky random number',
    inputSchema: {
      type: 'object',
      properties: {
        max: { type: 'integer', description: 'Maximum value (default: 2147483647)', minimum: 1 },
        min: { type: 'integer', description: 'Minimum value (default: 1)', minimum: 0 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        luckyNumber: { type: 'integer' },
        max: { type: 'integer' },
        min: { type: 'integer' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('lucky_number'),
  },
  {
    name: 'roll_dice',
    description: 'Roll dice with customizable number of sides and dice count',
    inputSchema: {
      type: 'object',
      properties: {
        sides: { type: 'integer', enum: [4, 6, 8, 10, 12, 20, 100], description: 'Number of sides on each die (default: 6)' },
        count: { type: 'integer', description: 'Number of dice to roll (default: 1)', minimum: 1, maximum: 10 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        rolls: { type: 'array', items: { type: 'integer' }, description: 'Individual roll results' },
        total: { type: 'integer', description: 'Sum of all rolls' },
        sides: { type: 'integer' },
        count: { type: 'integer' },
        average: { type: 'number' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('roll_dice'),
  },
  {
    name: 'vibe_check',
    description: 'Determine if someone is more of a cat person or dog person based on 10 personality questions',
    inputSchema: {
      type: 'object',
      properties: {
        answers: {
          type: 'array',
          items: { type: 'string', enum: ['A', 'B'] },
          description: 'Array of 10 answers. A=cat-leaning, B=dog-leaning. Questions: 1) Saturday: A=cozy home, B=outdoor adventure, 2) Meeting people: A=small groups, B=big parties, 3) Space: A=quiet corner, B=open areas, 4) Stress: A=alone time, B=social support, 5) Exercise: A=gentle yoga, B=team sports, 6) Routines: A=flexible, B=structured, 7) Communication: A=subtle hints, B=direct, 8) Affection: A=on my terms, B=always welcome, 9) Sleep: A=naps anytime, B=regular schedule, 10) Conflict: A=avoid, B=address directly',
          minItems: 10,
          maxItems: 10,
        },
      },
      required: ['answers'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string', enum: ['cat', 'dog'] },
        catScore: { type: 'number' },
        dogScore: { type: 'number' },
        percentage: { type: 'number', description: 'How strongly they lean (50-100%)' },
        emoji: { type: 'string' },
        description: { type: 'string' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('vibe_check'),
  },
  {
    name: 'calculate_iq_score',
    description: 'Calculate estimated IQ score based on correct answers to logic/pattern questions',
    inputSchema: {
      type: 'object',
      properties: {
        correctAnswers: { type: 'integer', description: 'Number of correct answers', minimum: 0, maximum: 15 },
        totalQuestions: { type: 'integer', description: 'Total questions answered (default: 15)', minimum: 5, maximum: 50 },
        timeTakenSeconds: { type: 'integer', description: 'Time taken in seconds (optional, faster = higher score)', minimum: 60 },
      },
      required: ['correctAnswers'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        iqScore: { type: 'integer' },
        category: { type: 'string', enum: ['Genius', 'Gifted', 'Above Average', 'Average', 'Below Average'] },
        percentile: { type: 'number', description: 'Percentile rank in population' },
        rarity: { type: 'string', description: 'How rare this IQ is (e.g., "1 in 100")' },
        accuracy: { type: 'number', description: 'Percentage of correct answers' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_iq_score'),
  },
  {
    name: 'calculate_uniqueness',
    description: 'Calculate how unique/rare a person is based on their physical characteristics compared to world population',
    inputSchema: {
      type: 'object',
      properties: {
        age: { type: 'integer', description: 'Age in years', minimum: 0, maximum: 120 },
        gender: { type: 'string', enum: ['male', 'female'] },
        heightCm: { type: 'number', description: 'Height in centimeters', minimum: 50, maximum: 250 },
        weightKg: { type: 'number', description: 'Weight in kilograms', minimum: 20, maximum: 300 },
        eyeColor: { type: 'string', enum: ['brown', 'blue', 'hazel', 'green', 'gray', 'amber'] },
        hairColor: { type: 'string', enum: ['black', 'brown', 'blonde', 'red', 'gray', 'white'] },
        handedness: { type: 'string', enum: ['right', 'left', 'ambidextrous'] },
        bloodType: { type: 'string', enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
      },
      required: ['age', 'gender'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        uniquenessScore: { type: 'number', description: 'Uniqueness percentage 0-100' },
        category: { type: 'string', enum: ['Extremely Rare', 'Very Rare', 'Rare', 'Uncommon', 'Common'] },
        rarity: { type: 'string', description: 'e.g., "1 in 10,000"' },
        estimatedPeopleWithTraits: { type: 'number' },
        traitBreakdown: { type: 'object', description: 'Rarity of each individual trait' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_uniqueness'),
  },
  {
    name: 'when_date_info',
    description: 'Get comprehensive information about a date including day of week, week number, zodiac, and time calculations from today',
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
        totalHours: { type: 'number' },
        totalMinutes: { type: 'number' },
        weeks: { type: 'number' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('when_date_info'),
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
      let tipPercent = args.tipPercent as number | undefined;
      const splitWays = (args.splitWays as number) || 1;
      let suggested = false;

      // If tipPercent not provided, calculate from serviceQuality, mood, budget
      if (tipPercent === undefined || tipPercent === null) {
        const serviceQuality = (args.serviceQuality as number) || 3;
        const mood = (args.mood as number) || 3;
        const budget = (args.budget as number) || 3;
        // Calculate suggested tip: base 10% + adjustments
        const avgScore = (serviceQuality + mood + budget) / 3;
        tipPercent = Math.round(5 + avgScore * 4); // 9% to 25% range
        suggested = true;
      }

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
        suggested,
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
      const isSimplified = args.simplified === true;
      const cycleLength = isSimplified ? 28 : ((args.cycleLength as number) || 28);
      const periodLength = isSimplified ? 5 : ((args.periodLength as number) || 5);

      // Determine the period start date
      let periodStartDate: string;

      if (args.date) {
        // New simplified/flexible input
        const isFirstDay = args.isFirstDay !== false; // default true
        if (isFirstDay) {
          // Date is first day of bleeding
          periodStartDate = args.date as string;
        } else {
          // Date is last day of bleeding - calculate first day by subtracting period length
          const [y, m, d] = (args.date as string).split('-').map(Number);
          const lastDayDate = new Date(y, m - 1, d);
          const firstDayDate = new Date(lastDayDate.getTime() - (periodLength - 1) * 24 * 60 * 60 * 1000);
          periodStartDate = firstDayDate.toISOString().split('T')[0];
        }
      } else if (args.lastPeriodDate) {
        // Legacy input - lastPeriodDate is always first day
        periodStartDate = args.lastPeriodDate as string;
      } else {
        throw new Error('Either date or lastPeriodDate is required');
      }

      const [y, m, d] = periodStartDate.split('-').map(Number);
      const lastPeriod = new Date(y, m - 1, d);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Calculate next period (find the next one after today)
      let nextPeriod = new Date(lastPeriod.getTime() + cycleLength * 24 * 60 * 60 * 1000);
      while (nextPeriod <= today) {
        nextPeriod = new Date(nextPeriod.getTime() + cycleLength * 24 * 60 * 60 * 1000);
      }

      // Ovulation is ~14 days before next period (luteal phase)
      const ovulationDate = new Date(nextPeriod.getTime() - 14 * 24 * 60 * 60 * 1000);
      // Fertile window: 5 days before ovulation + ovulation day + 1 day after
      const fertileStart = new Date(ovulationDate.getTime() - 5 * 24 * 60 * 60 * 1000);
      const fertileEnd = new Date(ovulationDate.getTime() + 1 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date(nextPeriod.getTime() + periodLength * 24 * 60 * 60 * 1000);

      // Calculate current cycle day and phase
      const daysSinceLastPeriod = Math.floor((today.getTime() - lastPeriod.getTime()) / (1000 * 60 * 60 * 24));
      const currentDay = (daysSinceLastPeriod % cycleLength) + 1;

      let phase: string;
      if (currentDay <= periodLength) {
        phase = 'menstrual';
      } else if (currentDay <= cycleLength - 14 - 1) {
        phase = 'follicular';
      } else if (currentDay <= cycleLength - 14 + 1) {
        phase = 'ovulation';
      } else {
        phase = 'luteal';
      }

      const daysUntilNextPeriod = Math.ceil((nextPeriod.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      return {
        nextPeriodStart: nextPeriod.toISOString().split('T')[0],
        nextPeriodEnd: periodEnd.toISOString().split('T')[0],
        ovulationDate: ovulationDate.toISOString().split('T')[0],
        fertileWindowStart: fertileStart.toISOString().split('T')[0],
        fertileWindowEnd: fertileEnd.toISOString().split('T')[0],
        currentDay,
        phase,
        daysUntilNextPeriod,
        cycleLength,
        periodLength,
        mode: isSimplified ? 'simplified' : 'advanced',
        inputDate: periodStartDate,
        isFirstDayInput: args.date ? (args.isFirstDay !== false) : true,
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

// Map tool names to widget types - all tools get widgets
function getWidgetType(toolName: string): string {
  const widgetMap: Record<string, string> = {
    'calculate_bmi': 'bmi',
    'calculate_ideal_weight': 'ideal_weight',
    'calculate_bmr': 'bmr',
    'generate_weight_loss_plan': 'weight_loss_plan',
    'calculate_savings_plan': 'savings_plan',
    'calculate_date_info': 'date_info',
    'days_between_dates': 'days_between',
    'random_number': 'random_number',
    'coin_flip': 'coin_flip',
    'pick_random': 'pick_random',
    'calculate_tip': 'tip',
    'calculate_percentage': 'percentage',
    'calculate_age': 'age',
    'convert_units': 'convert_units',
    'calculate_cycle': 'cycle',
    'calculate_countdown': 'countdown',
    'make_decision': 'decision',
    'zodiac_compatibility': 'zodiac',
    'get_zodiac_sign': 'zodiac_sign',
    'generate_names': 'names',
    'calculate_position_size': 'position_size',
    'calculate_sleep_times': 'sleep_times',
    'spin_wheel': 'pick_random',
    'convert_timezone': 'timezone',
    'generate_unique_id': 'unique_id',
    'lucky_number': 'lucky_number',
    'roll_dice': 'dice',
    'vibe_check': 'vibe_check',
    'calculate_iq_score': 'iq_score',
    'calculate_uniqueness': 'uniqueness',
    'when_date_info': 'when_date',
  };
  return widgetMap[toolName] || 'generic';
}

// Common CSS styles for widgets
const WIDGET_STYLES = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  min-height: 100vh;
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.card {
  background: rgba(255,255,255,0.1);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 1.5rem;
  max-width: 320px;
  width: 100%;
  border: 1px solid rgba(255,255,255,0.2);
}
.header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-size: 1.1rem;
  color: #fff;
  font-weight: 600;
}
.big-number {
  font-size: 3.5rem;
  font-weight: 700;
  text-align: center;
  margin: 0.5rem 0;
}
.label {
  text-align: center;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  margin-bottom: 1rem;
  font-weight: 600;
}
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.stat-box {
  background: rgba(255,255,255,0.1);
  padding: 0.75rem;
  border-radius: 8px;
  text-align: center;
}
.stat-label { color: rgba(255,255,255,0.7); font-size: 0.75rem; }
.stat-value { color: #fff; font-weight: 600; font-size: 1rem; }
.footer {
  margin-top: 1rem;
  text-align: center;
  color: rgba(255,255,255,0.5);
  font-size: 0.7rem;
}
`;

// Widget rendering mode: 'inline' (default) or 'iframe'
const WIDGET_MODE: 'inline' | 'iframe' = 'inline';

// Base URL for iframe mode
const WIDGET_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://tulzo.com';

// Generate iframe-based widget HTML (uses /embed page with React components)
function generateIframeWidgetHtml(toolName: string, data: Record<string, unknown>): string {
  const encodedData = encodeURIComponent(JSON.stringify(data));
  const embedUrl = `${WIDGET_BASE_URL}/embed?tool=${toolName}&data=${encodedData}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    iframe {
      width: 100%;
      height: 100vh;
      min-height: 400px;
      border: none;
      background: transparent;
    }
  </style>
</head>
<body>
  <iframe id="widget-frame" src="${embedUrl}" allow="clipboard-write"></iframe>
  <script>
    // Embedded data for reference
    const embeddedData = ${JSON.stringify({ tool: toolName, data })};

    // OpenAI SDK integration - forward data to iframe
    window.addEventListener("openai:set_globals", function(ev) {
      console.log("🎯 openai:set_globals event fired");
      const toolOutput = window.openai?.toolOutput?.result;
      if (toolOutput) {
        console.log("📦 Got OpenAI tool output:", toolOutput);
        // Post message to iframe with updated data
        const iframe = document.getElementById('widget-frame');
        iframe.contentWindow.postMessage({ type: 'widget-data', tool: embeddedData.tool, data: toolOutput }, '*');
      }
    });

    // Check if OpenAI data is already available
    if (window.openai?.toolOutput?.result) {
      console.log("📦 OpenAI data already available");
      setTimeout(() => {
        const iframe = document.getElementById('widget-frame');
        iframe.contentWindow.postMessage({ type: 'widget-data', tool: embeddedData.tool, data: window.openai.toolOutput.result }, '*');
      }, 100);
    }
  </script>
</body>
</html>`;
}

// Generate self-contained widget HTML (inline mode)
function generateInlineWidgetHtml(toolName: string, data: Record<string, unknown>): string {
  const widgetType = getWidgetType(toolName);
  let content = '';

  switch (widgetType) {
    case 'bmi': {
      const bmi = Number(data.bmi).toFixed(1);
      const category = data.category as string;
      const colorMap: Record<string, string> = { underweight: '#60a5fa', normal: '#10b981', overweight: '#f59e0b', obese: '#ef4444' };
      const color = colorMap[category?.toLowerCase()] || '#fff';
      content = `
        <div class="header">📏 BMI Calculator</div>
        <div class="big-number" style="color:${color}">${bmi}</div>
        <div class="label" style="background:${color}33;color:${color}">${category}</div>
        ${data.weight || data.height ? `<div class="stats">
          ${data.weight ? `<div class="stat-box"><div class="stat-label">Weight</div><div class="stat-value">${data.weight} kg</div></div>` : ''}
          ${data.height ? `<div class="stat-box"><div class="stat-label">Height</div><div class="stat-value">${data.height} cm</div></div>` : ''}
        </div>` : ''}`;
      break;
    }
    case 'tip': {
      content = `
        <div class="header">💵 Tip Calculator</div>
        <div class="big-number" style="color:#10b981">$${Number(data.total).toFixed(2)}</div>
        <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Total with ${data.tipPercent}% tip</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Bill</div><div class="stat-value">$${data.billAmount}</div></div>
          <div class="stat-box"><div class="stat-label">Tip</div><div class="stat-value">$${Number(data.tipAmount).toFixed(2)}</div></div>
          ${(data.splitWays as number) > 1 ? `<div class="stat-box" style="grid-column:span 2"><div class="stat-label">Per Person (${data.splitWays} ways)</div><div class="stat-value">$${Number(data.perPerson).toFixed(2)}</div></div>` : ''}
        </div>`;
      break;
    }
    case 'coin_flip': {
      const coinResult = String(data.result || 'heads');
      const isHeads = coinResult === 'heads';
      content = `
        <div class="header">🪙 Coin Flip</div>
        <div style="text-align:center;font-size:5rem;margin:1rem 0">${isHeads ? '👑' : '🦅'}</div>
        <div class="big-number" style="color:${isHeads ? '#fbbf24' : '#94a3b8'};font-size:2rem">${coinResult.toUpperCase()}</div>`;
      break;
    }
    case 'dice': {
      const rolls = data.rolls as number[];
      const diceEmoji = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      content = `
        <div class="header">🎲 Dice Roll</div>
        <div style="text-align:center;font-size:3rem;margin:1rem 0">${rolls.map(r => (data.sides === 6 && r <= 6) ? diceEmoji[r] : r).join(' ')}</div>
        <div class="big-number" style="color:#a78bfa">${data.total}</div>
        <div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">Total from ${rolls.length} ${data.sides}-sided dice</div>`;
      break;
    }
    case 'age': {
      content = `
        <div class="header">🎂 Age Calculator</div>
        <div class="big-number" style="color:#f472b6">${data.years}</div>
        <div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">Years Old</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Months</div><div class="stat-value">${data.months}</div></div>
          <div class="stat-box"><div class="stat-label">Days</div><div class="stat-value">${data.days}</div></div>
          <div class="stat-box"><div class="stat-label">Total Days</div><div class="stat-value">${Number(data.totalDays).toLocaleString()}</div></div>
          <div class="stat-box"><div class="stat-label">Next Birthday</div><div class="stat-value">${data.daysUntilNextBirthday} days</div></div>
        </div>`;
      break;
    }
    case 'zodiac': {
      const p1 = (data.person1 || { sign: '?', name: 'Unknown', symbol: '⭐' }) as { sign: string; name: string; symbol: string };
      const p2 = (data.person2 || { sign: '?', name: 'Unknown', symbol: '⭐' }) as { sign: string; name: string; symbol: string };
      const compat = (data.compatibility as number) || 50;
      const color = compat >= 80 ? '#10b981' : compat >= 60 ? '#fbbf24' : '#ef4444';
      content = `
        <div class="header">💕 Zodiac Compatibility</div>
        <div style="display:flex;justify-content:center;align-items:center;gap:1rem;margin:1rem 0">
          <div style="text-align:center"><div style="font-size:2.5rem">${p1.symbol || '⭐'}</div><div style="color:#fff;font-size:0.8rem">${p1.name || 'Unknown'}</div></div>
          <div style="font-size:2rem">❤️</div>
          <div style="text-align:center"><div style="font-size:2.5rem">${p2.symbol || '⭐'}</div><div style="color:#fff;font-size:0.8rem">${p2.name || 'Unknown'}</div></div>
        </div>
        <div class="big-number" style="color:${color}">${compat}%</div>
        <div class="label" style="background:${color}33;color:${color}">${data.level || 'Moderate'}</div>`;
      break;
    }
    case 'countdown': {
      const isPast = data.isPast as boolean;
      const isToday = data.isToday as boolean;
      content = `
        <div class="header">📅 Countdown</div>
        <div style="text-align:center;color:#fff;font-size:1.1rem;margin-bottom:0.5rem">${data.eventName}</div>
        ${isToday ? `<div class="big-number" style="color:#10b981">🎉</div><div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Today!</div>` : `
          <div class="big-number" style="color:${isPast ? '#94a3b8' : '#60a5fa'}">${Math.abs(data.days as number)}</div>
          <div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">days ${isPast ? 'ago' : 'to go'}</div>
          <div class="stats">
            <div class="stat-box"><div class="stat-label">Weeks</div><div class="stat-value">${Math.abs(data.weeks as number)}</div></div>
            <div class="stat-box"><div class="stat-label">Months</div><div class="stat-value">${Math.abs(data.months as number)}</div></div>
          </div>`}`;
      break;
    }
    case 'decision': {
      content = `
        <div class="header">🎱 Decision Maker</div>
        <div style="text-align:center;font-size:4rem;margin:1rem 0">🎱</div>
        <div class="big-number" style="color:#a78bfa;font-size:1.8rem">${data.decision}</div>`;
      break;
    }
    case 'random_number': {
      content = `
        <div class="header">🔢 Random Number</div>
        <div class="big-number" style="color:#60a5fa">${data.result}</div>
        <div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">Range: ${data.min} - ${data.max}</div>`;
      break;
    }
    case 'lucky_number': {
      content = `
        <div class="header">🍀 Lucky Number</div>
        <div style="text-align:center;font-size:3rem;margin:0.5rem 0">🍀</div>
        <div class="big-number" style="color:#10b981">${data.luckyNumber}</div>`;
      break;
    }
    case 'pick_random': {
      const selected = data.selected || data.result;
      content = `
        <div class="header">🎯 Random Pick</div>
        <div style="text-align:center;font-size:3rem;margin:0.5rem 0">🎯</div>
        <div class="big-number" style="color:#f472b6;font-size:1.8rem">${selected}</div>
        ${data.totalItems ? `<div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">Selected from ${data.totalItems} items</div>` : ''}`;
      break;
    }
    case 'ideal_weight': {
      content = `
        <div class="header">⚖️ Ideal Weight</div>
        <div class="big-number" style="color:#10b981">${Number(data.idealWeight).toFixed(1)}</div>
        <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">kg (${data.formula})</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Height</div><div class="stat-value">${data.height} cm</div></div>
          <div class="stat-box"><div class="stat-label">Gender</div><div class="stat-value">${data.gender}</div></div>
        </div>`;
      break;
    }
    case 'bmr': {
      content = `
        <div class="header">🔥 BMR Calculator</div>
        <div class="big-number" style="color:#f59e0b">${Math.round(data.bmr as number)}</div>
        <div class="label" style="background:rgba(245,158,11,0.2);color:#f59e0b">calories/day</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">TDEE</div><div class="stat-value">${Math.round(data.tdee as number)} cal</div></div>
          <div class="stat-box"><div class="stat-label">Activity</div><div class="stat-value">${data.activityLevel}</div></div>
        </div>`;
      break;
    }
    case 'weight_loss_plan': {
      const plan = data as Record<string, unknown>;
      content = `
        <div class="header">📉 Weight Loss Plan</div>
        <div class="big-number" style="color:#10b981;font-size:2rem">${plan.targetWeight} kg</div>
        <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Target in ${plan.weeksToGoal} weeks</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Current</div><div class="stat-value">${plan.currentWeight} kg</div></div>
          <div class="stat-box"><div class="stat-label">Daily Cal</div><div class="stat-value">${plan.dailyCalories}</div></div>
        </div>`;
      break;
    }
    case 'savings_plan': {
      content = `
        <div class="header">💰 Savings Plan</div>
        <div class="big-number" style="color:#10b981">$${Number(data.totalSaved).toLocaleString()}</div>
        <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Total after ${data.months} months</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Monthly</div><div class="stat-value">$${data.monthlyAmount}</div></div>
          <div class="stat-box"><div class="stat-label">Interest</div><div class="stat-value">${data.interestRate}%</div></div>
        </div>`;
      break;
    }
    case 'date_info': {
      content = `
        <div class="header">📅 Date Info</div>
        <div class="big-number" style="color:#60a5fa;font-size:1.5rem">${data.formatted || data.date}</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Day</div><div class="stat-value">${data.dayOfWeek}</div></div>
          <div class="stat-box"><div class="stat-label">Week</div><div class="stat-value">${data.weekNumber}</div></div>
          <div class="stat-box"><div class="stat-label">Day of Year</div><div class="stat-value">${data.dayOfYear}</div></div>
          <div class="stat-box"><div class="stat-label">Quarter</div><div class="stat-value">Q${data.quarter}</div></div>
        </div>`;
      break;
    }
    case 'days_between': {
      content = `
        <div class="header">📆 Days Between</div>
        <div class="big-number" style="color:#a78bfa">${Math.abs(data.days as number)}</div>
        <div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">days</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Weeks</div><div class="stat-value">${data.weeks}</div></div>
          <div class="stat-box"><div class="stat-label">Months</div><div class="stat-value">${data.months}</div></div>
        </div>`;
      break;
    }
    case 'percentage': {
      content = `
        <div class="header">📊 Percentage</div>
        <div class="big-number" style="color:#f472b6">${data.result}%</div>
        <div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">${data.value} of ${data.total}</div>`;
      break;
    }
    case 'convert_units': {
      content = `
        <div class="header">🔄 Unit Converter</div>
        <div class="big-number" style="color:#60a5fa;font-size:2rem">${data.result}</div>
        <div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">${data.toUnit}</div>
        <div class="stats">
          <div class="stat-box" style="grid-column:span 2"><div class="stat-label">From</div><div class="stat-value">${data.value} ${data.fromUnit}</div></div>
        </div>`;
      break;
    }
    case 'cycle': {
      const phaseColors: Record<string, string> = { menstrual: '#ef4444', follicular: '#22c55e', ovulation: '#f59e0b', luteal: '#8b5cf6' };
      const phaseEmojis: Record<string, string> = { menstrual: '🩸', follicular: '🌱', ovulation: '🥚', luteal: '🌙' };
      const phaseColor = phaseColors[data.phase as string] || '#f472b6';
      const phaseEmoji = phaseEmojis[data.phase as string] || '🌸';
      const modeLabel = data.mode === 'simplified' ? '(Simplified)' : '';
      content = `
        <div class="header">🌸 Cycle Tracker ${modeLabel}</div>
        <div class="big-number" style="color:#f472b6;font-size:1.5rem">${data.nextPeriodStart || data.nextPeriod}</div>
        <div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">Next Period${data.daysUntilNextPeriod ? ` (in ${data.daysUntilNextPeriod} days)` : ''}</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Cycle Day</div><div class="stat-value">${data.currentDay || '—'}</div></div>
          <div class="stat-box"><div class="stat-label">Phase ${phaseEmoji}</div><div class="stat-value" style="color:${phaseColor}">${data.phase || '—'}</div></div>
          <div class="stat-box"><div class="stat-label">🥚 Ovulation</div><div class="stat-value">${data.ovulationDate || '—'}</div></div>
          <div class="stat-box"><div class="stat-label">💚 Fertile Window</div><div class="stat-value">${data.fertileWindowStart || data.fertileStart || '—'} - ${data.fertileWindowEnd || data.fertileEnd || '—'}</div></div>
        </div>`;
      break;
    }
    case 'zodiac_sign': {
      const sign = data as Record<string, unknown>;
      content = `
        <div class="header">⭐ Zodiac Sign</div>
        <div style="text-align:center;font-size:4rem;margin:0.5rem 0">${sign.symbol || '⭐'}</div>
        <div class="big-number" style="color:#a78bfa;font-size:2rem">${sign.sign || sign.name || 'Unknown'}</div>
        <div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">${sign.element || 'Element'} • ${sign.dates || ''}</div>`;
      break;
    }
    case 'names': {
      const names = data.names as string[];
      content = `
        <div class="header">👶 Name Generator</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:1rem 0">
          ${names.slice(0, 8).map(n => `<span style="background:rgba(244,114,182,0.2);color:#f472b6;padding:0.5rem 1rem;border-radius:20px;font-weight:600">${n}</span>`).join('')}
        </div>
        <div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">${data.gender} names</div>`;
      break;
    }
    case 'position_size': {
      content = `
        <div class="header">📈 Position Size</div>
        <div class="big-number" style="color:#10b981">$${Number(data.positionSize).toLocaleString()}</div>
        <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">${data.shares} shares</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Risk</div><div class="stat-value">${data.riskPercent}%</div></div>
          <div class="stat-box"><div class="stat-label">Stop Loss</div><div class="stat-value">$${data.stopLoss}</div></div>
        </div>`;
      break;
    }
    case 'sleep_times': {
      const times = data.sleepTimes as string[] || data.wakeTimes as string[];
      content = `
        <div class="header">😴 Sleep Calculator</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:1rem 0">
          ${times.slice(0, 4).map((t: string) => `<span style="background:rgba(139,92,246,0.2);color:#8b5cf6;padding:0.5rem 1rem;border-radius:20px;font-weight:600">${t}</span>`).join('')}
        </div>
        <div class="label" style="background:rgba(139,92,246,0.2);color:#8b5cf6">Optimal ${data.sleepTimes ? 'bedtimes' : 'wake times'}</div>`;
      break;
    }
    case 'timezone': {
      content = `
        <div class="header">🌍 Timezone</div>
        <div class="big-number" style="color:#60a5fa;font-size:2rem">${data.convertedTime}</div>
        <div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">${data.toTimezone}</div>
        <div class="stats">
          <div class="stat-box" style="grid-column:span 2"><div class="stat-label">From</div><div class="stat-value">${data.originalTime} ${data.fromTimezone}</div></div>
        </div>`;
      break;
    }
    case 'unique_id': {
      content = `
        <div class="header">🔑 Unique ID</div>
        <div style="background:rgba(16,185,129,0.1);padding:1rem;border-radius:8px;margin:1rem 0;word-break:break-all;text-align:center">
          <code style="color:#10b981;font-size:0.9rem">${data.id}</code>
        </div>
        <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">${data.type || 'UUID'}</div>`;
      break;
    }
    case 'vibe_check': {
      const vibe = data as Record<string, unknown>;
      const vibeColor = (vibe.score as number) >= 70 ? '#10b981' : (vibe.score as number) >= 40 ? '#f59e0b' : '#ef4444';
      content = `
        <div class="header">✨ Vibe Check</div>
        <div style="text-align:center;font-size:4rem;margin:0.5rem 0">${vibe.emoji}</div>
        <div class="big-number" style="color:${vibeColor}">${vibe.score}%</div>
        <div class="label" style="background:${vibeColor}33;color:${vibeColor}">${vibe.vibe}</div>`;
      break;
    }
    case 'iq_score': {
      const iq = data.iqScore as number;
      const iqColor = iq >= 130 ? '#10b981' : iq >= 100 ? '#60a5fa' : '#f59e0b';
      content = `
        <div class="header">🧠 IQ Score</div>
        <div class="big-number" style="color:${iqColor}">${iq}</div>
        <div class="label" style="background:${iqColor}33;color:${iqColor}">${data.category}</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Percentile</div><div class="stat-value">${data.percentile}%</div></div>
          <div class="stat-box"><div class="stat-label">Rarity</div><div class="stat-value">1 in ${data.rarity}</div></div>
        </div>`;
      break;
    }
    case 'uniqueness': {
      const score = data.uniquenessScore as number;
      const uColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
      content = `
        <div class="header">🦄 Uniqueness</div>
        <div class="big-number" style="color:${uColor}">${score}%</div>
        <div class="label" style="background:${uColor}33;color:${uColor}">${data.category}</div>`;
      break;
    }
    case 'when_date': {
      content = `
        <div class="header">📅 When?</div>
        <div class="big-number" style="color:#60a5fa;font-size:1.5rem">${data.date}</div>
        <div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">${data.dayOfWeek}</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Days Away</div><div class="stat-value">${data.daysAway}</div></div>
          <div class="stat-box"><div class="stat-label">Weeks</div><div class="stat-value">${data.weeksAway}</div></div>
        </div>`;
      break;
    }
    case 'generic':
    default: {
      // Generic widget for any tool - display key-value pairs
      const entries = Object.entries(data).slice(0, 6);
      content = `
        <div class="header">🔧 Result</div>
        <div class="stats" style="grid-template-columns:1fr">
          ${entries.map(([k, v]) => `<div class="stat-box"><div class="stat-label">${k.replace(/([A-Z])/g, ' $1').trim()}</div><div class="stat-value">${typeof v === 'object' ? JSON.stringify(v) : v}</div></div>`).join('')}
        </div>`;
      break;
    }
  }

  // Generate HTML with OpenAI SDK support and Claude fallback
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${WIDGET_STYLES}</style>
</head>
<body>
  <div class="card" id="widget-container">${content}<div class="footer">tulzo.vercel.app</div></div>
  <script>
    // Embedded data for Claude (fallback)
    const embeddedData = ${JSON.stringify({ tool: toolName, data })};
    const widgetType = "${widgetType}";
    let widgetData = embeddedData;

    // OpenAI SDK integration - listen for set_globals event
    window.addEventListener("openai:set_globals", function(ev) {
      console.log("🎯 openai:set_globals event fired");
      const toolOutput = window.openai?.toolOutput?.result;
      if (toolOutput) {
        console.log("📦 Got OpenAI tool output:", toolOutput);
        widgetData = { tool: embeddedData.tool, data: toolOutput };
        updateWidget(widgetData);
      }
    });

    // Check if OpenAI data is already available
    if (window.openai?.toolOutput?.result) {
      console.log("📦 OpenAI data already available");
      widgetData = { tool: embeddedData.tool, data: window.openai.toolOutput.result };
      updateWidget(widgetData);
    }

    function updateWidget(wd) {
      console.log("🔄 Widget data:", wd);
      const container = document.getElementById('widget-container');
      if (!container) return;

      const data = wd.data;
      let html = renderWidgetContent(widgetType, data);
      container.innerHTML = html + '<div class="footer">tulzo.vercel.app</div>';
    }

    function renderWidgetContent(type, data) {
      switch(type) {
        case 'bmi': {
          const bmi = Number(data.bmi).toFixed(1);
          const category = data.category || '';
          const colorMap = { underweight: '#60a5fa', normal: '#10b981', overweight: '#f59e0b', obese: '#ef4444' };
          const color = colorMap[category.toLowerCase()] || '#fff';
          return '<div class="header">📏 BMI Calculator</div>' +
            '<div class="big-number" style="color:' + color + '">' + bmi + '</div>' +
            '<div class="label" style="background:' + color + '33;color:' + color + '">' + category + '</div>' +
            (data.weight || data.height ? '<div class="stats">' +
              (data.weight ? '<div class="stat-box"><div class="stat-label">Weight</div><div class="stat-value">' + data.weight + ' kg</div></div>' : '') +
              (data.height ? '<div class="stat-box"><div class="stat-label">Height</div><div class="stat-value">' + data.height + ' cm</div></div>' : '') +
            '</div>' : '');
        }
        case 'age': {
          return '<div class="header">🎂 Age Calculator</div>' +
            '<div class="big-number" style="color:#f472b6">' + data.years + '</div>' +
            '<div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">years old</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Months</div><div class="stat-value">' + data.months + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Days</div><div class="stat-value">' + data.days + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Total Days</div><div class="stat-value">' + Number(data.totalDays).toLocaleString() + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Next Birthday</div><div class="stat-value">' + data.daysUntilNextBirthday + ' days</div></div>' +
            '</div>';
        }
        case 'coin_flip': {
          const result = String(data.result || 'heads');
          const isHeads = result === 'heads';
          return '<div class="header">🪙 Coin Flip</div>' +
            '<div style="text-align:center;font-size:5rem;margin:1rem 0">' + (isHeads ? '👑' : '🦅') + '</div>' +
            '<div class="big-number" style="color:' + (isHeads ? '#fbbf24' : '#94a3b8') + ';font-size:2rem">' + result.toUpperCase() + '</div>';
        }
        case 'dice': {
          const rolls = data.rolls || [];
          return '<div class="header">🎲 Dice Roll</div>' +
            '<div class="big-number" style="color:#60a5fa">' + data.total + '</div>' +
            '<div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">Total</div>' +
            '<div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin-top:0.5rem">' +
              rolls.map(function(r) { return '<span style="background:rgba(96,165,250,0.3);padding:0.5rem 1rem;border-radius:8px;font-weight:700;color:#fff">' + r + '</span>'; }).join('') +
            '</div>';
        }
        case 'tip': {
          return '<div class="header">💵 Tip Calculator</div>' +
            '<div class="big-number" style="color:#10b981">$' + Number(data.total).toFixed(2) + '</div>' +
            '<div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Total with ' + data.tipPercent + '% tip</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Bill</div><div class="stat-value">$' + data.billAmount + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Tip</div><div class="stat-value">$' + Number(data.tipAmount).toFixed(2) + '</div></div>' +
              (Number(data.splitWays) > 1 ? '<div class="stat-box" style="grid-column:span 2"><div class="stat-label">Per Person (' + data.splitWays + ' ways)</div><div class="stat-value">$' + Number(data.perPerson).toFixed(2) + '</div></div>' : '') +
            '</div>';
        }
        default: {
          // Generic widget - display key-value pairs
          const entries = Object.entries(data).slice(0, 6);
          return '<div class="header">🔧 Result</div>' +
            '<div class="stats" style="grid-template-columns:1fr">' +
              entries.map(function(e) {
                const k = e[0], v = e[1];
                return '<div class="stat-box"><div class="stat-label">' + k.replace(/([A-Z])/g, ' $1').trim() + '</div><div class="stat-value">' + (typeof v === 'object' ? JSON.stringify(v) : v) + '</div></div>';
              }).join('') +
            '</div>';
        }
      }
    }
  </script>
</body>
</html>`;
}

// Main widget HTML generator - uses WIDGET_MODE to choose approach
function generateWidgetHtml(toolName: string, data: Record<string, unknown>): string {
  if (WIDGET_MODE === 'iframe') {
    return generateIframeWidgetHtml(toolName, data);
  }
  return generateInlineWidgetHtml(toolName, data);
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
      return `🪙 Result: ${String(r.result || 'heads').toUpperCase()}`;
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

// Generate placeholder template data for resources/read (before tool is called)
function getTemplateData(toolName: string): Record<string, unknown> {
  const defaults: Record<string, Record<string, unknown>> = {
    calculate_bmi: { bmi: 22.5, category: 'Normal', weight: 70, height: 175 },
    calculate_ideal_weight: { idealWeight: 68, formula: 'Devine', height: 175, gender: 'male' },
    calculate_bmr: { bmr: 1650, tdee: 2275, activityLevel: 'moderate' },
    generate_weight_loss_plan: { currentWeight: 80, targetWeight: 70, weeksToGoal: 20, dailyCalories: 1800, weeklyWeightLoss: 0.5, bmr: 1700, tdee: 2300 },
    calculate_savings_plan: { monthlySavings: 500, monthsToGoal: 24, totalSaved: 12000, disposableIncome: 2000, savingsRate: 25, currency: 'USD' },
    calculate_date_info: { dayOfWeek: 'Monday', weekNumber: 1, isLeapYear: false, dayOfYear: 1, date: '2026-01-01' },
    days_between_dates: { days: 30, weeks: 4, months: 1, startDate: '2026-01-01', endDate: '2026-01-31' },
    random_number: { result: 42, min: 1, max: 100 },
    coin_flip: { result: 'heads' },
    pick_random: { result: 'Option A', options: ['Option A', 'Option B', 'Option C'] },
    calculate_tip: { billAmount: 50, tipPercent: 18, tipAmount: 9, total: 59, perPerson: 59, splitWays: 1 },
    calculate_percentage: { result: 25, operation: 'percentage_of', value: 100, percentage: 25 },
    calculate_age: { years: 30, months: 6, days: 15, totalDays: 11138, daysUntilBirthday: 180 },
    convert_units: { result: 2.2, fromValue: 1, fromUnit: 'kg', toUnit: 'lb' },
    calculate_cycle: { nextPeriodStart: '2026-01-28', nextPeriodEnd: '2026-02-02', fertileWindowStart: '2026-01-10', fertileWindowEnd: '2026-01-16', ovulationDate: '2026-01-14', currentDay: 10, phase: 'follicular', daysUntilNextPeriod: 18, cycleLength: 28, periodLength: 5, mode: 'simplified' },
    calculate_countdown: { days: 100, weeks: 14, months: 3, targetDate: '2026-04-11', direction: 'until' },
    make_decision: { decision: 'Yes', options: ['Yes', 'No'] },
    zodiac_compatibility: {
      person1: { sign: 'aries', name: 'Aries', symbol: '♈', element: 'Fire' },
      person2: { sign: 'leo', name: 'Leo', symbol: '♌', element: 'Fire' },
      compatibility: 85, level: 'Excellent'
    },
    get_zodiac_sign: { sign: 'aries', name: 'Aries', symbol: '♈', element: 'Fire', traits: ['Bold', 'Ambitious'] },
    generate_names: { names: ['Alex', 'Jordan', 'Taylor'], type: 'first', count: 3 },
    calculate_position_size: { positionSize: 100, riskAmount: 50, shares: 10, entryPrice: 100, stopLoss: 95 },
    calculate_sleep_times: { sleepTimes: ['22:00', '23:30', '01:00'], wakeTimes: ['06:00', '07:30', '09:00'], cycles: 5 },
    spin_wheel: { result: 'Winner!', options: ['Winner!', 'Try Again', 'Bonus'] },
    convert_timezone: { result: '15:00', fromTime: '10:00', fromTimezone: 'America/New_York', toTimezone: 'Europe/London' },
    generate_unique_id: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', type: 'uuid' },
    lucky_number: { number: 7, min: 1, max: 100 },
    roll_dice: { rolls: [4, 6], total: 10, sides: 6, count: 2 },
    vibe_check: { result: 'Cat Person', catScore: 7, dogScore: 3, traits: ['Independent', 'Curious'] },
    calculate_iq_score: { iq: 115, percentile: 84, category: 'Above Average', correctAnswers: 8, totalQuestions: 10 },
    calculate_uniqueness: { uniquenessScore: 0.001, rarity: '1 in 100,000', traits: { eyeColor: 'green', hairColor: 'red' } },
    when_date_info: { date: '2026-06-15', dayOfWeek: 'Monday', daysFromToday: 164, zodiacSign: 'Gemini' },
  };
  return defaults[toolName] || { message: 'Widget ready' };
}

// Handle MCP requests
function handleMCPRequest(mcpRequest: MCPRequest): MCPResponse {
  const { id, method, params } = mcpRequest;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: { subscribe: false, listChanged: false }
            },
            serverInfo: { name: 'tulzo-mcp', version: '1.0.0' },
          },
        };

      case 'resources/list': {
        // Return list of widget template resources with _meta (no HTML content - that's in resources/read)
        const resources = TOOLS.map(tool => {
          const title = tool.name.split('_').filter(w => w.length > 0).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
          const messages = TOOL_INVOCATION_MESSAGES[tool.name] || { invoking: 'Processing...', invoked: 'Complete' };
          return {
            uri: `ui://widget/${tool.name}.html`,
            name: title,
            title: title,
            description: tool.description,
            mimeType: 'text/html',
            _meta: {
              'openai/outputTemplate': `ui://widget/${tool.name}.html`,
              'openai/mimeType': 'text/html+skybridge',
              'openai/toolInvocation/invoking': messages.invoking,
              'openai/toolInvocation/invoked': messages.invoked,
              'openai/widgetAccessible': true,
              'openai/resultCanProduceWidget': true,
              'openai/widgetPrefersBorder': true,
            },
          };
        });
        return { jsonrpc: '2.0', id, result: { resources } };
      }

      case 'resources/read': {
        const uri = (params as { uri: string }).uri;
        // Parse tool name from URI: ui://widget/{toolName}.html
        const match = uri.match(/ui:\/\/widget\/([a-z_]+)\.html/);
        if (!match) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: `Invalid resource URI: ${uri}` } };
        }
        const toolName = match[1];
        const tool = TOOLS.find(t => t.name === toolName);
        if (!tool) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${toolName}` } };
        }

        // Generate placeholder data for each tool type
        const templateData = getTemplateData(toolName);
        const widgetHtml = generateWidgetHtml(toolName, templateData);

        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{
              uri,
              mimeType: 'text/html',
              text: widgetHtml,
            }]
          }
        };
      }

      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
      case 'tools/call': {
        const toolName = (params as { name: string }).name;
        const toolArgs = (params as { arguments?: Record<string, unknown> }).arguments || {};
        const result = executeTool(toolName, toolArgs);

        // Prepare widget data with input args for context
        let widgetData: Record<string, unknown> = result as Record<string, unknown>;
        if (toolName === 'calculate_bmi') {
          widgetData = { ...widgetData, weight: toolArgs.weight, height: toolArgs.height };
        }

        // Build response text
        const responseText = formatResultText(toolName, result);

        // Generate self-contained widget HTML
        const widgetHtmlContent = generateWidgetHtml(toolName, widgetData);

        // Get tool-specific invocation messages
        const invocationMessages = TOOL_INVOCATION_MESSAGES[toolName] || {
          invoking: 'Processing...',
          invoked: 'Complete'
        };

        // Build OpenAI widget resource (EmbeddedResource style)
        const widgetResource = {
          type: 'resource',
          resource: {
            uri: `ui://widget/${toolName}.html`,
            mimeType: 'text/html',
            text: widgetHtmlContent,
            title: toolName.split('_').filter(w => w.length > 0).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
          }
        };

        // Build _meta with OpenAI widget hints
        const meta = {
          'openai.com/widget': widgetResource,
          'openai/toolInvocation/invoking': invocationMessages.invoking,
          'openai/toolInvocation/invoked': invocationMessages.invoked,
          'openai/widgetAccessible': true,
          'openai/resultCanProduceWidget': true,
          'openai/widgetPrefersBorder': true,
        };

        // Build content array with text result
        const content: Array<{ type: string; text?: string; resource?: unknown }> = [
          { type: 'text', text: responseText },
        ];

        // Add widget HTML for Claude artifact rendering
        const widgetHtml = `Here is a complete, production-ready visualization widget. This should be displayed as an interactive artifact:
\`\`\`html
${widgetHtmlContent}
\`\`\`
This component is fully functional and ready for immediate use.`;
        content.push({ type: 'text', text: widgetHtml });

        // Add embedded resource for OpenAI widget rendering
        content.push({
          type: 'resource',
          resource: widgetResource.resource
        });

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content,
            // structuredContent with query args and result data
            structuredContent: {
              query: toolArgs,
              result: widgetData,
              display: {
                type: 'html',
                content: widgetHtmlContent,
              }
            },
            _meta: meta,
          }
        };
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


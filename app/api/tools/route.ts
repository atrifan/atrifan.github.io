import { NextResponse } from 'next/server';

/**
 * Get all MCP tools documentation
 * GET /api/tools
 * 
 * Returns a list of all available tools with their schemas and metadata.
 */

// Tool definitions for documentation
const TOOLS_DOCUMENTATION = [
  {
    name: 'calculate_bmi',
    description: 'Calculate Body Mass Index (BMI) from weight and height',
    category: 'Health & Fitness',
    hasWidget: true,
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
        category: { type: 'string', enum: ['Underweight', 'Normal', 'Overweight', 'Obese'] },
        weight: { type: 'number' },
        height: { type: 'number' },
      },
    },
  },
  {
    name: 'calculate_ideal_weight',
    description: 'Calculate ideal weight using the Devine formula',
    category: 'Health & Fitness',
    hasWidget: true,
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
        formula: { type: 'string' },
        height: { type: 'number' },
        gender: { type: 'string' },
      },
    },
  },
  {
    name: 'calculate_bmr',
    description: 'Calculate Basal Metabolic Rate using Mifflin-St Jeor equation',
    category: 'Health & Fitness',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        weight: { type: 'number', description: 'Weight in kg' },
        height: { type: 'number', description: 'Height in cm' },
        age: { type: 'number', description: 'Age in years' },
        sex: { type: 'string', enum: ['male', 'female'] },
        activityLevel: { type: 'string', enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'] },
      },
      required: ['weight', 'height', 'age', 'sex'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        bmr: { type: 'number', description: 'Basal Metabolic Rate in calories' },
        tdee: { type: 'number', description: 'Total Daily Energy Expenditure' },
        activityLevel: { type: 'string' },
      },
    },
  },
  {
    name: 'random_number',
    description: 'Generate a random integer between min and max (inclusive)',
    category: 'Random & Fun',
    hasWidget: true,
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
  },
  {
    name: 'coin_flip',
    description: 'Flip a coin and get heads or tails',
    category: 'Random & Fun',
    hasWidget: true,
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string', enum: ['heads', 'tails'] },
      },
    },
  },
  {
    name: 'pick_random',
    description: 'Pick a random item from a list of options',
    category: 'Random & Fun',
    hasWidget: true,
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
        selected: { type: 'string' },
        totalItems: { type: 'number' },
        index: { type: 'number' },
      },
    },
  },
  {
    name: 'roll_dice',
    description: 'Roll dice with customizable number of sides and dice count',
    category: 'Random & Fun',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        sides: { type: 'integer', enum: [4, 6, 8, 10, 12, 20, 100], description: 'Number of sides (default: 6)' },
        count: { type: 'integer', description: 'Number of dice (default: 1)', minimum: 1, maximum: 10 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        rolls: { type: 'array', items: { type: 'integer' } },
        total: { type: 'integer' },
        sides: { type: 'integer' },
        count: { type: 'integer' },
      },
    },
  },
  {
    name: 'spin_wheel',
    description: 'Spin a wheel with custom options and get a random result',
    category: 'Random & Fun',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        options: { type: 'array', items: { type: 'string' }, description: 'Options on the wheel', minItems: 2 },
      },
      required: ['options'],
    },
    outputSchema: {
      type: 'object',
      properties: { result: { type: 'string' }, index: { type: 'number' }, totalOptions: { type: 'number' } },
    },
  },
  {
    name: 'lucky_number',
    description: 'Generate a lucky number based on optional seed',
    category: 'Random & Fun',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        min: { type: 'integer', description: 'Minimum value (default: 1)' },
        max: { type: 'integer', description: 'Maximum value (default: 100)' },
        seed: { type: 'string', description: 'Optional seed for consistent results' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: { number: { type: 'integer' }, min: { type: 'integer' }, max: { type: 'integer' } },
    },
  },
  {
    name: 'calculate_age',
    description: 'Calculate exact age from birth date including years, months, days, and days until next birthday',
    category: 'Date & Time',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: { birthDate: { type: 'string', description: 'Birth date in YYYY-MM-DD format' } },
      required: ['birthDate'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        years: { type: 'number' }, months: { type: 'number' }, days: { type: 'number' },
        totalDays: { type: 'number' }, daysUntilNextBirthday: { type: 'number' }, zodiacSign: { type: 'string' },
      },
    },
  },
  {
    name: 'days_between_dates',
    description: 'Calculate the number of days between two dates',
    category: 'Date & Time',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['startDate', 'endDate'],
    },
    outputSchema: {
      type: 'object',
      properties: { days: { type: 'number' }, weeks: { type: 'number' }, months: { type: 'number' } },
    },
  },
  {
    name: 'calculate_tip',
    description: 'Calculate tip amount and total bill',
    category: 'Finance',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Bill amount' },
        tipPercent: { type: 'number', description: 'Tip percentage (default: 15)' },
        splitWays: { type: 'integer', description: 'Number of people to split (default: 1)' },
      },
      required: ['amount'],
    },
    outputSchema: {
      type: 'object',
      properties: { tipAmount: { type: 'number' }, total: { type: 'number' }, perPerson: { type: 'number' } },
    },
  },
  {
    name: 'calculate_percentage',
    description: 'Calculate percentage of a number or percentage change',
    category: 'Math',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'The base value' },
        percentage: { type: 'number', description: 'Percentage to calculate' },
        operation: { type: 'string', enum: ['of', 'increase', 'decrease', 'change'] },
      },
      required: ['value', 'percentage'],
    },
    outputSchema: {
      type: 'object',
      properties: { result: { type: 'number' }, original: { type: 'number' }, percentage: { type: 'number' } },
    },
  },
  {
    name: 'convert_units',
    description: 'Convert between different units of measurement',
    category: 'Math',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'Value to convert' },
        from: { type: 'string', description: 'Source unit' },
        to: { type: 'string', description: 'Target unit' },
      },
      required: ['value', 'from', 'to'],
    },
    outputSchema: {
      type: 'object',
      properties: { result: { type: 'number' }, from: { type: 'string' }, to: { type: 'string' } },
    },
  },
  {
    name: 'zodiac_compatibility',
    description: 'Check zodiac compatibility between two signs',
    category: 'Astrology',
    hasWidget: true,
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
      properties: { compatibility: { type: 'number' }, description: { type: 'string' } },
    },
  },
  {
    name: 'get_zodiac_sign',
    description: 'Get zodiac sign from birth date',
    category: 'Astrology',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: { birthDate: { type: 'string', description: 'Birth date (YYYY-MM-DD)' } },
      required: ['birthDate'],
    },
    outputSchema: {
      type: 'object',
      properties: { sign: { type: 'string' }, symbol: { type: 'string' }, element: { type: 'string' }, traits: { type: 'array' } },
    },
  },
  {
    name: 'make_decision',
    description: 'Help make a decision between options with optional weights',
    category: 'Random & Fun',
    hasWidget: true,
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
      properties: { decision: { type: 'string' }, confidence: { type: 'number' } },
    },
  },
  {
    name: 'generate_names',
    description: 'Generate random names for people, pets, or projects',
    category: 'Random & Fun',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['first', 'last', 'full', 'pet', 'project', 'company'] },
        count: { type: 'integer', description: 'Number of names (default: 5)', maximum: 20 },
        gender: { type: 'string', enum: ['male', 'female', 'neutral'] },
      },
    },
    outputSchema: {
      type: 'object',
      properties: { names: { type: 'array', items: { type: 'string' } }, type: { type: 'string' }, count: { type: 'number' } },
    },
  },
  {
    name: 'generate_unique_id',
    description: 'Generate unique identifiers (UUID, nanoid, etc.)',
    category: 'Utility',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['uuid', 'nanoid', 'short', 'numeric'], description: 'Type of ID (default: uuid)' },
        count: { type: 'integer', description: 'Number of IDs to generate (default: 1)', maximum: 10 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, ids: { type: 'array' }, type: { type: 'string' } },
    },
  },
  {
    name: 'calculate_sleep_times',
    description: 'Calculate optimal sleep and wake times based on sleep cycles',
    category: 'Health & Fitness',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        wakeTime: { type: 'string', description: 'Desired wake time (HH:MM)' },
        sleepTime: { type: 'string', description: 'Desired sleep time (HH:MM)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: { sleepTimes: { type: 'array' }, wakeTimes: { type: 'array' }, cycles: { type: 'number' } },
    },
  },
  {
    name: 'vibe_check',
    description: 'Fun personality quiz - are you a cat person or dog person?',
    category: 'Random & Fun',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        answers: { type: 'array', items: { type: 'string' }, description: 'Quiz answers' },
      },
      required: ['answers'],
    },
    outputSchema: {
      type: 'object',
      properties: { result: { type: 'string' }, catScore: { type: 'number' }, dogScore: { type: 'number' } },
    },
  },
  {
    name: 'calculate_iq_score',
    description: 'Calculate IQ score from quiz answers (for entertainment)',
    category: 'Random & Fun',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        correctAnswers: { type: 'integer', description: 'Number of correct answers' },
        totalQuestions: { type: 'integer', description: 'Total number of questions' },
        timeSeconds: { type: 'integer', description: 'Time taken in seconds' },
      },
      required: ['correctAnswers', 'totalQuestions'],
    },
    outputSchema: {
      type: 'object',
      properties: { iqScore: { type: 'integer' }, category: { type: 'string' }, percentile: { type: 'number' } },
    },
  },
  {
    name: 'blood_donation_eligibility',
    description: 'Check if a person is eligible to donate blood based on age, weight, and height. Returns donation amount and safety guidelines.',
    category: 'Health & Fitness',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        age: { type: 'number', description: 'Age in years' },
        weight: { type: 'number', description: 'Weight in kilograms' },
        height: { type: 'number', description: 'Height in centimeters' },
        gender: { type: 'string', enum: ['male', 'female'], description: 'Gender for blood volume calculation' },
      },
      required: ['age', 'weight', 'height', 'gender'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        eligible: { type: 'boolean', description: 'Whether the person can donate blood' },
        amount: { type: 'number', description: 'Recommended donation amount in ml' },
        bloodVolume: { type: 'number', description: 'Estimated total blood volume in liters' },
        warnings: { type: 'array', items: { type: 'string' } },
        tips: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'blood_type_compatibility',
    description: 'Check blood type compatibility for donation and receiving. Shows who you can donate to and receive from.',
    category: 'Health & Fitness',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        bloodType: { type: 'string', enum: ['A', 'B', 'AB', 'O'], description: 'ABO blood type' },
        rhFactor: { type: 'string', enum: ['+', '-'], description: 'Rh factor (positive or negative)' },
      },
      required: ['bloodType', 'rhFactor'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        fullBloodType: { type: 'string', description: 'Full blood type (e.g., A+, O-)' },
        canDonateTo: { type: 'array', items: { type: 'string' } },
        canReceiveFrom: { type: 'array', items: { type: 'string' } },
        isUniversalDonor: { type: 'boolean' },
        isUniversalRecipient: { type: 'boolean' },
      },
    },
  },
  {
    name: 'baby_blood_type',
    description: 'Predict possible blood types for a baby based on parents blood types. Also checks for Rh incompatibility risk.',
    category: 'Health & Fitness',
    hasWidget: true,
    inputSchema: {
      type: 'object',
      properties: {
        fatherBloodType: { type: 'string', enum: ['A', 'B', 'AB', 'O'], description: 'Father\'s ABO blood type' },
        fatherRh: { type: 'string', enum: ['+', '-'], description: 'Father\'s Rh factor' },
        motherBloodType: { type: 'string', enum: ['A', 'B', 'AB', 'O'], description: 'Mother\'s ABO blood type' },
        motherRh: { type: 'string', enum: ['+', '-'], description: 'Mother\'s Rh factor' },
      },
      required: ['fatherBloodType', 'fatherRh', 'motherBloodType', 'motherRh'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        possibleTypes: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, percentage: { type: 'number' } } } },
        rhIncompatibilityRisk: { type: 'boolean' },
        rhWarning: { type: 'string' },
      },
    },
  },
];

export async function GET() {
  return NextResponse.json({
    tools: TOOLS_DOCUMENTATION,
    totalCount: TOOLS_DOCUMENTATION.length,
    categories: [...new Set(TOOLS_DOCUMENTATION.map(t => t.category))],
  }, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
}


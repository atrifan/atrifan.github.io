import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { WeightCalculator } from '@/src/utils/WeightCalculator';
import { BudgetCalculator } from '@/src/utils/BudgetCalculator';
import { DateCalculator } from '@/src/utils/DateCalculator';
import { getSignFromDate, getCompatibility, getSignInfo, ZODIAC_SIGNS, ZodiacSign } from '@/src/data/zodiac';
import { decryptApiKey, isApiKeyExpired, useClerkApiKeys } from '@/src/utils/apiKeyEncryption';
import {
  calculateFunnel, WORLD_POPULATION,
  EyeColor, HairColor, SkinTone, Ethnicity, BloodType, Handedness
} from '@/src/data/percentiles';
import {
  TestMode, TEST_MODE_CONFIG, getQuestionsForMode, calculateIQScore, getIQLabel
} from '@/src/data/iqQuestions';

// Auth types
type AuthMethod = 'oauth' | 'header' | 'path' | 'internal' | 'none';

interface AuthResult {
  authenticated: boolean;
  userId?: string;
  plan?: string;
  isSubscribed?: boolean;
  authMethod: AuthMethod;
  error?: string;
}

/**
 * Check if user has Pro subscription using Clerk Billing
 */
async function checkProSubscription(client: Awaited<ReturnType<typeof clerkClient>>, userId: string): Promise<boolean> {
  try {
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    for (const membership of memberships.data) {
      const org = await client.organizations.getOrganization({ organizationId: membership.organization.id });
      if (org.publicMetadata?.plan === 'pro' || org.publicMetadata?.subscription === 'active') {
        return true;
      }
    }
    const user = await client.users.getUser(userId);
    if (user.publicMetadata?.plan === 'pro' || user.publicMetadata?.subscription === 'active') {
      return true;
    }
    if (user.unsafeMetadata?.plan === 'pro') {
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
}

/**
 * Validate API key - supports both custom encryption and Clerk API Keys
 */
async function validateApiKey(key: string): Promise<AuthResult> {
  const client = await clerkClient();

  // Try Clerk API Keys first if enabled
  if (useClerkApiKeys()) {
    try {
      const apiKey = await client.apiKeys.verify(key);

      if (!apiKey) {
        return { authenticated: false, authMethod: 'none', error: 'Invalid API key' };
      }

      if (apiKey.revoked) {
        return { authenticated: false, authMethod: 'none', error: 'API key has been revoked' };
      }

      if (apiKey.expired) {
        return { authenticated: false, authMethod: 'none', error: 'API key has expired' };
      }

      const userId = apiKey.subject;
      const isSubscribed = await checkProSubscription(client, userId);

      return {
        authenticated: true,
        userId,
        plan: isSubscribed ? 'pro' : 'free',
        isSubscribed,
        authMethod: 'header',
      };
    } catch (error) {
      console.error('Error validating API key with Clerk:', error);
      return { authenticated: false, authMethod: 'none', error: 'Invalid API key' };
    }
  }

  // Use custom encryption (default)
  const payload = decryptApiKey(key);
  if (!payload) {
    return { authenticated: false, authMethod: 'none', error: 'Invalid API key format' };
  }
  if (isApiKeyExpired(payload)) {
    return { authenticated: false, authMethod: 'none', error: 'API key expired' };
  }
  try {
    const user = await client.users.getUser(payload.userId);
    if (!user) {
      return { authenticated: false, authMethod: 'none', error: 'User not found' };
    }
    const storedKey = user.unsafeMetadata?.apiKey as string | undefined;
    if (storedKey && storedKey !== key) {
      return { authenticated: false, authMethod: 'none', error: 'API key revoked' };
    }
    const isSubscribed = await checkProSubscription(client, payload.userId);
    return {
      authenticated: true,
      userId: payload.userId,
      plan: isSubscribed ? 'pro' : 'free',
      isSubscribed,
      authMethod: 'header',
    };
  } catch (error) {
    console.error('Error validating API key:', error);
    return { authenticated: false, authMethod: 'none', error: 'Validation failed' };
  }
}

/**
 * Log MCP connection to user's unsafeMetadata
 */
async function logConnection(userId: string, authMethod: AuthMethod, clientIp: string, userAgent: string) {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const connections = (user.unsafeMetadata?.mcpConnections as Array<{
      ip: string;
      agent: string;
      authMethod: AuthMethod;
      lastUsed: string;
    }>) || [];

    // Find existing connection with same IP and agent
    const existingIndex = connections.findIndex(c => c.ip === clientIp && c.agent === userAgent);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      // Update existing connection
      connections[existingIndex].lastUsed = now;
      connections[existingIndex].authMethod = authMethod;
    } else {
      // Add new connection (keep last 10)
      connections.unshift({
        ip: clientIp,
        agent: userAgent,
        authMethod,
        lastUsed: now,
      });
      if (connections.length > 10) {
        connections.pop();
      }
    }

    await client.users.updateUser(userId, {
      unsafeMetadata: {
        ...user.unsafeMetadata,
        mcpConnections: connections,
      },
    });
  } catch (error) {
    console.error('Error logging connection:', error);
  }
}

// GA4 Measurement Protocol configuration
const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || 'G-QSNTL3PGRJ';
const GA4_API_SECRET = process.env.GA4_API_SECRET; // Server-side secret for Measurement Protocol

/**
 * Track MCP events to Google Analytics using Measurement Protocol
 * This allows server-side tracking of API calls
 */
async function trackMCPEvent(
  eventName: string,
  params: Record<string, string | number | boolean>,
  clientId?: string
) {
  // Only track if API secret is configured
  if (!GA4_API_SECRET) {
    return;
  }

  try {
    const payload = {
      client_id: clientId || `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      events: [{
        name: eventName,
        params: {
          ...params,
          engagement_time_msec: 100,
          session_id: Date.now().toString(),
        },
      }],
    };

    // Fire and forget - don't await
    fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silently ignore errors
    });
  } catch {
    // Silently ignore errors
  }
}

/**
 * Extract auth from request headers
 */
function extractAuth(request: NextRequest): { apiKey?: string; authMethod: AuthMethod } {
  // Check for internal forwarded headers (from path-based route)
  const internalUserId = request.headers.get('X-User-Id');
  if (internalUserId) {
    return { authMethod: 'internal' };
  }

  // Check x-api-key header
  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey) {
    return { apiKey: xApiKey, authMethod: 'header' };
  }

  // Check Authorization: Bearer header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // If it's a tlz_ key, treat as API key
    if (token.startsWith('tlz_')) {
      return { apiKey: token, authMethod: 'header' };
    }
    // Otherwise it might be an OAuth token (future support)
    return { apiKey: token, authMethod: 'oauth' };
  }

  return { authMethod: 'none' };
}

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

// Eclipse data from NASA - verified upcoming eclipses 2025-2030
interface EclipseData {
  date: string;
  type: 'solar' | 'lunar';
  subtype: 'total' | 'partial' | 'annular' | 'penumbral' | 'hybrid';
  peakTime: string;
  duration?: string;
  visibility: string[];
  coordinates: { lat: number; lon: number };
  magnitude: number;
}

const ECLIPSE_DATA: EclipseData[] = [
  { date: '2025-03-14', type: 'lunar', subtype: 'total', peakTime: '06:58', duration: '1h 05m', visibility: ['Americas', 'Europe', 'Africa', 'Pacific'], coordinates: { lat: -3, lon: -95 }, magnitude: 1.178 },
  { date: '2025-03-29', type: 'solar', subtype: 'partial', peakTime: '10:47', visibility: ['Northwest Africa', 'Europe', 'Northern Russia'], coordinates: { lat: 64, lon: -20 }, magnitude: 0.938 },
  { date: '2025-09-07', type: 'lunar', subtype: 'total', peakTime: '18:11', duration: '1h 22m', visibility: ['Europe', 'Africa', 'Asia', 'Australia'], coordinates: { lat: 3, lon: 82 }, magnitude: 1.362 },
  { date: '2025-09-21', type: 'solar', subtype: 'partial', peakTime: '19:42', visibility: ['South Pacific', 'New Zealand', 'Antarctica'], coordinates: { lat: -66, lon: -125 }, magnitude: 0.855 },
  { date: '2026-02-17', type: 'solar', subtype: 'annular', peakTime: '12:13', visibility: ['Antarctica', 'Southern Argentina', 'Chile'], coordinates: { lat: -65, lon: -30 }, magnitude: 0.963 },
  { date: '2026-03-03', type: 'lunar', subtype: 'total', peakTime: '11:33', duration: '58m', visibility: ['East Asia', 'Australia', 'Pacific', 'Americas'], coordinates: { lat: 7, lon: 170 }, magnitude: 1.151 },
  { date: '2026-08-12', type: 'solar', subtype: 'total', peakTime: '17:46', duration: '2m 18s', visibility: ['Arctic', 'Greenland', 'Iceland', 'Spain', 'Portugal'], coordinates: { lat: 65, lon: -25 }, magnitude: 1.039 },
  { date: '2026-08-28', type: 'lunar', subtype: 'partial', peakTime: '04:13', visibility: ['Americas', 'Europe', 'Africa'], coordinates: { lat: -10, lon: -60 }, magnitude: 0.930 },
  { date: '2027-02-06', type: 'solar', subtype: 'annular', peakTime: '16:00', visibility: ['South America', 'Antarctica', 'South Atlantic'], coordinates: { lat: -55, lon: -45 }, magnitude: 0.928 },
  { date: '2027-08-02', type: 'solar', subtype: 'total', peakTime: '10:07', duration: '6m 23s', visibility: ['Morocco', 'Spain', 'Algeria', 'Libya', 'Egypt', 'Saudi Arabia'], coordinates: { lat: 25, lon: 33 }, magnitude: 1.079 },
  { date: '2028-01-12', type: 'lunar', subtype: 'partial', peakTime: '04:13', visibility: ['Americas', 'Europe', 'Africa'], coordinates: { lat: 20, lon: -60 }, magnitude: 0.066 },
  { date: '2028-07-22', type: 'solar', subtype: 'total', peakTime: '02:55', duration: '5m 10s', visibility: ['Australia', 'New Zealand', 'South Pacific'], coordinates: { lat: -25, lon: 175 }, magnitude: 1.056 },
  { date: '2029-01-01', type: 'lunar', subtype: 'total', peakTime: '22:23', duration: '1h 11m', visibility: ['Europe', 'Africa', 'Asia', 'Americas'], coordinates: { lat: 23, lon: -25 }, magnitude: 1.245 },
  { date: '2029-06-26', type: 'lunar', subtype: 'total', peakTime: '03:22', duration: '1h 42m', visibility: ['Americas', 'Europe', 'Africa'], coordinates: { lat: -23, lon: -45 }, magnitude: 1.844 },
  { date: '2029-12-20', type: 'lunar', subtype: 'total', peakTime: '22:42', duration: '53m', visibility: ['Americas', 'Europe', 'Africa', 'Asia'], coordinates: { lat: 23, lon: -30 }, magnitude: 1.117 },
  { date: '2030-06-01', type: 'solar', subtype: 'annular', peakTime: '06:29', visibility: ['Algeria', 'Tunisia', 'Greece', 'Turkey', 'Russia', 'China', 'Japan'], coordinates: { lat: 45, lon: 75 }, magnitude: 0.944 },
  { date: '2030-11-25', type: 'solar', subtype: 'total', peakTime: '06:51', duration: '3m 44s', visibility: ['Southern Africa', 'Indian Ocean', 'Australia'], coordinates: { lat: -44, lon: 72 }, magnitude: 1.047 },
];

function getBestVisibleLocation(eclipse: EclipseData): string {
  const { lat, lon } = eclipse.coordinates;
  if (lat > 60) return 'Arctic region';
  if (lat > 35) {
    if (lon >= -130 && lon <= -60) return 'North America';
    if (lon >= -25 && lon <= 60) return 'Europe';
    if (lon >= 60 && lon <= 150) return 'Northern Asia';
    return 'Northern Pacific';
  }
  if (lat > 0) {
    if (lon >= -130 && lon <= -30) return 'Central America / Caribbean';
    if (lon >= -20 && lon <= 55) return 'North Africa / Middle East';
    if (lon >= 55 && lon <= 150) return 'South Asia / Southeast Asia';
    return 'Pacific Ocean';
  }
  if (lat > -35) {
    if (lon >= -90 && lon <= -30) return 'South America';
    if (lon >= -20 && lon <= 55) return 'Central/Southern Africa';
    if (lon >= 100 && lon <= 180) return 'Australia / Indonesia';
    return 'Indian Ocean';
  }
  if (lat > -60) {
    if (lon >= -90 && lon <= -30) return 'Southern South America';
    if (lon >= 100 && lon <= 180) return 'Southern Australia / New Zealand';
    return 'Southern Ocean';
  }
  return 'Antarctica';
}

function isVisibleFromLocation(eclipse: EclipseData, lat: number, lon: number): boolean {
  const regionMap: Record<string, { latRange: [number, number]; lonRange: [number, number] }> = {
    'Americas': { latRange: [-60, 70], lonRange: [-170, -30] },
    'North America': { latRange: [15, 70], lonRange: [-170, -50] },
    'South America': { latRange: [-60, 15], lonRange: [-90, -30] },
    'Europe': { latRange: [35, 72], lonRange: [-25, 60] },
    'Africa': { latRange: [-35, 37], lonRange: [-20, 55] },
    'Asia': { latRange: [0, 75], lonRange: [25, 180] },
    'Australia': { latRange: [-50, -10], lonRange: [110, 180] },
    'Pacific': { latRange: [-50, 50], lonRange: [140, 180] },
  };
  for (const region of eclipse.visibility) {
    const bounds = regionMap[region];
    if (bounds) {
      const inLat = lat >= bounds.latRange[0] && lat <= bounds.latRange[1];
      const inLon = lon >= bounds.lonRange[0] && lon <= bounds.lonRange[1];
      if (inLat && inLon) return true;
    }
  }
  return false;
}

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
  blood_donation_eligibility: { invoking: 'Checking donation eligibility...', invoked: 'Eligibility checked' },
  blood_type_compatibility: { invoking: 'Checking blood compatibility...', invoked: 'Compatibility ready' },
  baby_blood_type: { invoking: 'Predicting baby blood type...', invoked: 'Prediction ready' },
  find_next_eclipse: { invoking: 'Finding next eclipse...', invoked: 'Eclipse found' },
  list_upcoming_eclipses: { invoking: 'Listing upcoming eclipses...', invoked: 'Eclipses listed' },
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
    description: 'Calculate estimated IQ score based on correct answers to logic/pattern questions. Supports three test modes: quick (15 questions, ~5 min), standard (30 questions, ~12 min), comprehensive (50 questions, ~20 min).',
    inputSchema: {
      type: 'object',
      properties: {
        testMode: { type: 'string', enum: ['quick', 'standard', 'comprehensive'], description: 'Test difficulty/length: quick (15 questions), standard (30 questions), comprehensive (50 questions)' },
        correctAnswers: { type: 'integer', description: 'Number of correct answers', minimum: 0, maximum: 50 },
        answers: { type: 'array', items: { type: 'integer' }, description: 'Array of answer indices (0-3) for each question. If provided, calculates score with category breakdown.' },
        timeTakenSeconds: { type: 'integer', description: 'Time taken in seconds (optional)', minimum: 60 },
      },
      required: ['testMode'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        testMode: { type: 'string', description: 'Test mode used' },
        testInfo: { type: 'object', description: 'Test configuration (name, questionCount, estimatedMinutes)' },
        iqScore: { type: 'integer' },
        category: { type: 'string', enum: ['Very Superior', 'Superior', 'High Average', 'Average', 'Low Average', 'Below Average'] },
        percentile: { type: 'number', description: 'Percentile rank in population' },
        correctAnswers: { type: 'integer' },
        totalQuestions: { type: 'integer' },
        accuracy: { type: 'number', description: 'Percentage of correct answers' },
        categoryScores: { type: 'object', description: 'Breakdown by category (pattern, logic, math, spatial, verbal)' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('calculate_iq_score'),
  },
  {
    name: 'calculate_uniqueness',
    description: 'Calculate how unique/rare a person is based on their physical characteristics compared to world population. Supports baby mode (ageMonths) for infants under 24 months.',
    inputSchema: {
      type: 'object',
      properties: {
        age: { type: 'number', description: 'Age in years (use ageMonths for babies under 2 years)', minimum: 0, maximum: 120 },
        ageMonths: { type: 'number', description: 'Age in months for babies (0-24 months). If provided, overrides age.', minimum: 0, maximum: 24 },
        gender: { type: 'string', enum: ['male', 'female'] },
        heightCm: { type: 'number', description: 'Height in centimeters', minimum: 30, maximum: 250 },
        weightKg: { type: 'number', description: 'Weight in kilograms', minimum: 2, maximum: 300 },
        eyeColor: { type: 'string', enum: ['brown', 'blue', 'hazel', 'green', 'gray', 'amber'] },
        hairColor: { type: 'string', enum: ['black', 'brown', 'blonde', 'red', 'gray', 'auburn'] },
        skinTone: { type: 'string', enum: ['very_light', 'light', 'medium', 'olive', 'tan', 'deep'], description: 'Skin tone based on Fitzpatrick scale' },
        ethnicity: { type: 'string', enum: ['east_asian', 'south_asian', 'southeast_asian', 'european', 'african', 'middle_eastern', 'latin_american', 'oceanian', 'mixed'], description: 'Geographic ancestry' },
        bloodType: { type: 'string', enum: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] },
        handedness: { type: 'string', enum: ['right', 'left', 'ambidextrous'] },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        worldPopulation: { type: 'number', description: 'Total world population used as base' },
        matchingPeople: { type: 'number', description: 'Estimated number of people matching all traits' },
        rarity: { type: 'string', description: 'Rarity ratio e.g., "1 in 10,000"' },
        isBabyMode: { type: 'boolean', description: 'Whether baby population was used as base' },
        steps: { type: 'array', description: 'Funnel steps showing progressive filtering' },
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
  {
    name: 'blood_donation_eligibility',
    description: 'Check if a person is eligible to donate blood based on age, weight, and height. Returns donation amount and safety guidelines. Supports both metric and imperial units.',
    inputSchema: {
      type: 'object',
      properties: {
        age: { type: 'number', description: 'Age in years', minimum: 1, maximum: 120 },
        weight: { type: 'number', description: 'Weight in kg (metric) or lbs (imperial)', minimum: 20, maximum: 700 },
        height: { type: 'number', description: 'Height in cm (metric only). Required if unitSystem is metric.' },
        heightFeet: { type: 'number', description: 'Height feet component (imperial only). Required if unitSystem is imperial.' },
        heightInches: { type: 'number', description: 'Height inches component (imperial only). Optional, defaults to 0.' },
        gender: { type: 'string', enum: ['male', 'female'], description: 'Gender for blood volume calculation' },
        unitSystem: { type: 'string', enum: ['metric', 'imperial'], description: 'Unit system: metric (kg/cm) or imperial (lbs/ft). Defaults to metric.' },
      },
      required: ['age', 'weight', 'gender'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        eligible: { type: 'boolean', description: 'Whether the person can donate blood' },
        amount: { type: 'number', description: 'Recommended donation amount in ml (0 if not eligible)' },
        maxSafeAmount: { type: 'number', description: 'Maximum safe blood loss in ml based on blood volume (10.5% of total). Shown even when not eligible.' },
        bloodVolume: { type: 'number', description: 'Estimated total blood volume in liters' },
        warnings: { type: 'array', items: { type: 'string' }, description: 'Any warnings or restrictions' },
        tips: { type: 'array', items: { type: 'string' }, description: 'Tips for donation day' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('blood_donation_eligibility'),
  },
  {
    name: 'blood_type_compatibility',
    description: 'Check blood type compatibility for donation and receiving. Shows who you can donate to and receive from.',
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
        canDonateTo: { type: 'array', items: { type: 'string' }, description: 'Blood types you can donate to' },
        canReceiveFrom: { type: 'array', items: { type: 'string' }, description: 'Blood types you can receive from' },
        isUniversalDonor: { type: 'boolean', description: 'True if O-' },
        isUniversalRecipient: { type: 'boolean', description: 'True if AB+' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('blood_type_compatibility'),
  },
  {
    name: 'baby_blood_type',
    description: 'Predict possible blood types for a baby based on parents blood types. Also checks for Rh incompatibility risk.',
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
        possibleTypes: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, percentage: { type: 'number' } } }, description: 'Possible blood types with percentages' },
        rhIncompatibilityRisk: { type: 'boolean', description: 'True if Rh incompatibility risk exists' },
        rhWarning: { type: 'string', description: 'Warning message if Rh incompatibility detected' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('baby_blood_type'),
  },
  // Eclipse tools
  {
    name: 'find_next_eclipse',
    description: 'Find the next upcoming solar or lunar eclipse. Optionally filter by type (solar/lunar) and check visibility for a location.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['solar', 'lunar', 'any'], description: 'Type of eclipse to find. Default: any' },
        latitude: { type: 'number', description: 'Latitude for visibility check (-90 to 90)' },
        longitude: { type: 'number', description: 'Longitude for visibility check (-180 to 180)' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Eclipse date (ISO format)' },
        type: { type: 'string', description: 'solar or lunar' },
        subtype: { type: 'string', description: 'total, partial, annular, or penumbral' },
        peakTimeUTC: { type: 'string', description: 'Peak time in UTC' },
        duration: { type: 'string', description: 'Duration of totality/maximum' },
        magnitude: { type: 'number', description: 'Eclipse magnitude' },
        bestVisibleFrom: { type: 'string', description: 'Region with best visibility' },
        visibleRegions: { type: 'array', items: { type: 'string' }, description: 'All regions where visible' },
        daysUntil: { type: 'number', description: 'Days until the eclipse' },
        visibleFromLocation: { type: 'boolean', description: 'Whether visible from provided coordinates' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('find_next_eclipse'),
  },
  {
    name: 'list_upcoming_eclipses',
    description: 'List upcoming solar and lunar eclipses. Returns the next several eclipses with dates, types, and visibility info.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of eclipses to return (1-10). Default: 5' },
        type: { type: 'string', enum: ['solar', 'lunar', 'any'], description: 'Filter by eclipse type. Default: any' },
        latitude: { type: 'number', description: 'Latitude for visibility check (-90 to 90)' },
        longitude: { type: 'number', description: 'Longitude for visibility check (-180 to 180)' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        eclipses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              type: { type: 'string' },
              subtype: { type: 'string' },
              peakTimeUTC: { type: 'string' },
              bestVisibleFrom: { type: 'string' },
              daysUntil: { type: 'number' },
              visibleFromLocation: { type: 'boolean' },
            },
          },
        },
        totalCount: { type: 'number', description: 'Total number of eclipses returned' },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
    _meta: generateToolMeta('list_upcoming_eclipses'),
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
      const testMode = (args.testMode as TestMode) || 'quick';
      const modeConfig = TEST_MODE_CONFIG[testMode];
      const questions = getQuestionsForMode(testMode);
      const totalQuestions = questions.length;

      // If answers array provided, use the shared calculation
      const answersArray = args.answers as number[] | undefined;
      if (answersArray && answersArray.length > 0) {
        const result = calculateIQScore(answersArray, questions);
        const labelInfo = getIQLabel(result.iq);
        return {
          testMode,
          testInfo: { name: modeConfig.name, questionCount: modeConfig.questionCount, estimatedMinutes: modeConfig.estimatedMinutes },
          iqScore: result.iq,
          category: labelInfo.label,
          percentile: result.percentile,
          correctAnswers: result.correctCount,
          totalQuestions,
          accuracy: Math.round((result.correctCount / totalQuestions) * 100),
          categoryScores: result.categoryScores,
        };
      }

      // Fallback: use correctAnswers count
      const correct = (args.correctAnswers as number) || 0;
      const percentage = totalQuestions > 0 ? correct / totalQuestions : 0;
      const iq = Math.round(70 + percentage * 75);
      const labelInfo = getIQLabel(iq);

      // Calculate percentile
      const z = (iq - 100) / 15;
      const t = 1 / (1 + 0.2316419 * Math.abs(z));
      const d = 0.3989423 * Math.exp(-z * z / 2);
      const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
      const percentile = Math.round((z > 0 ? 1 - p : p) * 100);

      return {
        testMode,
        testInfo: { name: modeConfig.name, questionCount: modeConfig.questionCount, estimatedMinutes: modeConfig.estimatedMinutes },
        iqScore: iq,
        category: labelInfo.label,
        percentile,
        correctAnswers: correct,
        totalQuestions,
        accuracy: Math.round(percentage * 100),
      };
    }
    case 'calculate_uniqueness': {
      // Support both age (years) and ageMonths (for babies)
      const ageMonths = args.ageMonths as number | undefined;
      const ageYears = args.age as number | undefined;
      // If ageMonths provided, convert to years (decimal)
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

      // Use the shared calculateFunnel function
      const funnelSteps = calculateFunnel(
        age, gender, heightCm, weightKg,
        eyeColor, hairColor, skinTone, ethnicity, bloodType, handedness
      );

      // Get final population from last step
      const finalStep = funnelSteps[funnelSteps.length - 1];
      const matchingPeople = finalStep?.population ?? WORLD_POPULATION;
      const uniquenessRatio = WORLD_POPULATION / matchingPeople;

      // Format steps for output
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
    case 'blood_donation_eligibility': {
      const age = args.age as number;
      const gender = args.gender as 'male' | 'female';
      const unitSystem = (args.unitSystem as string) || 'metric';

      // Convert to metric if imperial
      let weightKg: number;
      let heightCm: number;

      if (unitSystem === 'imperial') {
        weightKg = (args.weight as number) * 0.453592; // lbs to kg
        const feet = (args.heightFeet as number) || 0;
        const inches = (args.heightInches as number) || 0;
        heightCm = (feet * 12 + inches) * 2.54; // feet/inches to cm
      } else {
        weightKg = args.weight as number;
        heightCm = args.height as number;
      }

      const warnings: string[] = [];
      const tips: string[] = [];
      let eligible = true;

      // Age check (minimum 17)
      if (age < 17) {
        eligible = false;
        warnings.push('Must be at least 17 years old to donate blood (16 with parental consent in some regions).');
      } else if (age > 65) {
        warnings.push('First-time donors should be under 66. Regular donors can continue until 70+.');
      }

      // Weight check (minimum 50 kg / 110 lbs)
      if (weightKg < 50) {
        eligible = false;
        warnings.push('Must weigh at least 50 kg (110 lbs) to donate blood safely.');
      }

      // Calculate blood volume using Nadler's formula
      const heightM = heightCm / 100;
      let bloodVolume: number;
      if (gender === 'male') {
        bloodVolume = 0.3669 * Math.pow(heightM, 3) + 0.03219 * weightKg + 0.6041;
      } else {
        bloodVolume = 0.3561 * Math.pow(heightM, 3) + 0.03308 * weightKg + 0.1833;
      }

      // Standard donation is 450-500ml, max 10.5% of blood volume
      const bloodVolumeML = bloodVolume * 1000;
      const maxSafeDonation = Math.min(500, bloodVolumeML * 0.105);
      const recommendedDonation = Math.round(Math.max(0, Math.min(maxSafeDonation, 470)));

      tips.push('Eat a healthy meal before donating');
      tips.push('Stay well hydrated - drink plenty of water');
      tips.push('Avoid alcohol 24 hours before donation');
      tips.push('Get a good night\'s sleep');

      return {
        eligible,
        amount: eligible ? recommendedDonation : 0,
        maxSafeAmount: Math.round(maxSafeDonation), // Max safe blood loss based on blood volume
        bloodVolume: Math.round(bloodVolume * 100) / 100,
        warnings,
        tips,
      };
    }
    case 'blood_type_compatibility': {
      const bloodType = args.bloodType as string;
      const rhFactor = args.rhFactor as string;
      const fullType = `${bloodType}${rhFactor}`;

      const donationCompatibility: Record<string, string[]> = {
        'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
        'O+': ['O+', 'A+', 'B+', 'AB+'],
        'A-': ['A-', 'A+', 'AB-', 'AB+'],
        'A+': ['A+', 'AB+'],
        'B-': ['B-', 'B+', 'AB-', 'AB+'],
        'B+': ['B+', 'AB+'],
        'AB-': ['AB-', 'AB+'],
        'AB+': ['AB+'],
      };

      const receiveCompatibility: Record<string, string[]> = {
        'O-': ['O-'],
        'O+': ['O-', 'O+'],
        'A-': ['O-', 'A-'],
        'A+': ['O-', 'O+', 'A-', 'A+'],
        'B-': ['O-', 'B-'],
        'B+': ['O-', 'O+', 'B-', 'B+'],
        'AB-': ['O-', 'A-', 'B-', 'AB-'],
        'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
      };

      return {
        fullBloodType: fullType,
        canDonateTo: donationCompatibility[fullType] || [],
        canReceiveFrom: receiveCompatibility[fullType] || [],
        isUniversalDonor: fullType === 'O-',
        isUniversalRecipient: fullType === 'AB+',
      };
    }
    case 'baby_blood_type': {
      const fatherBloodType = args.fatherBloodType as string;
      const fatherRh = args.fatherRh as string;
      const motherBloodType = args.motherBloodType as string;
      const motherRh = args.motherRh as string;

      // Blood type alleles
      const bloodTypeAlleles: Record<string, string[]> = {
        'A': ['AA', 'AO'], 'B': ['BB', 'BO'], 'AB': ['AB'], 'O': ['OO'],
      };
      const rhAlleles: Record<string, string[]> = {
        '+': ['++', '+-'], '-': ['--'],
      };

      // Calculate possible ABO types
      const fatherAlleles = bloodTypeAlleles[fatherBloodType];
      const motherAlleles = bloodTypeAlleles[motherBloodType];
      const possibleGenotypes: Record<string, number> = {};
      let totalCombinations = 0;

      for (const fAllele of fatherAlleles) {
        for (const mAllele of motherAlleles) {
          for (const f of fAllele.split('')) {
            for (const m of mAllele.split('')) {
              const combo = [f, m].sort().join('');
              possibleGenotypes[combo] = (possibleGenotypes[combo] || 0) + 1;
              totalCombinations++;
            }
          }
        }
      }

      // Convert genotypes to phenotypes
      const phenotypes: Record<string, number> = {};
      for (const [genotype, count] of Object.entries(possibleGenotypes)) {
        let phenotype: string;
        if (genotype === 'AA' || genotype === 'AO') phenotype = 'A';
        else if (genotype === 'BB' || genotype === 'BO') phenotype = 'B';
        else if (genotype === 'AB') phenotype = 'AB';
        else phenotype = 'O';
        phenotypes[phenotype] = (phenotypes[phenotype] || 0) + count;
      }

      // Calculate Rh possibilities
      const fatherRhAlleles = rhAlleles[fatherRh];
      const motherRhAlleles = rhAlleles[motherRh];
      let rhPositiveChance = 0;
      let rhNegativeChance = 0;
      let rhCombinations = 0;

      for (const fRh of fatherRhAlleles) {
        for (const mRh of motherRhAlleles) {
          for (const f of fRh.split('')) {
            for (const m of mRh.split('')) {
              rhCombinations++;
              if (f === '+' || m === '+') rhPositiveChance++;
              else rhNegativeChance++;
            }
          }
        }
      }

      // Combine ABO and Rh
      const possibleTypes: { type: string; percentage: number }[] = [];
      for (const [type, count] of Object.entries(phenotypes)) {
        const aboPercentage = (count / totalCombinations) * 100;
        if (rhPositiveChance > 0) {
          possibleTypes.push({
            type: `${type}+`,
            percentage: Math.round(aboPercentage * (rhPositiveChance / rhCombinations)),
          });
        }
        if (rhNegativeChance > 0) {
          possibleTypes.push({
            type: `${type}-`,
            percentage: Math.round(aboPercentage * (rhNegativeChance / rhCombinations)),
          });
        }
      }

      // Sort by percentage descending
      possibleTypes.sort((a, b) => b.percentage - a.percentage);

      // Check for Rh incompatibility risk
      const rhIncompatibilityRisk = motherRh === '-' && fatherRh === '+';
      const rhWarning = rhIncompatibilityRisk
        ? 'Rh incompatibility detected! If the mother is Rh-negative and the father is Rh-positive, the baby may be Rh-positive. Consult with a doctor about RhoGAM injection.'
        : null;

      return {
        possibleTypes: possibleTypes.filter(t => t.percentage > 0),
        rhIncompatibilityRisk,
        rhWarning,
      };
    }
    case 'find_next_eclipse': {
      const filterType = (args.type as string) || 'any';
      const lat = args.latitude as number | undefined;
      const lon = args.longitude as number | undefined;

      const now = new Date();
      const upcoming = ECLIPSE_DATA
        .filter(e => new Date(e.date) > now)
        .filter(e => filterType === 'any' || e.type === filterType);

      if (upcoming.length === 0) {
        return { error: 'No upcoming eclipses found' };
      }

      const eclipse = upcoming[0];
      const eclipseDate = new Date(eclipse.date);
      const daysUntil = Math.ceil((eclipseDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      return {
        date: eclipse.date,
        type: eclipse.type,
        subtype: eclipse.subtype,
        peakTimeUTC: eclipse.peakTime,
        duration: eclipse.duration || null,
        magnitude: eclipse.magnitude,
        bestVisibleFrom: getBestVisibleLocation(eclipse),
        visibleRegions: eclipse.visibility,
        daysUntil,
        visibleFromLocation: lat !== undefined && lon !== undefined ? isVisibleFromLocation(eclipse, lat, lon) : null,
      };
    }
    case 'list_upcoming_eclipses': {
      const count = Math.min(Math.max((args.count as number) || 5, 1), 10);
      const filterType = (args.type as string) || 'any';
      const lat = args.latitude as number | undefined;
      const lon = args.longitude as number | undefined;

      const now = new Date();
      const upcoming = ECLIPSE_DATA
        .filter(e => new Date(e.date) > now)
        .filter(e => filterType === 'any' || e.type === filterType)
        .slice(0, count);

      const eclipses = upcoming.map(eclipse => {
        const eclipseDate = new Date(eclipse.date);
        const daysUntil = Math.ceil((eclipseDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          date: eclipse.date,
          type: eclipse.type,
          subtype: eclipse.subtype,
          peakTimeUTC: eclipse.peakTime,
          duration: eclipse.duration || null,
          magnitude: eclipse.magnitude,
          bestVisibleFrom: getBestVisibleLocation(eclipse),
          visibleRegions: eclipse.visibility,
          daysUntil,
          visibleFromLocation: lat !== undefined && lon !== undefined ? isVisibleFromLocation(eclipse, lat, lon) : null,
        };
      });

      return {
        eclipses,
        totalCount: eclipses.length,
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
    'blood_donation_eligibility': 'blood_donation',
    'blood_type_compatibility': 'blood_compatibility',
    'baby_blood_type': 'baby_blood',
    'find_next_eclipse': 'next_eclipse',
    'list_upcoming_eclipses': 'eclipse_list',
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
    case 'blood_donation': {
      const bloodData = data as { eligible?: boolean; amount?: number; maxSafeAmount?: number; bloodVolume?: number; warnings?: string[] };
      const eligibleColor = bloodData.eligible ? '#22c55e' : '#ef4444';
      const eligibleIcon = bloodData.eligible ? '✅' : '❌';
      const eligibleText = bloodData.eligible ? 'Eligible to Donate' : 'Not Eligible';
      const warnings = bloodData.warnings || [];
      content = `
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
      break;
    }
    case 'blood_compatibility': {
      const compatData = data as { fullBloodType?: string; canDonateTo?: string[]; canReceiveFrom?: string[]; isUniversalDonor?: boolean; isUniversalRecipient?: boolean };
      const isSpecial = compatData.isUniversalDonor || compatData.isUniversalRecipient;
      const specialLabel = compatData.isUniversalDonor ? '🌟 Universal Donor' : compatData.isUniversalRecipient ? '🌟 Universal Recipient' : '';
      const donateTo = compatData.canDonateTo || [];
      const receiveFrom = compatData.canReceiveFrom || [];
      content = `
        <div class="header">🩸 Blood Compatibility</div>
        <div class="big-number" style="color:#ef4444;font-size:2.5rem">${compatData.fullBloodType || ''}</div>
        ${isSpecial ? `<div class="label" style="background:rgba(251,191,36,0.2);color:#fbbf24">${specialLabel}</div>` : ''}
        <div class="stats">
          <div class="stat-box" style="background:rgba(34,197,94,0.1)"><div class="stat-label" style="color:#22c55e">Can Donate To</div><div class="stat-value" style="font-size:0.8rem">${donateTo.join(', ') || 'None'}</div></div>
          <div class="stat-box" style="background:rgba(59,130,246,0.1)"><div class="stat-label" style="color:#3b82f6">Can Receive From</div><div class="stat-value" style="font-size:0.8rem">${receiveFrom.join(', ') || 'None'}</div></div>
        </div>`;
      break;
    }
    case 'baby_blood': {
      const babyData = data as { possibleTypes?: { type: string; percentage: number }[]; rhIncompatibilityRisk?: boolean };
      const topTypes = (babyData.possibleTypes || []).slice(0, 4);
      const hasRisk = babyData.rhIncompatibilityRisk;
      content = `
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
      break;
    }
    case 'next_eclipse': {
      const eclipseData = data as { date?: string; type?: string; subtype?: string; peakTimeUTC?: string; daysUntil?: number; bestVisibleFrom?: string; visibleFromLocation?: boolean | null };
      const icon = eclipseData.type === 'solar' ? (eclipseData.subtype === 'total' ? '🌑' : eclipseData.subtype === 'annular' ? '🔆' : '🌘') : (eclipseData.subtype === 'total' ? '🌕' : '🌗');
      const visibleBadge = eclipseData.visibleFromLocation === true ? '<span style="color:#22c55e">✓ Visible from your location</span>' : eclipseData.visibleFromLocation === false ? '<span style="color:#ef4444">✗ Not visible from your location</span>' : '';
      content = `
        <div class="header">${icon} Next ${eclipseData.subtype || ''} ${eclipseData.type || ''} Eclipse</div>
        <div class="value" style="font-size:1.2rem">${eclipseData.date || 'Unknown'}</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Days Until</div><div class="stat-value" style="color:#a78bfa">${eclipseData.daysUntil || '?'}</div></div>
          <div class="stat-box"><div class="stat-label">Peak Time</div><div class="stat-value">${eclipseData.peakTimeUTC || '?'} UTC</div></div>
        </div>
        <div class="label" style="margin-top:0.5rem">🌍 Best visible from: ${eclipseData.bestVisibleFrom || 'Unknown'}</div>
        ${visibleBadge ? `<div class="label" style="margin-top:0.25rem">${visibleBadge}</div>` : ''}`;
      break;
    }
    case 'eclipse_list': {
      const listData = data as { eclipses?: Array<{ date: string; type: string; subtype: string; daysUntil: number; bestVisibleFrom: string }>; totalCount?: number };
      const eclipses = (listData.eclipses || []).slice(0, 5);
      content = `
        <div class="header">🌓 Upcoming Eclipses</div>
        <div class="label">${listData.totalCount || 0} eclipses found</div>
        <div style="margin-top:0.5rem">
          ${eclipses.map(e => {
            const icon = e.type === 'solar' ? '☀️' : '🌙';
            return `<div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.1)">
              <span>${icon} ${e.subtype} ${e.type}</span>
              <span style="color:rgba(255,255,255,0.6)">${e.date} (${e.daysUntil}d)</span>
            </div>`;
          }).join('')}
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
    case 'blood_donation_eligibility':
      if (r.eligible) {
        return `🩸 Eligible to donate! Recommended: ${r.amount}ml (Blood volume: ${r.bloodVolume}L)`;
      } else {
        const warnings = (r.warnings as string[]) || [];
        return `🩸 Not eligible to donate. Blood volume: ${r.bloodVolume}L, Max safe loss: ${r.maxSafeAmount}ml. ${warnings.length ? warnings[0] : ''}`;
      }
    case 'find_next_eclipse': {
      const icon = r.type === 'solar' ? '☀️' : '🌙';
      return `${icon} Next ${r.subtype} ${r.type} eclipse: ${r.date} at ${r.peakTimeUTC} UTC (${r.daysUntil} days away). Best visible from: ${r.bestVisibleFrom}`;
    }
    case 'list_upcoming_eclipses': {
      const eclipses = (r.eclipses as Array<{ date: string; type: string; subtype: string; daysUntil: number }>) || [];
      const summary = eclipses.slice(0, 3).map(e => `${e.type === 'solar' ? '☀️' : '🌙'} ${e.subtype} ${e.type} on ${e.date}`).join(', ');
      return `🌓 Found ${r.totalCount} upcoming eclipses: ${summary}${eclipses.length > 3 ? '...' : ''}`;
    }
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
    find_next_eclipse: { date: '2025-03-14', type: 'lunar', subtype: 'total', peakTimeUTC: '06:58', daysUntil: 70, bestVisibleFrom: 'Americas', visibleRegions: ['Americas', 'Europe', 'Africa'] },
    list_upcoming_eclipses: { eclipses: [{ date: '2025-03-14', type: 'lunar', subtype: 'total', daysUntil: 70, bestVisibleFrom: 'Americas' }, { date: '2025-03-29', type: 'solar', subtype: 'partial', daysUntil: 85, bestVisibleFrom: 'Europe' }], totalCount: 2 },
  };
  return defaults[toolName] || { message: 'Widget ready' };
}

// Handle MCP requests
function handleMCPRequest(mcpRequest: MCPRequest): MCPResponse {
  const { id, method, params } = mcpRequest;

  try {
    switch (method) {
      case 'initialize':
        // Track MCP connection initialization
        trackMCPEvent('mcp_initialize', {
          event_category: 'mcp',
          event_label: 'connection',
          protocol_version: '2024-11-05',
        });
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
        // Track tools/list event
        trackMCPEvent('mcp_tools_list', {
          tool_count: TOOLS.length,
          event_category: 'mcp',
          event_label: 'tools_list',
        });
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
      case 'tools/call': {
        const toolName = (params as { name: string }).name;
        const toolArgs = (params as { arguments?: Record<string, unknown> }).arguments || {};
        const result = executeTool(toolName, toolArgs);

        // Track tool call event
        trackMCPEvent('mcp_tool_call', {
          tool_name: toolName,
          event_category: 'mcp',
          event_label: toolName,
          has_args: Object.keys(toolArgs).length > 0,
        });

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

    // Check for internal forwarded request (from path-based auth)
    const internalUserId = request.headers.get('X-User-Id');
    const internalPlan = request.headers.get('X-User-Plan');
    const internalAuthMethod = request.headers.get('X-Auth-Method') as AuthMethod | null;

    if (internalUserId) {
      // Request forwarded from /api/mcp/[key] route - already authenticated
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                       request.headers.get('x-real-ip') ||
                       'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      // Log connection asynchronously (don't await)
      logConnection(internalUserId, internalAuthMethod || 'path', clientIp, userAgent);

      const response = handleMCPRequest(body as MCPRequest);
      return NextResponse.json(response);
    }

    // Check for header-based auth (x-api-key or Bearer token)
    const { apiKey, authMethod } = extractAuth(request);

    if (apiKey) {
      const authResult = await validateApiKey(apiKey);

      if (!authResult.authenticated) {
        return NextResponse.json({
          jsonrpc: '2.0',
          id: (body as MCPRequest).id || null,
          error: {
            code: -32001,
            message: authResult.error || 'Authentication failed',
          }
        }, { status: 401 });
      }

      if (!authResult.isSubscribed) {
        return NextResponse.json({
          jsonrpc: '2.0',
          id: (body as MCPRequest).id || null,
          error: {
            code: -32003,
            message: 'MCP access requires Pro plan. Upgrade at tulzo.vercel.app/pricing',
          }
        }, { status: 403 });
      }

      // Log connection
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                       request.headers.get('x-real-ip') ||
                       'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      logConnection(authResult.userId!, authMethod, clientIp, userAgent);

      const response = handleMCPRequest(body as MCPRequest);
      return NextResponse.json(response);
    }

    // No auth provided - return error for tools/call, allow discovery methods
    const method = (body as MCPRequest).method;
    if (method === 'tools/call') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id: (body as MCPRequest).id || null,
        error: {
          code: -32001,
          message: 'Authentication required. Use x-api-key header or Bearer token.',
        }
      }, { status: 401 });
    }

    // Allow unauthenticated access to discovery methods
    const response = handleMCPRequest(body as MCPRequest);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.origin;

  return NextResponse.json({
    name: 'Tulzo MCP Server',
    version: '1.0.0',
    description: 'Model Context Protocol server for Tulzo tools',
    authentication: {
      oauth: {
        supported: true,
        discovery: `${baseUrl}/.well-known/openid-configuration`,
      },
      header: {
        supported: true,
        header_name: 'x-api-key',
        alternative: 'Authorization: Bearer {api_key}',
      },
      path: {
        supported: true,
        endpoint: `${baseUrl}/api/mcp/{api_key}`,
      },
    },
    tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
  });
}


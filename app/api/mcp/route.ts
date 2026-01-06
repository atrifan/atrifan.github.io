import { NextRequest, NextResponse } from 'next/server';
import { clerkClient, verifyToken } from '@clerk/nextjs/server';
import { WeightCalculator } from '@/src/utils/WeightCalculator';
import { BudgetCalculator } from '@/src/utils/BudgetCalculator';
import { DateCalculator } from '@/src/utils/DateCalculator';
import { calculateTip, TipCalculatorInput, CalculatorMode, ServiceQuality, MoodLevel, BudgetSituation } from '@/src/utils/TipCalculator';
import {
  calculateDonationEligibility, calculateBloodCompatibility, calculateBabyBloodType,
  DonationEligibilityInput, BloodCompatibilityInput, BabyBloodTypeInput,
  Gender, UnitSystem, BloodTypeABO, RhFactor
} from '@/src/utils/BloodCalculator';
import { calculateFlip, FlipCalculatorInput, FlipMode } from '@/src/utils/FlipCalculator';
import { calculateZone, ZoneCalculatorInput } from '@/src/utils/ZoneCalculator';
import { calculateSpin, SpinCalculatorInput, WHEEL_COLORS } from '@/src/utils/SpinCalculator';
import { makeDecision, DecisionCalculatorInput, DecisionMode } from '@/src/utils/DecisionCalculator';
import { calculateCountdown as calculateCountdownShared, CountdownCalculatorInput } from '@/src/utils/CountdownCalculator';
import { calculateCycle as calculateCycleShared, CycleCalculatorInput } from '@/src/utils/CycleCalculator';
import { convertUnits as convertUnitsShared, ConvertInput } from '@/src/utils/UnitConverter';
import { calculateAge as calculateAgeShared, AgeCalculatorInput } from '@/src/utils/AgeCalculator';
import { calculatePercent as calculatePercentShared, PercentCalculatorInput, PercentOperation } from '@/src/utils/PercentCalculator';
import { generateLuckyNumber, LuckyNumberInput } from '@/src/utils/LuckyNumberCalculator';
import { calculatePositionSize, PositionSizeInput, CalculationMode, TradeDirection } from '@/src/utils/PositionSizeCalculator';
import { generateNames, NamesGeneratorInput, GeneratorMode, NameCategory, HumanNameType, PetType, Gender as NameGender } from '@/src/utils/NamesGenerator';
import { getSignFromDate, getCompatibility, getSignInfo, ZODIAC_SIGNS, ZodiacSign } from '@/src/data/zodiac';
import { decryptApiKey, isApiKeyExpired, useClerkApiKeys } from '@/src/utils/apiKeyEncryption';
import {
  calculateFunnel, WORLD_POPULATION,
  EyeColor, HairColor, SkinTone, Ethnicity, BloodType, Handedness
} from '@/src/data/percentiles';
import {
  TestMode, TEST_MODE_CONFIG, getQuestionsForMode, calculateIQScore, getIQLabel
} from '@/src/data/iqQuestions';
import { isHigherOrEqualTo } from '@/src/config/billing.config';

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

// Simple in-memory cache for OAuth token validation
// Cache entries expire after 5 minutes
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
const authCache = new Map<string, { result: AuthResult; expiresAt: number }>();

function getCachedAuth(token: string): AuthResult | null {
  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }
  if (cached) {
    authCache.delete(token); // Clean up expired entry
  }
  return null;
}

function setCachedAuth(token: string, result: AuthResult): void {
  // Limit cache size to prevent memory issues
  if (authCache.size > 1000) {
    // Clear oldest entries (first 100)
    const keys = Array.from(authCache.keys()).slice(0, 100);
    keys.forEach(k => authCache.delete(k));
  }
  authCache.set(token, { result, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

/**
 * Check if user has Pro or higher subscription
 * Checks user metadata which is updated by billing webhooks
 */
async function checkProSubscription(client: Awaited<ReturnType<typeof clerkClient>>, userId: string): Promise<{ isPro: boolean; plan: string }> {
  try {
    const user = await client.users.getUser(userId);

    // Check publicMetadata first (set by billing webhooks)
    if (user.publicMetadata?.plan) {
      const plan = user.publicMetadata.plan as string;
      return { isPro: isHigherOrEqualTo(plan, 'pro'), plan };
    }

    // Check for active subscription
    if (user.publicMetadata?.subscription === 'active') {
      return { isPro: true, plan: 'pro' };
    }

    // Check unsafeMetadata as fallback
    if (user.unsafeMetadata?.plan) {
      const plan = user.unsafeMetadata.plan as string;
      return { isPro: isHigherOrEqualTo(plan, 'pro'), plan };
    }

    return { isPro: false, plan: 'free' };
  } catch (error) {
    console.error('Error checking subscription:', error);
    return { isPro: false, plan: 'free' };
  }
}

/**
 * Validate API key - supports both custom encryption and Clerk API Keys
 *
 * For API keys: If the key validates, assume Pro plan.
 * Only Pro+ users can generate API keys, so a valid key = Pro access.
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

      // API key validation success = at least Pro plan
      // Only Pro+ users can generate API keys, so valid key implies Pro access
      return {
        authenticated: true,
        userId,
        plan: 'pro',
        isSubscribed: true,
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
    // Custom encrypted keys also imply Pro access (only Pro+ can generate)
    return {
      authenticated: true,
      userId: payload.userId,
      plan: 'pro',
      isSubscribed: true,
      authMethod: 'header',
    };
  } catch (error) {
    console.error('Error validating API key:', error);
    return { authenticated: false, authMethod: 'none', error: 'Validation failed' };
  }
}

/**
 * Get Clerk frontend API URL from publishable key
 */
function getClerkFrontendApi(): string {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  if (publishableKey) {
    try {
      const base64Part = publishableKey.replace(/^pk_(test|live)_/, '');
      let decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
      // Remove trailing $ that Clerk adds to the encoded domain
      decoded = decoded.replace(/\$+$/, '');
      if (decoded && decoded.includes('.clerk.')) {
        return `https://${decoded}`;
      }
    } catch {
      // Use default
    }
  }
  return 'https://gentle-aardvark-60.clerk.accounts.dev';
}

/**
 * Validate OAuth bearer token
 *
 * For bearer tokens: First try as Clerk session JWT, then as OAuth access token.
 * - Clerk session JWTs can be verified directly with verifyToken
 * - OAuth access tokens (opaque) need to be validated via userinfo endpoint
 *
 * Results are cached for 5 minutes to avoid repeated API calls.
 */
async function validateBearerToken(token: string): Promise<AuthResult> {
  // Check cache first
  const cached = getCachedAuth(token);
  if (cached) {
    return cached;
  }

  let result: AuthResult;

  // First, try to verify as a Clerk session JWT
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (payload && payload.sub) {
      const userId = payload.sub;

      // Check plan from session claims first (if available from Clerk Billing)
      const sessionPlan = (payload as Record<string, unknown>).plan as string | undefined;
      const sessionFeatures = (payload as Record<string, unknown>).features as string[] | undefined;

      const hasProFromSession = sessionPlan === 'pro' || sessionPlan === 'plus' ||
        sessionFeatures?.includes('pro_access') || sessionFeatures?.includes('plus_access');

      if (hasProFromSession) {
        result = {
          authenticated: true,
          userId,
          plan: sessionPlan || 'pro',
          isSubscribed: true,
          authMethod: 'oauth',
        };
        setCachedAuth(token, result);
        return result;
      }

      // Fallback: Check user subscription using Clerk's authorization
      const client = await clerkClient();
      const subscription = await checkProSubscription(client, userId);

      result = {
        authenticated: true,
        userId,
        plan: 'pro',
        isSubscribed: true,
        authMethod: 'oauth',
      };
      setCachedAuth(token, result);
      return result;
    }
  } catch (jwtError) {
    // Not a valid JWT, try as OAuth access token
    console.log('Token is not a JWT, trying as OAuth access token...');
  }

  // Try to validate as an OAuth access token via userinfo endpoint
  try {
    const clerkApi = getClerkFrontendApi();
    const userinfoResponse = await fetch(`${clerkApi}/oauth/userinfo`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!userinfoResponse.ok) {
      result = { authenticated: false, authMethod: 'none', error: 'Invalid OAuth access token' };
      // Don't cache failed auth - token might be temporarily invalid
      return result;
    }

    const userinfo = await userinfoResponse.json();

    if (!userinfo.sub) {
      result = { authenticated: false, authMethod: 'none', error: 'Invalid userinfo response' };
      return result;
    }

    const userId = userinfo.sub;
    const client = await clerkClient();

    // Check user's subscription status using Clerk's authorization
    const subscription = await checkProSubscription(client, userId);

    result = {
      authenticated: true,
      userId,
      plan: 'pro',
      isSubscribed: true,
      authMethod: 'oauth',
    };
    setCachedAuth(token, result);
    return result;
  } catch (error) {
    console.error('Error validating OAuth access token:', error);
    return { authenticated: false, authMethod: 'none', error: 'Invalid or expired bearer token' };
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

// Import shared tool definitions with invocation messages
import { TOOL_DEFINITIONS, TOTAL_TOOL_COUNT, getInvocationMessages } from '@/src/config/tools-definitions';

// Helper to generate _meta for a tool
function generateToolMeta(toolName: string) {
  const messages = getInvocationMessages(toolName);
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

// Transform shared definitions into MCP tools with annotations and _meta
const TOOLS = TOOL_DEFINITIONS.map(tool => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  outputSchema: tool.outputSchema,
  annotations: READ_ONLY_ANNOTATIONS,
  _meta: generateToolMeta(tool.name),
}));

// Pre-compute resources list for resources/list (avoid recomputing on each request)
const RESOURCES_LIST = TOOLS.map(tool => {
  const title = tool.name.split('_').filter(w => w.length > 0).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  const messages = getInvocationMessages(tool.name);
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

// TOTAL_TOOL_COUNT is available from '@/src/config/tools-definitions'
// Do not re-export from route files as Next.js only allows route handlers

// Legacy TOOLS array removed - now using shared TOOL_DEFINITIONS
// The following comment marks where the old array was for reference:
// Old TOOLS array with 42 tools was here (lines 413-1349)

// Continue with tool execution handlers below...
// Note: The executeTool function and other handlers remain unchanged
// They reference tool names which are still the same

// --- End of TOOLS transformation ---

// Tool execution handlers
function executeTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case 'calculate_ideal_weight': {
      const idealWeight = WeightCalculator.calculateIdealWeight(
        args.height as number,
        args.sex as 'male' | 'female' | 'other'
      );
      return { idealWeight: Math.round(idealWeight * 10) / 10, unit: 'kg' };
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
      // Determine savings mode (default to 'goal' for backward compatibility)
      const savingsMode = (args.savingsMode as 'goal' | 'duration') || 'goal';

      // Build interest config if enabled
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

      // Helper to round to 2 decimals
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
    }

    case 'calculate_tip': {
      // Use shared TipCalculator - single source of truth for tip calculation logic
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
      // Return with legacy field names for widget compatibility
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
    }
    case 'calculate_percentage': {
      // Use shared PercentCalculator - single source of truth for percentage calculations
      const input: PercentCalculatorInput = {
        operation: args.operation as PercentOperation,
        value1: args.value1 as number,
        value2: args.value2 as number,
      };
      return calculatePercentShared(input);
    }
    case 'calculate_age': {
      // Use shared AgeCalculator - single source of truth for age calculations
      const input: AgeCalculatorInput = {
        birthDate: args.birthDate as string,
      };
      return calculateAgeShared(input);
    }
    case 'convert_units': {
      // Use shared UnitConverter - single source of truth for unit conversions
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
    }
    case 'calculate_cycle': {
      // Use shared CycleCalculator - single source of truth for cycle logic
      // Support legacy lastPeriodDate input
      const dateInput = (args.date as string) || (args.lastPeriodDate as string);
      if (!dateInput) {
        throw new Error('Either date or lastPeriodDate is required');
      }
      const input: CycleCalculatorInput = {
        date: dateInput,
        isFirstDay: args.isFirstDay !== false, // default true
        simplified: args.simplified === true,
        cycleLength: args.cycleLength as number | undefined,
        periodLength: args.periodLength as number | undefined,
      };
      return calculateCycleShared(input);
    }
    case 'calculate_countdown': {
      // Use shared CountdownCalculator - single source of truth for countdown logic
      const input: CountdownCalculatorInput = {
        eventDate: args.eventDate as string,
        eventName: args.eventName as string | undefined,
      };
      return calculateCountdownShared(input);
    }
    case 'make_decision': {
      // Use shared DecisionCalculator - single source of truth for decision logic
      const input: DecisionCalculatorInput = {
        mode: (args.mode as DecisionMode) || 'pickOne',
        options: args.options as string[] | undefined,
        weights: args.weights as number[] | undefined,
      };
      return makeDecision(input);
    }
    case 'zodiac_compatibility': {
      // Get sign from date (YYYY-MM-DD)
      const signFromDate = (date: string): ZodiacSign => {
        const [, m, d] = date.split('-').map(Number);
        return getSignFromDate(m, d);
      };

      // Determine sign1: prefer sign1, fallback to date1
      let zodiacSign1: ZodiacSign;
      if (args.sign1) {
        zodiacSign1 = (args.sign1 as string).toLowerCase() as ZodiacSign;
      } else if (args.date1) {
        zodiacSign1 = signFromDate(args.date1 as string);
      } else {
        throw new Error('Either sign1 or date1 is required');
      }

      // Determine sign2: prefer sign2, fallback to date2
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
    }
    case 'generate_names': {
      // Use shared NamesGenerator - single source of truth for name/number generation
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
    }
    case 'calculate_position_size': {
      // Use shared PositionSizeCalculator - single source of truth for position sizing
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
    }
    case 'spin_wheel': {
      // Use shared SpinCalculator - single source of truth for spin wheel logic
      const input: SpinCalculatorInput = {
        options: args.options as string[],
      };
      return calculateSpin(input);
    }
    case 'zone_calculator': {
      // Use shared ZoneCalculator - single source of truth for timezone conversion
      const input: ZoneCalculatorInput = {
        time: args.time as string,
        fromTimezone: args.fromTimezone as string,
        toTimezones: args.toTimezones as string[],
      };
      return calculateZone(input);
    }

    case 'lucky_number': {
      // Use shared LuckyNumberCalculator - single source of truth for lucky number generation
      const input: LuckyNumberInput = {
        min: args.min as number | undefined,
        max: args.max as number | undefined,
        count: args.count as number | undefined,
      };
      return generateLuckyNumber(input);
    }
    case 'flip_tool': {
      // Use shared FlipCalculator - single source of truth for flip/roll logic
      const input: FlipCalculatorInput = {
        flipMode: args.flipMode as FlipMode | undefined,
        count: args.count as number | undefined,
        sides: args.sides as number | undefined,
      };
      return calculateFlip(input);
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
      // Use shared DateCalculator - single source of truth
      const dateStr = args.date as string;
      if (!dateStr) {
        throw new Error('Missing required field: date (YYYY-MM-DD format)');
      }
      return DateCalculator.calculate(dateStr);
    }
    case 'blood_calculator': {
      // Unified blood calculator with mode-based validation
      const mode = args.calculatorMode as 'donation' | 'compatibility' | 'baby';

      if (!mode) {
        throw new Error('Missing required field: calculatorMode. Must be one of: donation, compatibility, baby');
      }

      if (mode === 'donation') {
        // Validate donation mode required fields
        const missing: string[] = [];
        if (args.age === undefined) missing.push('age');
        if (args.weight === undefined) missing.push('weight');
        if (args.gender === undefined) missing.push('gender');
        // Height is required for metric, or heightFeet/heightInches for imperial
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
        // Validate compatibility mode required fields
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
        // Validate baby mode required fields
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
    'calculate_ideal_weight': 'ideal_weight',
    'generate_weight_loss_plan': 'weight_loss_plan',
    'calculate_savings_plan': 'savings_plan',
    'calculate_tip': 'tip',
    'calculate_percentage': 'percentage',
    'calculate_age': 'age',
    'convert_units': 'convert_units',
    'calculate_cycle': 'cycle',
    'calculate_countdown': 'countdown',
    'make_decision': 'decision',
    'zodiac_compatibility': 'zodiac',
    'generate_names': 'names',
    'calculate_position_size': 'position_size',
    'spin_wheel': 'spin_wheel',
    'zone_calculator': 'zone',
    'lucky_number': 'lucky_number',
    'flip_tool': 'flip',
    'calculate_iq_score': 'iq_score',
    'calculate_uniqueness': 'uniqueness',
    'when_date_info': 'when_date',
    'blood_calculator': 'blood',
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
    case 'flip': {
      // Unified flip widget - renders based on flipMode
      if (data.flipMode === 'dice') {
        const rolls = data.rolls as number[];
        const diceEmoji = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        content = `
          <div class="header">🎲 Dice Roll</div>
          <div style="text-align:center;font-size:3rem;margin:1rem 0">${rolls.map(r => (data.sides === 6 && r <= 6) ? diceEmoji[r] : r).join(' ')}</div>
          <div class="big-number" style="color:#a78bfa">${data.total}</div>
          <div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">Total from ${rolls.length} ${data.sides}-sided dice</div>`;
      } else {
        const result = data.result as string;
        const count = data.count as number;
        const headsCount = data.headsCount as number;
        const tailsCount = data.tailsCount as number;
        const isHeads = result === 'heads';
        const coinColor = isHeads ? '#fbbf24' : '#9ca3af';
        const coinBg = isHeads ? 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #d97706 100%)' : 'linear-gradient(135deg, #f3f4f6 0%, #9ca3af 50%, #6b7280 100%)';
        content = `
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
      }
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
      const countdownIsPast = data.isPast as boolean;
      const countdownIsToday = data.isToday as boolean;
      const countdownAbsDays = data.absoluteDays ?? Math.abs(data.days as number);
      content = `
        <div class="header">⏳ Countdown</div>
        <div style="text-align:center;color:#fff;font-size:1.1rem;margin-bottom:0.5rem">${data.eventName}</div>
        ${countdownIsToday ? `<div class="big-number" style="color:#10b981">🎉</div><div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Today!</div>` : `
          <div class="big-number" style="color:${countdownIsPast ? '#94a3b8' : '#06b6d4'}">${countdownAbsDays}</div>
          <div class="label" style="background:rgba(6,182,212,0.2);color:#06b6d4">days ${countdownIsPast ? 'ago' : 'to go'}</div>
          <div class="stats">
            <div class="stat-box"><div class="stat-label">Weeks</div><div class="stat-value">${data.weeks}</div></div>
            <div class="stat-box"><div class="stat-label">Months</div><div class="stat-value">${data.months}</div></div>
          </div>`}`;
      break;
    }
    case 'decision': {
      const decisionIcon = data.icon || '🎱';
      const decisionMode = data.mode as string;
      const modeLabel = decisionMode === 'yesNo' ? 'Yes/No Oracle' : decisionMode === 'weighted' ? 'Weighted Choice' : 'Random Pick';
      content = `
        <div class="header">🎱 Decision Maker</div>
        <div style="text-align:center;font-size:4rem;margin:1rem 0">${decisionIcon}</div>
        <div class="big-number" style="color:#a78bfa;font-size:1.8rem">${data.decision}</div>
        <div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">${modeLabel}</div>
        ${data.totalOptions ? `<div class="stats"><div class="stat-box"><div class="stat-label">Options</div><div class="stat-value">${data.totalOptions}</div></div><div class="stat-box"><div class="stat-label">Confidence</div><div class="stat-value">${data.confidence}%</div></div></div>` : ''}`;
      break;
    }
    case 'lucky_number': {
      const luckyNumbers = (data.numbers as number[]) || [data.luckyNumber];
      const luckyCount = data.count as number || 1;
      content = `
        <div class="header">🍀 Lucky Number${luckyCount > 1 ? 's' : ''}</div>
        <div style="text-align:center;font-size:3rem;margin:0.5rem 0">🍀</div>
        <div class="big-number" style="color:#10b981">${luckyCount > 1 ? luckyNumbers.join(', ') : data.luckyNumber}</div>
        <div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Range: ${data.range || `${data.min} - ${data.max}`}</div>`;
      break;
    }
    case 'spin_wheel': {
      const spinOptions = (data.options as string[]) || [];
      const spinWheelColors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
      const spinSegmentAngle = 360 / spinOptions.length;
      const spinSegments = spinOptions.map((opt: string, i: number) => {
        const color = spinWheelColors[i % spinWheelColors.length];
        const startAngle = i * spinSegmentAngle;
        const endAngle = (i + 1) * spinSegmentAngle;
        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;
        const x1 = 50 + 45 * Math.cos(startRad);
        const y1 = 50 + 45 * Math.sin(startRad);
        const x2 = 50 + 45 * Math.cos(endRad);
        const y2 = 50 + 45 * Math.sin(endRad);
        const largeArc = spinSegmentAngle > 180 ? 1 : 0;
        return `<path d="M50,50 L${x1},${y1} A45,45 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}"/>`;
      }).join('');
      const spinWinnerColor = spinWheelColors[(data.index as number) % spinWheelColors.length];
      content = `
        <div class="header">🎡 Spin Wheel</div>
        <div style="text-align:center;margin:0.5rem 0">
          <svg viewBox="0 0 100 100" style="width:120px;height:120px">
            ${spinSegments}
            <circle cx="50" cy="50" r="8" fill="#1e1e32" stroke="#fff" stroke-width="2"/>
            <polygon points="50,5 45,15 55,15" fill="#fff"/>
          </svg>
        </div>
        <div class="big-number" style="color:${spinWinnerColor};font-size:1.8rem">${data.result}</div>
        <div class="label" style="background:rgba(139,92,246,0.2);color:#8b5cf6">Winner from ${spinOptions.length} options</div>`;
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

      content = `
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
      const percentSuffix = data.resultIsPercent ? '%' : '';
      content = `
        <div class="header">📊 Percentage</div>
        <div class="big-number" style="color:#f472b6">${data.result}${percentSuffix}</div>
        <div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6;font-size:0.9rem;padding:0.75rem 1rem">${data.explanation || `${data.value1} → ${data.value2}`}</div>`;
      break;
    }
    case 'convert_units': {
      content = `
        <div class="header">🔄 Unit Converter</div>
        <div class="big-number" style="color:#60a5fa;font-size:2rem">${data.result}</div>
        <div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">${data.to || data.toUnit}</div>
        <div class="stats">
          <div class="stat-box" style="grid-column:span 2"><div class="stat-label">From</div><div class="stat-value">${data.value} ${data.from || data.fromUnit}</div></div>
        </div>`;
      break;
    }
    case 'cycle': {
      // Use phaseInfo from shared calculator if available, otherwise fallback
      const cyclePhaseInfo = data.phaseInfo as { emoji?: string; color?: string; name?: string } | undefined;
      const cyclePhaseColor = cyclePhaseInfo?.color || '#f472b6';
      const cyclePhaseEmoji = cyclePhaseInfo?.emoji || '🌸';
      const cycleModeLabel = data.mode === 'simplified' ? ' (Simplified)' : '';
      content = `
        <div class="header">🌸 Cycle Tracker${cycleModeLabel}</div>
        <div class="big-number" style="color:#f472b6;font-size:1.5rem">${data.nextPeriodStart}</div>
        <div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">Next Period${data.daysUntilNextPeriod ? ` (in ${data.daysUntilNextPeriod} days)` : ''}</div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">Cycle Day</div><div class="stat-value">${data.currentDay || '—'}</div></div>
          <div class="stat-box"><div class="stat-label">Phase ${cyclePhaseEmoji}</div><div class="stat-value" style="color:${cyclePhaseColor}">${cyclePhaseInfo?.name || data.phase || '—'}</div></div>
          <div class="stat-box"><div class="stat-label">🥚 Ovulation</div><div class="stat-value">${data.ovulationDate || '—'}</div></div>
          <div class="stat-box"><div class="stat-label">💚 Fertile Window</div><div class="stat-value">${data.fertileWindowStart} - ${data.fertileWindowEnd}</div></div>
        </div>`;
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
      const posRiskColor = data.riskColor || '#eab308';
      const posDir = data.direction === 'short' ? '🔴 SHORT' : '🟢 LONG';
      if (data.calculatedField === 'suggestions' && data.suggestions) {
        // riskOnly mode - show suggestions
        const suggRows = (data.suggestions as Array<{slDistancePercent: number; stopLoss: number; quantity: number}>)
          .slice(0, 3).map((s) => `<div style="display:flex;justify-content:space-between;padding:0.5rem;background:rgba(255,255,255,0.05);border-radius:8px;margin-bottom:0.25rem"><span style="color:#ef4444">SL: $${s.stopLoss}</span><span style="color:#60a5fa">Qty: ${s.quantity}</span></div>`).join('');
        content = `
          <div class="header">📈 Position Suggestions</div>
          <div class="big-number" style="color:${posRiskColor}">${data.riskPercent}% Risk</div>
          <div class="label" style="background:rgba(234,179,8,0.2);color:#eab308">${posDir} | $${data.riskAmount} at risk</div>
          <div style="margin-top:1rem">${suggRows}</div>`;
      } else {
        // Other modes - show calculated result
        const calcLabel = data.calculatedField === 'quantity' ? '📦 Quantity' : data.calculatedField === 'stopLoss' ? '🛑 Stop Loss' : '⚠️ Risk %';
        content = `
          <div class="header">📈 Position Size</div>
          <div class="big-number" style="color:${posRiskColor}">${data.riskPercent}%</div>
          <div class="label" style="background:${posRiskColor}33;color:${posRiskColor}">${data.riskLabel} | ${posDir}</div>
          <div class="stats">
            <div class="stat-box"><div class="stat-label">🛑 Stop Loss</div><div class="stat-value" style="color:#ef4444">$${data.stopLoss}</div></div>
            <div class="stat-box"><div class="stat-label">📦 Quantity</div><div class="stat-value" style="color:#60a5fa">${data.quantity}</div></div>
            <div class="stat-box"><div class="stat-label">💰 Risk Amt</div><div class="stat-value">$${data.riskAmount}</div></div>
            <div class="stat-box"><div class="stat-label">${calcLabel}</div><div class="stat-value">✨ Calculated</div></div>
          </div>`;
      }
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
    case 'zone': {
      const conversions = (data.conversions || []) as Array<{ city: string; time: string; dayChange?: string }>;
      const conversionRows = conversions.slice(0, 4).map(c =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem;background:rgba(96,165,250,0.1);border-radius:8px;margin-bottom:0.25rem">
          <span style="color:rgba(255,255,255,0.8)">${c.city}</span>
          <span style="color:#60a5fa;font-weight:700">${c.time}${c.dayChange ? ` <span style="font-size:0.75rem;color:#f59e0b">(${c.dayChange})</span>` : ''}</span>
        </div>`
      ).join('');
      content = `
        <div class="header">🌍 Timezone Converter</div>
        <div class="big-number" style="color:#60a5fa;font-size:1.5rem">${data.sourceTime} ${data.sourceCity || data.sourceTimezone}</div>
        <div style="margin-top:1rem">${conversionRows}</div>`;
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
      const tenseColor = data.isPast ? '#ef4444' : data.isToday ? '#22c55e' : '#3b82f6';
      const tenseLabel = data.isPast ? 'Past' : data.isToday ? 'Today' : 'Future';
      const absDays = Math.abs(data.daysFromToday as number);
      content = `
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
      break;
    }
    case 'blood': {
      // Unified blood widget - renders based on calculatorMode
      const bloodData = data as {
        calculatorMode?: 'donation' | 'compatibility' | 'baby';
        // Donation fields
        eligible?: boolean; amount?: number; maxSafeAmount?: number; bloodVolume?: number; warnings?: string[];
        // Compatibility fields
        fullBloodType?: string; canDonateTo?: string[]; canReceiveFrom?: string[]; isUniversalDonor?: boolean; isUniversalRecipient?: boolean;
        // Baby fields
        possibleTypes?: { type: string; percentage: number }[]; rhIncompatibilityRisk?: boolean;
      };
      const mode = bloodData.calculatorMode || 'donation';

      if (mode === 'donation') {
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
      } else if (mode === 'compatibility') {
        const isSpecial = bloodData.isUniversalDonor || bloodData.isUniversalRecipient;
        const specialLabel = bloodData.isUniversalDonor ? '🌟 Universal Donor' : bloodData.isUniversalRecipient ? '🌟 Universal Recipient' : '';
        const donateTo = bloodData.canDonateTo || [];
        const receiveFrom = bloodData.canReceiveFrom || [];
        content = `
          <div class="header">🩸 Blood Compatibility</div>
          <div class="big-number" style="color:#ef4444;font-size:2.5rem">${bloodData.fullBloodType || ''}</div>
          ${isSpecial ? `<div class="label" style="background:rgba(251,191,36,0.2);color:#fbbf24">${specialLabel}</div>` : ''}
          <div class="stats">
            <div class="stat-box" style="background:rgba(34,197,94,0.1)"><div class="stat-label" style="color:#22c55e">Can Donate To</div><div class="stat-value" style="font-size:0.8rem">${donateTo.join(', ') || 'None'}</div></div>
            <div class="stat-box" style="background:rgba(59,130,246,0.1)"><div class="stat-label" style="color:#3b82f6">Can Receive From</div><div class="stat-value" style="font-size:0.8rem">${receiveFrom.join(', ') || 'None'}</div></div>
          </div>`;
      } else if (mode === 'baby') {
        const topTypes = (bloodData.possibleTypes || []).slice(0, 4);
        const hasRisk = bloodData.rhIncompatibilityRisk;
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
      }
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
      // Check if we have meaningful data or just placeholder
      const entries = Object.entries(data).filter(([k]) => k !== 'message');
      const hasData = entries.length > 0 && !data.message;

      if (hasData) {
        // Show key-value pairs for actual data
        content = `
          <div class="header">🔧 Result</div>
          <div class="stats" style="grid-template-columns:1fr">
            ${entries.slice(0, 6).map(([k, v]) => `<div class="stat-box"><div class="stat-label">${k.replace(/([A-Z])/g, ' $1').trim()}</div><div class="stat-value">${typeof v === 'object' ? JSON.stringify(v) : v}</div></div>`).join('')}
          </div>`;
      } else {
        // Show awaiting state for placeholder/empty data
        content = `
          <div class="header">⏳ Awaiting Data</div>
          <div style="text-align:center;padding:2rem 1rem;color:rgba(255,255,255,0.6)">
            <div style="font-size:2.5rem;margin-bottom:0.5rem">🔄</div>
            <div>Waiting for tool execution...</div>
          </div>`;
      }
      break;
    }
  }

  // Generate HTML with OpenAI SDK support and Claude fallback
  // Start with LOADING state, then:
  // - OpenAI: wait for openai:set_globals to get real data
  // - Claude: render embedded data after short timeout (no OpenAI env)
  const loadingContent = `
    <div class="header">⏳ Loading...</div>
    <div style="text-align:center;padding:2rem 1rem;color:rgba(255,255,255,0.6)">
      <div style="font-size:2.5rem;margin-bottom:0.5rem;animation:pulse 1.5s ease-in-out infinite">🔄</div>
      <div>Awaiting results...</div>
    </div>
    <style>@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }</style>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${WIDGET_STYLES}</style>
</head>
<body>
  <div class="card" id="widget-container">${loadingContent}<div class="footer">tulzo.vercel.app</div></div>
  <script>
    // Embedded data for Claude (fallback)
    const embeddedData = ${JSON.stringify({ tool: toolName, data })};
    const widgetType = "${widgetType}";
    let dataReceived = false;

    // OpenAI SDK integration - listen for set_globals event
    window.addEventListener("openai:set_globals", function(ev) {
      console.log("🎯 openai:set_globals event fired");
      const toolOutput = window.openai?.toolOutput?.result;
      if (toolOutput) {
        console.log("📦 Got OpenAI tool output:", toolOutput);
        dataReceived = true;
        updateWidget({ tool: embeddedData.tool, data: toolOutput });
      }
    });

    // Check if OpenAI data is already available
    if (window.openai?.toolOutput?.result) {
      console.log("📦 OpenAI data already available");
      dataReceived = true;
      updateWidget({ tool: embeddedData.tool, data: window.openai.toolOutput.result });
    } else {
      // Fallback for Claude: if no OpenAI data after 100ms, use embedded data
      setTimeout(function() {
        if (!dataReceived) {
          console.log("📦 Using embedded data (Claude fallback)");
          updateWidget(embeddedData);
        }
      }, 100);
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
        case 'flip': {
          // Unified flip widget - renders based on flipMode
          if (data.flipMode === 'dice') {
            var rolls = data.rolls || [];
            return '<div class="header">🎲 Dice Roll</div>' +
              '<div class="big-number" style="color:#60a5fa">' + data.total + '</div>' +
              '<div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">Total</div>' +
              '<div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin-top:0.5rem">' +
                rolls.map(function(r) { return '<span style="background:rgba(96,165,250,0.3);padding:0.5rem 1rem;border-radius:8px;font-weight:700;color:#fff">' + r + '</span>'; }).join('') +
              '</div>';
          } else {
            var result = data.result || 'heads';
            var isHeads = result === 'heads';
            var coinColor = isHeads ? '#fbbf24' : '#9ca3af';
            var coinBg = isHeads ? 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #d97706 100%)' : 'linear-gradient(135deg, #f3f4f6 0%, #9ca3af 50%, #6b7280 100%)';
            var borderColor = isHeads ? '#b45309' : '#4b5563';
            var textColor = isHeads ? '#92400e' : '#374151';
            var count = data.count || 1;
            return '<div class="header">🪙 Coin Flip</div>' +
              '<div style="text-align:center;margin:1rem 0">' +
                '<div style="width:80px;height:80px;border-radius:50%;background:' + coinBg + ';display:inline-flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.3);border:3px solid ' + borderColor + '">' +
                  '<span style="font-size:2rem;font-weight:800;color:' + textColor + '">' + (isHeads ? 'H' : 'T') + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="big-number" style="color:' + coinColor + ';font-size:2rem">' + result.toUpperCase() + '</div>' +
              (count > 1 ? '<div class="stats">' +
                '<div class="stat-box"><div class="stat-label">Heads</div><div class="stat-value" style="color:#fbbf24">' + data.headsCount + '</div></div>' +
                '<div class="stat-box"><div class="stat-label">Tails</div><div class="stat-value" style="color:#9ca3af">' + data.tailsCount + '</div></div>' +
              '</div>' : '');
          }
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
        case 'ideal_weight': {
          return '<div class="header">⚖️ Ideal Weight</div>' +
            '<div class="big-number" style="color:#10b981">' + Number(data.idealWeight).toFixed(1) + '</div>' +
            '<div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">kg (' + (data.formula || 'Devine') + ')</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Height</div><div class="stat-value">' + data.height + ' cm</div></div>' +
              '<div class="stat-box"><div class="stat-label">Gender</div><div class="stat-value">' + data.gender + '</div></div>' +
            '</div>';
        }
        case 'bmr': {
          return '<div class="header">🔥 BMR Calculator</div>' +
            '<div class="big-number" style="color:#f59e0b">' + Math.round(data.bmr) + '</div>' +
            '<div class="label" style="background:rgba(245,158,11,0.2);color:#f59e0b">calories/day</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">TDEE</div><div class="stat-value">' + Math.round(data.tdee) + ' cal</div></div>' +
              '<div class="stat-box"><div class="stat-label">Activity</div><div class="stat-value">' + (data.activityLevel || 'moderate') + '</div></div>' +
            '</div>';
        }
        case 'weight_loss_plan': {
          return '<div class="header">📉 Weight Loss Plan</div>' +
            '<div class="big-number" style="color:#10b981;font-size:2rem">' + data.targetWeight + ' kg</div>' +
            '<div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Target in ' + data.weeksToGoal + ' weeks</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Current</div><div class="stat-value">' + data.currentWeight + ' kg</div></div>' +
              '<div class="stat-box"><div class="stat-label">Daily Cal</div><div class="stat-value">' + data.dailyCalories + '</div></div>' +
            '</div>';
        }
        case 'savings_plan': {
          var currencySymbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', RON: 'lei ' };
          var sym = currencySymbols[data.currency] || '$';
          var finalBalance = Number(data.finalBalance || 0).toLocaleString();
          var monthlyTargetSavings = Number(data.monthlyTargetSavings || 0).toLocaleString();
          var monthsToGoal = data.monthsToGoal || 0;
          var savingsMode = data.savingsMode === 'duration' ? '⏱️ Duration' : '🎯 Goal';
          var interestEnabled = data.interestEnabled;
          var totalInterestEarned = Number(data.totalInterestEarned || 0).toLocaleString();
          var annualInterestRate = data.annualInterestRate || 0;
          var savingsRate = data.savingsRate || 0;

          return '<div class="header">💰 Savings Plan</div>' +
            '<div class="big-number" style="color:#10b981">' + sym + finalBalance + '</div>' +
            '<div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">' + savingsMode + ' • ' + monthsToGoal + ' months</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Monthly Savings</div><div class="stat-value">' + sym + monthlyTargetSavings + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Savings Rate</div><div class="stat-value">' + savingsRate + '%</div></div>' +
              (interestEnabled ?
                '<div class="stat-box"><div class="stat-label">Interest Rate</div><div class="stat-value">' + annualInterestRate + '%/yr</div></div>' +
                '<div class="stat-box"><div class="stat-label">Interest Earned</div><div class="stat-value" style="color:#34d399">' + sym + totalInterestEarned + '</div></div>'
              :
                '<div class="stat-box"><div class="stat-label">Target Date</div><div class="stat-value">' + (data.targetDate || 'N/A') + '</div></div>' +
                '<div class="stat-box"><div class="stat-label">Achievable</div><div class="stat-value">' + (data.isAchievable ? '✅ Yes' : '⚠️ Stretch') + '</div></div>'
              ) +
            '</div>';
        }
        case 'days_between': {
          return '<div class="header">📆 Days Between</div>' +
            '<div class="big-number" style="color:#a78bfa">' + Math.abs(data.days) + '</div>' +
            '<div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">days</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Weeks</div><div class="stat-value">' + data.weeks + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Months</div><div class="stat-value">' + data.months + '</div></div>' +
            '</div>';
        }
        case 'lucky_number': {
          var luckyNums = data.numbers || [data.luckyNumber];
          var luckyCount = data.count || 1;
          var luckyDisplay = luckyCount > 1 ? luckyNums.join(', ') : data.luckyNumber;
          var luckyRange = data.range || (data.min + ' - ' + data.max);
          return '<div class="header">🍀 Lucky Number' + (luckyCount > 1 ? 's' : '') + '</div>' +
            '<div class="big-number" style="color:#22c55e">' + luckyDisplay + '</div>' +
            '<div class="label" style="background:rgba(34,197,94,0.2);color:#22c55e">Range: ' + luckyRange + '</div>';
        }
        case 'spin_wheel': {
          var spinOptions = data.options || [];
          var wheelColors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
          var winnerColor = wheelColors[data.index % wheelColors.length];
          return '<div class="header">🎡 Spin Wheel</div>' +
            '<div style="text-align:center;font-size:3rem;margin:0.5rem 0">🎡</div>' +
            '<div class="big-number" style="color:' + winnerColor + ';font-size:1.8rem">' + data.result + '</div>' +
            '<div class="label" style="background:rgba(139,92,246,0.2);color:#8b5cf6">Winner from ' + spinOptions.length + ' options</div>';
        }
        case 'percentage': {
          var pctSuffix = data.resultIsPercent ? '%' : '';
          var pctExplanation = data.explanation || (data.value1 + ' → ' + data.value2);
          return '<div class="header">📊 Percentage</div>' +
            '<div class="big-number" style="color:#f472b6">' + data.result + pctSuffix + '</div>' +
            '<div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6;font-size:0.9rem;padding:0.75rem 1rem">' + pctExplanation + '</div>';
        }
        case 'convert_units': {
          return '<div class="header">🔄 Unit Converter</div>' +
            '<div class="big-number" style="color:#60a5fa;font-size:2rem">' + data.result + '</div>' +
            '<div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">' + (data.to || data.toUnit) + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box" style="grid-column:span 2"><div class="stat-label">From</div><div class="stat-value">' + data.value + ' ' + (data.from || data.fromUnit) + '</div></div>' +
            '</div>';
        }
        case 'countdown': {
          var cdIsPast = data.isPast || data.days < 0;
          var cdIsToday = data.isToday || data.days === 0;
          var cdAbsDays = data.absoluteDays || Math.abs(data.days);
          if (cdIsToday) {
            return '<div class="header">⏳ Countdown</div>' +
              '<div class="big-number" style="color:#10b981">🎉</div>' +
              '<div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">' + (data.eventName || 'Event') + ' is Today!</div>';
          }
          return '<div class="header">⏳ Countdown</div>' +
            '<div class="big-number" style="color:#06b6d4">' + cdAbsDays + '</div>' +
            '<div class="label" style="background:rgba(6,182,212,0.2);color:#06b6d4">days ' + (cdIsPast ? 'ago' : 'to go') + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Event</div><div class="stat-value">' + (data.eventName || 'Target') + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Weeks</div><div class="stat-value">' + data.weeks + '</div></div>' +
            '</div>';
        }
        case 'decision': {
          var decIcon = data.icon || '🎱';
          var decMode = data.mode || 'pickOne';
          var decModeLabel = decMode === 'yesNo' ? 'Yes/No Oracle' : decMode === 'weighted' ? 'Weighted Choice' : 'Random Pick';
          return '<div class="header">🎱 Decision Maker</div>' +
            '<div style="text-align:center;font-size:3rem;margin:0.5rem 0">' + decIcon + '</div>' +
            '<div class="big-number" style="color:#a78bfa;font-size:1.5rem">' + data.decision + '</div>' +
            '<div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">' + decModeLabel + '</div>';
        }
        case 'zodiac': {
          return '<div class="header">💕 Zodiac Compatibility</div>' +
            '<div class="big-number" style="color:#f472b6">' + data.compatibility + '%</div>' +
            '<div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">' + data.level + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">' + (data.person1 && data.person1.symbol || '⭐') + '</div><div class="stat-value">' + (data.person1 && data.person1.name || data.sign1) + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">' + (data.person2 && data.person2.symbol || '⭐') + '</div><div class="stat-value">' + (data.person2 && data.person2.name || data.sign2) + '</div></div>' +
            '</div>';
        }
        case 'cycle': {
          var cycPhaseInfo = data.phaseInfo || {};
          var cycPhaseColor = cycPhaseInfo.color || '#f472b6';
          var cycPhaseEmoji = cycPhaseInfo.emoji || '🌸';
          return '<div class="header">🌸 Cycle Tracker</div>' +
            '<div class="big-number" style="color:#f472b6;font-size:1.5rem">' + data.nextPeriodStart + '</div>' +
            '<div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">Next Period' + (data.daysUntilNextPeriod ? ' (in ' + data.daysUntilNextPeriod + ' days)' : '') + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Cycle Day</div><div class="stat-value">' + (data.currentDay || '—') + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">' + cycPhaseEmoji + ' Phase</div><div class="stat-value" style="color:' + cycPhaseColor + '">' + (cycPhaseInfo.name || data.phase || '—') + '</div></div>' +
            '</div>';
        }
        case 'names': {
          var names = data.names || [];
          return '<div class="header">👶 Name Generator</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:1rem 0">' +
              names.slice(0, 8).map(function(n) { return '<span style="background:rgba(244,114,182,0.2);color:#f472b6;padding:0.5rem 1rem;border-radius:20px;font-weight:600">' + n + '</span>'; }).join('') +
            '</div>' +
            '<div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">' + data.gender + ' names</div>';
        }
        case 'position_size': {
          var posRiskColor = data.riskColor || '#eab308';
          var posDir = data.direction === 'short' ? '🔴 SHORT' : '🟢 LONG';
          if (data.calculatedField === 'suggestions' && data.suggestions) {
            var suggRows = data.suggestions.slice(0, 3).map(function(s) {
              return '<div style="display:flex;justify-content:space-between;padding:0.5rem;background:rgba(255,255,255,0.05);border-radius:8px;margin-bottom:0.25rem"><span style="color:#ef4444">SL: $' + s.stopLoss + '</span><span style="color:#60a5fa">Qty: ' + s.quantity + '</span></div>';
            }).join('');
            return '<div class="header">📈 Position Suggestions</div>' +
              '<div class="big-number" style="color:' + posRiskColor + '">' + data.riskPercent + '% Risk</div>' +
              '<div class="label" style="background:rgba(234,179,8,0.2);color:#eab308">' + posDir + ' | $' + data.riskAmount + ' at risk</div>' +
              '<div style="margin-top:1rem">' + suggRows + '</div>';
          } else {
            return '<div class="header">📈 Position Size</div>' +
              '<div class="big-number" style="color:' + posRiskColor + '">' + data.riskPercent + '%</div>' +
              '<div class="label" style="background:' + posRiskColor + '33;color:' + posRiskColor + '">' + data.riskLabel + ' | ' + posDir + '</div>' +
              '<div class="stats">' +
                '<div class="stat-box"><div class="stat-label">🛑 Stop Loss</div><div class="stat-value" style="color:#ef4444">$' + data.stopLoss + '</div></div>' +
                '<div class="stat-box"><div class="stat-label">📦 Quantity</div><div class="stat-value" style="color:#60a5fa">' + data.quantity + '</div></div>' +
                '<div class="stat-box"><div class="stat-label">💰 Risk Amt</div><div class="stat-value">$' + data.riskAmount + '</div></div>' +
              '</div>';
          }
        }
        case 'sleep_times': {
          var times = data.sleepTimes || data.wakeTimes || [];
          return '<div class="header">😴 Sleep Calculator</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:1rem 0">' +
              times.slice(0, 4).map(function(t) { return '<span style="background:rgba(139,92,246,0.2);color:#8b5cf6;padding:0.5rem 1rem;border-radius:20px;font-weight:600">' + t + '</span>'; }).join('') +
            '</div>' +
            '<div class="label" style="background:rgba(139,92,246,0.2);color:#8b5cf6">Optimal ' + (data.sleepTimes ? 'bedtimes' : 'wake times') + '</div>';
        }
        case 'zone': {
          var conversions = data.conversions || [];
          var conversionRows = conversions.slice(0, 4).map(function(c) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem;background:rgba(96,165,250,0.1);border-radius:8px;margin-bottom:0.25rem">' +
              '<span style="color:rgba(255,255,255,0.8)">' + c.city + '</span>' +
              '<span style="color:#60a5fa;font-weight:700">' + c.time + (c.dayChange ? ' <span style="font-size:0.75rem;color:#f59e0b">(' + c.dayChange + ')</span>' : '') + '</span>' +
            '</div>';
          }).join('');
          return '<div class="header">🌍 Timezone Converter</div>' +
            '<div class="big-number" style="color:#60a5fa;font-size:1.5rem">' + data.sourceTime + ' ' + (data.sourceCity || data.sourceTimezone) + '</div>' +
            '<div style="margin-top:1rem">' + conversionRows + '</div>';
        }
        case 'iq_score': {
          var iq = Number(data.iqScore || data.iq);
          var iqColor = iq >= 130 ? '#10b981' : iq >= 100 ? '#60a5fa' : '#f59e0b';
          return '<div class="header">🧠 IQ Score</div>' +
            '<div class="big-number" style="color:' + iqColor + '">' + iq + '</div>' +
            '<div class="label" style="background:' + iqColor + '33;color:' + iqColor + '">' + data.category + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Percentile</div><div class="stat-value">' + data.percentile + '%</div></div>' +
              '<div class="stat-box"><div class="stat-label">Rarity</div><div class="stat-value">1 in ' + data.rarity + '</div></div>' +
            '</div>';
        }
        case 'uniqueness': {
          var score = Number(data.uniquenessScore);
          var uColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
          return '<div class="header">🦄 Uniqueness</div>' +
            '<div class="big-number" style="color:' + uColor + '">' + score + '%</div>' +
            '<div class="label" style="background:' + uColor + '33;color:' + uColor + '">' + data.category + '</div>';
        }
        case 'when_date': {
          var tenseColor = data.isPast ? '#ef4444' : data.isToday ? '#22c55e' : '#3b82f6';
          var tenseLabel = data.isPast ? 'Past' : data.isToday ? 'Today' : 'Future';
          var absDays = Math.abs(data.daysFromToday || 0);
          return '<div class="header">📅 Date Info</div>' +
            '<div class="big-number" style="color:#60a5fa;font-size:1.3rem">' + (data.formattedDate || data.date) + '</div>' +
            '<div class="label" style="background:' + tenseColor + '33;color:' + tenseColor + '">' + data.dayOfWeek + ' • ' + tenseLabel + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Days</div><div class="stat-value">' + absDays + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Weeks</div><div class="stat-value">' + data.weeks + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Week #</div><div class="stat-value">' + data.weekOfYear + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Q</div><div class="stat-value">' + data.quarter + '</div></div>' +
            '</div>' +
            '<div style="margin-top:0.5rem;font-size:0.75rem;color:rgba(255,255,255,0.6)">' + data.zodiacSign + ' • Day ' + data.dayOfYear + (data.isLeapYear ? ' • Leap Year' : '') + '</div>';
        }
        case 'blood_donation': {
          var eligibleColor = data.eligible ? '#22c55e' : '#ef4444';
          var eligibleIcon = data.eligible ? '✅' : '❌';
          var eligibleText = data.eligible ? 'Eligible to Donate' : 'Not Eligible';
          return '<div class="header">🩸 Blood Donation</div>' +
            '<div class="big-number" style="color:' + eligibleColor + '">' + eligibleIcon + '</div>' +
            '<div class="label" style="background:' + eligibleColor + '33;color:' + eligibleColor + '">' + eligibleText + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Blood Volume</div><div class="stat-value">' + data.bloodVolume + ' L</div></div>' +
              '<div class="stat-box"><div class="stat-label">' + (data.eligible ? 'Recommended' : 'Max Safe') + '</div><div class="stat-value">' + (data.amount || data.maxSafeAmount) + ' ml</div></div>' +
            '</div>';
        }
        case 'blood_compatibility': {
          var donateTo = data.canDonateTo || [];
          var receiveFrom = data.canReceiveFrom || [];
          return '<div class="header">🩸 Blood Compatibility</div>' +
            '<div class="big-number" style="color:#ef4444;font-size:2.5rem">' + (data.fullBloodType || '') + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box" style="background:rgba(34,197,94,0.1)"><div class="stat-label" style="color:#22c55e">Can Donate To</div><div class="stat-value" style="font-size:0.8rem">' + (donateTo.join(', ') || 'None') + '</div></div>' +
              '<div class="stat-box" style="background:rgba(59,130,246,0.1)"><div class="stat-label" style="color:#3b82f6">Can Receive From</div><div class="stat-value" style="font-size:0.8rem">' + (receiveFrom.join(', ') || 'None') + '</div></div>' +
            '</div>';
        }
        case 'baby_blood': {
          var topTypes = (data.possibleTypes || []).slice(0, 4);
          return '<div class="header">👶 Baby Blood Type</div>' +
            '<div class="stats" style="grid-template-columns:repeat(' + Math.min(topTypes.length, 2) + ', 1fr)">' +
              topTypes.map(function(t) { return '<div class="stat-box"><div class="stat-value" style="font-size:1.5rem;color:#a78bfa">' + t.type + '</div><div class="stat-label">' + t.percentage + '%</div></div>'; }).join('') +
            '</div>';
        }
        case 'next_eclipse': {
          var eclipseIcon = data.type === 'solar' ? '☀️' : '🌙';
          return '<div class="header">' + eclipseIcon + ' Next Eclipse</div>' +
            '<div class="big-number" style="color:#a78bfa;font-size:1.5rem">' + (data.date || 'Unknown') + '</div>' +
            '<div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">' + (data.subtype || '') + ' ' + (data.type || '') + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Days Until</div><div class="stat-value">' + (data.daysUntil || '?') + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Peak Time</div><div class="stat-value">' + (data.peakTimeUTC || '?') + ' UTC</div></div>' +
            '</div>';
        }
        case 'eclipse_list': {
          var eclipses = (data.eclipses || []).slice(0, 3);
          return '<div class="header">🌓 Upcoming Eclipses</div>' +
            '<div class="label">' + (data.totalCount || 0) + ' eclipses found</div>' +
            '<div style="margin-top:0.5rem">' +
              eclipses.map(function(e) { return '<div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.1)"><span>' + (e.type === 'solar' ? '☀️' : '🌙') + ' ' + e.subtype + '</span><span style="color:rgba(255,255,255,0.6)">' + e.date + '</span></div>'; }).join('') +
            '</div>';
        }
        default: {
          // Check if we have meaningful data
          var entries = Object.entries(data).filter(function(e) { return e[0] !== 'message'; });
          var hasData = entries.length > 0 && !data.message;

          if (hasData) {
            return '<div class="header">🔧 Result</div>' +
              '<div class="stats" style="grid-template-columns:1fr">' +
                entries.slice(0, 6).map(function(e) {
                  var k = e[0], v = e[1];
                  return '<div class="stat-box"><div class="stat-label">' + k.replace(/([A-Z])/g, ' $1').trim() + '</div><div class="stat-value">' + (typeof v === 'object' ? JSON.stringify(v) : v) + '</div></div>';
                }).join('') +
              '</div>';
          } else {
            return '<div class="header">⏳ Awaiting Data</div>' +
              '<div style="text-align:center;padding:2rem 1rem;color:rgba(255,255,255,0.6)">' +
                '<div style="font-size:2.5rem;margin-bottom:0.5rem">🔄</div>' +
                '<div>Waiting for tool execution...</div>' +
              '</div>';
          }
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
    case 'calculate_tip':
      return `Bill: $${r.billAmount} + Tip (${r.tipPercent}%): $${r.tipAmount} = Total: $${r.total}${(r.splitWays as number) > 1 ? ` ($${r.perPerson} per person)` : ''}`;
    case 'flip_tool': {
      if (r.flipMode === 'dice') {
        return `🎲 Rolled: ${(r.rolls as number[]).join(', ')} (Total: ${r.total})`;
      } else {
        const count = r.count as number;
        if (count === 1) {
          return `🪙 Flipped: ${(r.result as string).toUpperCase()}`;
        }
        return `🪙 Flipped ${count} coins: ${r.headsCount} heads, ${r.tailsCount} tails`;
      }
    }
    case 'calculate_age':
      return `Age: ${r.years} years, ${r.months} months, ${r.days} days (${r.totalDays} total days). Next birthday in ${r.daysUntilNextBirthday} days.`;
    case 'zodiac_compatibility':
      return `${(r.person1 as { name: string }).name} ❤️ ${(r.person2 as { name: string }).name}: ${r.compatibility}% compatibility (${r.level})`;
    case 'calculate_countdown': {
      if (r.isToday) {
        return `⏳ ${r.eventName} is today! 🎉`;
      }
      const cdAbsDays = r.absoluteDays ?? Math.abs(r.days as number);
      return `⏳ ${r.eventName}: ${cdAbsDays} days ${r.isPast ? 'ago' : 'to go'} (${r.weeks} weeks, ${r.months} months)`;
    }
    case 'make_decision': {
      const decMode = r.mode as string;
      if (decMode === 'yesNo') {
        return `🎱 The oracle says: ${r.decision}`;
      }
      return `🎱 Decision: ${r.decision} (${r.confidence}% confidence from ${r.totalOptions} options)`;
    }
    case 'lucky_number': {
      const luckyNums = (r.numbers as number[]) || [r.luckyNumber];
      const luckyCountVal = (r.count as number) || 1;
      return luckyCountVal > 1
        ? `🍀 Lucky numbers: ${luckyNums.join(', ')} (range: ${r.range})`
        : `🍀 Lucky number: ${r.luckyNumber} (range: ${r.range})`;
    }
    case 'spin_wheel':
      return `🎡 The wheel landed on: ${r.result} (option ${(r.index as number) + 1} of ${r.totalOptions})`;
    case 'blood_calculator': {
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
    case 'calculate_cycle': {
      const cycPhaseInfo = r.phaseInfo as { emoji?: string; name?: string } | undefined;
      const cycEmoji = cycPhaseInfo?.emoji || '🌸';
      const cycPhaseName = cycPhaseInfo?.name || r.phase;
      return `🌸 Next period: ${r.nextPeriodStart} (in ${r.daysUntilNextPeriod} days). Currently day ${r.currentDay} - ${cycEmoji} ${cycPhaseName}. Ovulation: ${r.ovulationDate}`;
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
    calculate_savings_plan: { savingsMode: 'goal', monthlyTargetSavings: 500, monthsToGoal: 24, finalBalance: 12000, monthlyDisposable: 2000, savingsRate: 25, currency: 'USD', interestEnabled: false, totalInterestEarned: 0, targetDate: '2028-01-01', isAchievable: true },
    days_between_dates: { days: 30, weeks: 4, months: 1, startDate: '2026-01-01', endDate: '2026-01-31' },
    random_number: { result: 42, min: 1, max: 100 },
    pick_random: { result: 'Option A', options: ['Option A', 'Option B', 'Option C'] },
    calculate_tip: { billAmount: 50, tipPercent: 18, tipAmount: 9, total: 59, perPerson: 59, splitWays: 1 },
    calculate_percentage: { result: 25, operation: 'whatIsXPercentOfY', value1: 25, value2: 100, explanation: '25% of 100 = 25.00', resultIsPercent: false },
    calculate_age: { years: 30, months: 6, days: 15, totalDays: 11138, daysUntilNextBirthday: 180 },
    convert_units: { result: 2.2, value: 1, from: 'kg', to: 'lbs' },
    calculate_cycle: { nextPeriodStart: '2026-01-28', nextPeriodEnd: '2026-02-02', fertileWindowStart: '2026-01-10', fertileWindowEnd: '2026-01-16', ovulationDate: '2026-01-14', currentDay: 10, phase: 'follicular', daysUntilNextPeriod: 18, cycleLength: 28, periodLength: 5, mode: 'simplified', periodStartDate: '2025-12-23', phaseInfo: { name: 'Follicular Phase', emoji: '🌱', color: '#22c55e', description: 'Egg develops in ovary' } },
    calculate_countdown: { eventName: 'Summer Vacation', eventDate: '2026-04-16', days: 100, absoluteDays: 100, weeks: 14, months: 3, isPast: false, isToday: false, direction: 'until', summary: '100 days until Summer Vacation' },
    make_decision: { decision: 'Go for it! 🚀', mode: 'yesNo', confidence: 85, icon: '🚀' },
    zodiac_compatibility: {
      person1: { sign: 'aries', name: 'Aries', symbol: '♈', element: 'Fire' },
      person2: { sign: 'leo', name: 'Leo', symbol: '♌', element: 'Fire' },
      compatibility: 85, level: 'Excellent'
    },
    generate_names: { mode: 'names', results: ['Alex', 'Jordan', 'Taylor'], count: 3, nameCategory: 'human', humanNameType: 'first', gender: 'any' },
    calculate_position_size: { mode: 'riskAndSL', direction: 'long', entryPrice: 100, capital: 10000, calculatedField: 'quantity', riskPercent: 2, riskAmount: 200, stopLoss: 95, slDistance: 5, slDistancePercent: 5, quantity: 40, positionValue: 4000, riskLabel: 'Moderate Risk', riskColor: '#eab308' },
    spin_wheel: { result: 'Pizza', index: 0, totalOptions: 4, options: ['Pizza', 'Burger', 'Sushi', 'Tacos'], finalRotation: 2520, segmentAngle: 90 },
    zone_calculator: { sourceTime: '10:00', sourceTimezone: 'America/New_York', sourceCity: 'New York', conversions: [{ timezone: 'Europe/London', city: 'London', time: '15:00', offset: 0, offsetDiff: 5, dayChange: '' }] },
    lucky_number: { luckyNumber: 7, numbers: [7], min: 1, max: 100, count: 1, range: '1 - 100' },
    flip_tool: { flipMode: 'coin', result: 'heads', results: ['heads'], headsCount: 1, tailsCount: 0, count: 1 },
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
        // Return pre-computed list of widget template resources
        return { jsonrpc: '2.0', id, result: { resources: RESOURCES_LIST } };
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
        const widgetData: Record<string, unknown> = result as Record<string, unknown>;

        // Build response text
        const responseText = formatResultText(toolName, result);

        // Generate self-contained widget HTML
        const widgetHtmlContent = generateWidgetHtml(toolName, widgetData);

        // Get tool-specific invocation messages
        const invocationMessages = getInvocationMessages(toolName);

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
      // Use different validation based on auth method
      // - 'header' (x-api-key or Bearer tlz_*): API key validation (assumes Pro if valid)
      // - 'oauth' (Bearer JWT): Session token validation (checks plan)
      const authResult = authMethod === 'oauth'
        ? await validateBearerToken(apiKey)
        : await validateApiKey(apiKey);

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
            message: 'MCP access is not allowed for free users. Upgrade at tulzo.vercel.app/pricing',
          }
        }, { status: 403 });
      }

      // Log connection
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                       request.headers.get('x-real-ip') ||
                       'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      logConnection(authResult.userId!, authResult.authMethod, clientIp, userAgent);

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


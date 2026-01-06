import { NextRequest, NextResponse } from 'next/server';
import { clerkClient, verifyToken } from '@clerk/nextjs/server';
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
    case 'flip_coin': {
      const count = Math.min(Math.max((args.count as number) || 1, 1), 100);
      const results = Array.from({ length: count }, () => Math.random() < 0.5 ? 'heads' : 'tails');
      const headsCount = results.filter(r => r === 'heads').length;
      const tailsCount = results.filter(r => r === 'tails').length;
      return {
        result: results[0],
        results,
        headsCount,
        tailsCount,
        count,
      };
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
    'spin_wheel': 'pick_random',
    'convert_timezone': 'timezone',
    'generate_unique_id': 'unique_id',
    'lucky_number': 'lucky_number',
    'roll_dice': 'dice',
    'flip_coin': 'coin_flip',
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
    case 'coin_flip': {
      const result = data.result as string;
      const results = data.results as string[];
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
        case 'dice': {
          const rolls = data.rolls || [];
          return '<div class="header">🎲 Dice Roll</div>' +
            '<div class="big-number" style="color:#60a5fa">' + data.total + '</div>' +
            '<div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">Total</div>' +
            '<div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin-top:0.5rem">' +
              rolls.map(function(r) { return '<span style="background:rgba(96,165,250,0.3);padding:0.5rem 1rem;border-radius:8px;font-weight:700;color:#fff">' + r + '</span>'; }).join('') +
            '</div>';
        }
        case 'coin_flip': {
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
    case 'roll_dice':
      return `🎲 Rolled: ${(r.rolls as number[]).join(', ')} (Total: ${r.total})`;
    case 'flip_coin': {
      const count = r.count as number;
      if (count === 1) {
        return `🪙 Flipped: ${(r.result as string).toUpperCase()}`;
      }
      return `🪙 Flipped ${count} coins: ${r.headsCount} heads, ${r.tailsCount} tails`;
    }
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
    calculate_savings_plan: { savingsMode: 'goal', monthlyTargetSavings: 500, monthsToGoal: 24, finalBalance: 12000, monthlyDisposable: 2000, savingsRate: 25, currency: 'USD', interestEnabled: false, totalInterestEarned: 0, targetDate: '2028-01-01', isAchievable: true },
    calculate_date_info: { dayOfWeek: 'Monday', weekNumber: 1, isLeapYear: false, dayOfYear: 1, date: '2026-01-01' },
    days_between_dates: { days: 30, weeks: 4, months: 1, startDate: '2026-01-01', endDate: '2026-01-31' },
    random_number: { result: 42, min: 1, max: 100 },
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
    spin_wheel: { result: 'Winner!', options: ['Winner!', 'Try Again', 'Bonus'] },
    convert_timezone: { result: '15:00', fromTime: '10:00', fromTimezone: 'America/New_York', toTimezone: 'Europe/London' },
    generate_unique_id: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', type: 'uuid' },
    lucky_number: { number: 7, min: 1, max: 100 },
    roll_dice: { rolls: [4, 6], total: 10, sides: 6, count: 2 },
    flip_coin: { result: 'heads', results: ['heads'], headsCount: 1, tailsCount: 0, count: 1 },
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


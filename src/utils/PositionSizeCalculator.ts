/**
 * Shared Position Size Calculator
 *
 * Single source of truth for trading position size calculations.
 * Used by both the RiskPage UI and the MCP calculate_position_size tool.
 */

// ============ TYPES ============

/** Trade direction - long (buy) or short (sell) */
export type TradeDirection = 'long' | 'short';

/**
 * Calculation modes:
 * - riskOnly: Given risk%, suggest multiple SL/Qty combinations
 * - riskAndSL: Given risk% and SL, calculate quantity
 * - riskAndQty: Given risk% and quantity, calculate SL
 * - slAndQty: Given SL and quantity, calculate risk%
 */
export type CalculationMode = 'riskOnly' | 'riskAndSL' | 'riskAndQty' | 'slAndQty';

/** Take profit level with risk:reward ratio */
export interface TakeProfitLevel {
  rr: number;
  price: number;
  profit: number;
}

/** Suggested position for riskOnly mode */
export interface SuggestedPosition {
  slDistancePercent: number;
  stopLoss: number;
  quantity: number;
  slDistance: number;
}

/** Input for position size calculation */
export interface PositionSizeInput {
  mode: CalculationMode;
  capital: number;
  entryPrice: number;
  direction: TradeDirection;
  riskPercent?: number;
  stopLossPrice?: number;
  quantity?: number;
}

/** Output from position size calculation */
export interface PositionSizeOutput {
  mode: CalculationMode;
  direction: TradeDirection;
  entryPrice: number;
  capital: number;
  calculatedField: 'suggestions' | 'quantity' | 'stopLoss' | 'riskPercent';
  riskPercent: number;
  riskAmount: number;
  stopLoss?: number;
  slDistance?: number;
  slDistancePercent?: number;
  quantity?: number;
  positionValue?: number;
  takeProfits?: TakeProfitLevel[];
  suggestions?: SuggestedPosition[];
  riskLabel: string;
  riskColor: string;
}

// ============ HELPER FUNCTIONS ============

function getRiskColor(riskPct: number): string {
  if (riskPct <= 1) return '#22c55e';
  if (riskPct <= 3) return '#eab308';
  return '#ef4444';
}

function getRiskLabel(riskPct: number): string {
  if (riskPct <= 1) return 'Low Risk';
  if (riskPct <= 3) return 'Moderate Risk';
  return 'High Risk';
}

function calculateTakeProfits(entry: number, sl: number, dir: TradeDirection, qty: number): TakeProfitLevel[] {
  const slDistance = Math.abs(entry - sl);
  return [1.5, 2, 3].map(rr => {
    const tpDistance = slDistance * rr;
    const price = dir === 'long' ? entry + tpDistance : entry - tpDistance;
    return { rr, price: Math.round(price * 100) / 100, profit: Math.round(tpDistance * qty * 100) / 100 };
  });
}

// ============ VALIDATION ============

function validateInputs(input: PositionSizeInput): void {
  const { mode, capital, entryPrice, direction, riskPercent, stopLossPrice, quantity } = input;
  if (!capital || capital <= 0) throw new Error('Capital must be a positive number');
  if (!entryPrice || entryPrice <= 0) throw new Error('Entry price must be a positive number');
  if (direction !== 'long' && direction !== 'short') throw new Error("Direction must be 'long' or 'short'");

  switch (mode) {
    case 'riskOnly':
      if (riskPercent === undefined || riskPercent <= 0 || riskPercent > 100)
        throw new Error('riskOnly mode requires riskPercent (0-100)');
      break;
    case 'riskAndSL':
      if (riskPercent === undefined || riskPercent <= 0 || riskPercent > 100)
        throw new Error('riskAndSL mode requires riskPercent (0-100)');
      if (stopLossPrice === undefined || stopLossPrice <= 0)
        throw new Error('riskAndSL mode requires stopLossPrice');
      if (direction === 'long' && stopLossPrice >= entryPrice)
        throw new Error('For LONG positions, stopLossPrice must be below entryPrice');
      if (direction === 'short' && stopLossPrice <= entryPrice)
        throw new Error('For SHORT positions, stopLossPrice must be above entryPrice');
      break;
    case 'riskAndQty':
      if (riskPercent === undefined || riskPercent <= 0 || riskPercent > 100)
        throw new Error('riskAndQty mode requires riskPercent (0-100)');
      if (quantity === undefined || quantity <= 0)
        throw new Error('riskAndQty mode requires quantity');
      break;
    case 'slAndQty':
      if (stopLossPrice === undefined || stopLossPrice <= 0)
        throw new Error('slAndQty mode requires stopLossPrice');
      if (quantity === undefined || quantity <= 0)
        throw new Error('slAndQty mode requires quantity');
      if (direction === 'long' && stopLossPrice >= entryPrice)
        throw new Error('For LONG positions, stopLossPrice must be below entryPrice');
      if (direction === 'short' && stopLossPrice <= entryPrice)
        throw new Error('For SHORT positions, stopLossPrice must be above entryPrice');
      break;
    default:
      throw new Error(`Invalid mode: ${mode}. Must be: riskOnly, riskAndSL, riskAndQty, slAndQty`);
  }
}

// ============ MAIN CALCULATOR ============

export function calculatePositionSize(input: PositionSizeInput): PositionSizeOutput {
  validateInputs(input);
  const { mode, capital, entryPrice, direction, riskPercent, stopLossPrice, quantity } = input;
  const base = { mode, direction, entryPrice, capital };

  switch (mode) {
    case 'riskOnly': {
      const riskPct = riskPercent!;
      const riskAmount = (capital * riskPct) / 100;
      const suggestions: SuggestedPosition[] = [1, 2, 3, 5, 10].map(slPct => {
        const slDist = entryPrice * (slPct / 100);
        const sl = direction === 'long' ? entryPrice - slDist : entryPrice + slDist;
        return {
          slDistancePercent: slPct,
          stopLoss: Math.round(sl * 100) / 100,
          quantity: Math.round((riskAmount / slDist) * 10000) / 10000,
          slDistance: Math.round(slDist * 100) / 100,
        };
      });
      return { ...base, calculatedField: 'suggestions', riskPercent: riskPct, riskAmount: Math.round(riskAmount * 100) / 100, suggestions, riskLabel: getRiskLabel(riskPct), riskColor: getRiskColor(riskPct) };
    }
    case 'riskAndSL': {
      const riskPct = riskPercent!, sl = stopLossPrice!;
      const riskAmount = (capital * riskPct) / 100;
      const slDist = Math.abs(entryPrice - sl);
      const qty = riskAmount / slDist;
      return {
        ...base, calculatedField: 'quantity', riskPercent: riskPct, riskAmount: Math.round(riskAmount * 100) / 100,
        stopLoss: sl, slDistance: Math.round(slDist * 100) / 100, slDistancePercent: Math.round((slDist / entryPrice) * 10000) / 100,
        quantity: Math.round(qty * 10000) / 10000, positionValue: Math.round(qty * entryPrice * 100) / 100,
        takeProfits: calculateTakeProfits(entryPrice, sl, direction, qty), riskLabel: getRiskLabel(riskPct), riskColor: getRiskColor(riskPct),
      };
    }
    case 'riskAndQty': {
      const riskPct = riskPercent!, qty = quantity!;
      const riskAmount = (capital * riskPct) / 100;
      const slDist = riskAmount / qty;
      const sl = direction === 'long' ? entryPrice - slDist : entryPrice + slDist;
      return {
        ...base, calculatedField: 'stopLoss', riskPercent: riskPct, riskAmount: Math.round(riskAmount * 100) / 100,
        stopLoss: Math.round(sl * 100) / 100, slDistance: Math.round(slDist * 100) / 100, slDistancePercent: Math.round((slDist / entryPrice) * 10000) / 100,
        quantity: qty, positionValue: Math.round(qty * entryPrice * 100) / 100,
        takeProfits: calculateTakeProfits(entryPrice, sl, direction, qty), riskLabel: getRiskLabel(riskPct), riskColor: getRiskColor(riskPct),
      };
    }
    case 'slAndQty': {
      const sl = stopLossPrice!, qty = quantity!;
      const slDist = Math.abs(entryPrice - sl);
      const riskAmount = slDist * qty;
      const riskPct = (riskAmount / capital) * 100;
      return {
        ...base, calculatedField: 'riskPercent', riskPercent: Math.round(riskPct * 100) / 100, riskAmount: Math.round(riskAmount * 100) / 100,
        stopLoss: sl, slDistance: Math.round(slDist * 100) / 100, slDistancePercent: Math.round((slDist / entryPrice) * 10000) / 100,
        quantity: qty, positionValue: Math.round(qty * entryPrice * 100) / 100,
        takeProfits: calculateTakeProfits(entryPrice, sl, direction, qty), riskLabel: getRiskLabel(riskPct), riskColor: getRiskColor(riskPct),
      };
    }
  }
}

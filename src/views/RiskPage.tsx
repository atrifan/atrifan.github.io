import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { RiskIcon } from '../components/RiskIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

type TradeDirection = 'long' | 'short';
// 4 modes:
// riskOnly - given risk%, suggest multiple SL/Qty combinations
// riskAndSL - given risk% and SL, calculate quantity
// riskAndQty - given risk% and quantity, calculate SL
// slAndQty - given SL and quantity, calculate risk%
type CalculationMode = 'riskOnly' | 'riskAndSL' | 'riskAndQty' | 'slAndQty';

interface RiskResult {
  stopLoss: number;
  quantity: number;
  riskAmount: number;
  riskPercent: number;
  slDistance: number;
  slDistancePercent: number;
  takeProfits: { rr: number; price: number; profit: number }[];
  direction: TradeDirection;
  calculatedField: 'both' | 'quantity' | 'stopLoss' | 'riskPercent';
}

interface SuggestedPosition {
  slDistancePercent: number;
  stopLoss: number;
  quantity: number;
  slDistance: number;
}

interface RiskPageState {
  mode: CalculationMode;
  capital: string;
  entryPrice: string;
  direction: TradeDirection;
  riskPercent: string;
  stopLossPrice: string;
  quantity: string;
  result: RiskResult | null;
  suggestions: SuggestedPosition[] | null;
}

export class RiskPage extends Component<object, RiskPageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: object) {
    super(props);
    this.state = {
      mode: 'riskOnly',
      capital: '10000',
      entryPrice: '100',
      direction: 'long',
      riskPercent: '1',
      stopLossPrice: '',
      quantity: '',
      result: null,
      suggestions: null,
    };
  }

  componentDidMount() {
    applySEO('risk');
  }

  private scrollToResults = () => {
    setTimeout(() => {
      this.resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Mode 1: Risk % only → suggest multiple SL/Qty combinations
  private calculateRiskOnly = () => {
    const { capital, entryPrice, direction, riskPercent } = this.state;
    const cap = parseFloat(capital);
    const entry = parseFloat(entryPrice);
    const riskPct = parseFloat(riskPercent);

    if (!cap || !entry || !riskPct || riskPct <= 0) return;

    const riskAmount = (cap * riskPct) / 100;
    const slDistances = [1, 2, 3, 5, 10]; // Common SL distance percentages

    const suggestions: SuggestedPosition[] = slDistances.map(slPct => {
      const slDistance = entry * (slPct / 100);
      const stopLoss = direction === 'long' ? entry - slDistance : entry + slDistance;
      const quantity = riskAmount / slDistance;
      return { slDistancePercent: slPct, stopLoss, quantity, slDistance };
    });

    this.setState({ suggestions, result: null }, this.scrollToResults);
  };

  // Mode 2: Risk % + SL → Calculate Quantity
  private calculateQuantityFromRiskAndSL = () => {
    const { capital, entryPrice, direction, riskPercent, stopLossPrice } = this.state;
    const cap = parseFloat(capital);
    const entry = parseFloat(entryPrice);
    const riskPct = parseFloat(riskPercent);
    const sl = parseFloat(stopLossPrice);

    if (!cap || !entry || !riskPct || !sl) return;

    // Validate SL direction
    if (direction === 'long' && sl >= entry) {
      alert('For LONG positions, Stop Loss must be below Entry Price');
      return;
    }
    if (direction === 'short' && sl <= entry) {
      alert('For SHORT positions, Stop Loss must be above Entry Price');
      return;
    }

    const riskAmount = (cap * riskPct) / 100;
    const slDistance = Math.abs(entry - sl);
    const slDistancePercent = (slDistance / entry) * 100;
    const quantity = riskAmount / slDistance;

    const takeProfits = this.calculateTakeProfits(entry, sl, direction, quantity);

    this.setState({
      result: {
        stopLoss: sl,
        quantity,
        riskAmount,
        riskPercent: riskPct,
        slDistance,
        slDistancePercent,
        takeProfits,
        direction,
        calculatedField: 'quantity',
      },
      suggestions: null,
    }, this.scrollToResults);
  };

  // Mode 3: Risk % + Quantity → Calculate SL
  private calculateSLFromRiskAndQty = () => {
    const { capital, entryPrice, direction, riskPercent, quantity } = this.state;
    const cap = parseFloat(capital);
    const entry = parseFloat(entryPrice);
    const riskPct = parseFloat(riskPercent);
    const qty = parseFloat(quantity);

    if (!cap || !entry || !riskPct || !qty) return;

    const riskAmount = (cap * riskPct) / 100;
    const slDistance = riskAmount / qty;
    const slDistancePercent = (slDistance / entry) * 100;
    const stopLoss = direction === 'long' ? entry - slDistance : entry + slDistance;

    const takeProfits = this.calculateTakeProfits(entry, stopLoss, direction, qty);

    this.setState({
      result: {
        stopLoss,
        quantity: qty,
        riskAmount,
        riskPercent: riskPct,
        slDistance,
        slDistancePercent,
        takeProfits,
        direction,
        calculatedField: 'stopLoss',
      },
      suggestions: null,
    }, this.scrollToResults);
  };

  // Mode 4: SL + Quantity → Calculate Risk %
  private calculateRiskFromSLAndQty = () => {
    const { capital, entryPrice, direction, stopLossPrice, quantity } = this.state;
    const cap = parseFloat(capital);
    const entry = parseFloat(entryPrice);
    const sl = parseFloat(stopLossPrice);
    const qty = parseFloat(quantity);

    if (!cap || !entry || !sl || !qty) return;

    // Validate SL direction
    if (direction === 'long' && sl >= entry) {
      alert('For LONG positions, Stop Loss must be below Entry Price');
      return;
    }
    if (direction === 'short' && sl <= entry) {
      alert('For SHORT positions, Stop Loss must be above Entry Price');
      return;
    }

    const slDistance = Math.abs(entry - sl);
    const slDistancePercent = (slDistance / entry) * 100;
    const riskAmount = slDistance * qty;
    const riskPct = (riskAmount / cap) * 100;

    const takeProfits = this.calculateTakeProfits(entry, sl, direction, qty);

    this.setState({
      result: {
        stopLoss: sl,
        quantity: qty,
        riskAmount,
        riskPercent: riskPct,
        slDistance,
        slDistancePercent,
        takeProfits,
        direction,
        calculatedField: 'riskPercent',
      },
      suggestions: null,
    }, this.scrollToResults);
  };

  private calculateTakeProfits = (entry: number, sl: number, direction: TradeDirection, qty?: number) => {
    const slDistance = Math.abs(entry - sl);
    const rrLevels = [1.5, 2, 3];
    const quantity = qty || parseFloat(this.state.quantity) || 1;

    return rrLevels.map(rr => {
      const tpDistance = slDistance * rr;
      const price = direction === 'long' ? entry + tpDistance : entry - tpDistance;
      const profit = tpDistance * quantity;
      return { rr, price, profit };
    });
  };

  private getRiskColor = (riskPct: number): string => {
    if (riskPct <= 1) return '#22c55e'; // Green
    if (riskPct <= 3) return '#eab308'; // Yellow
    return '#ef4444'; // Red
  };

  private getRiskLabel = (riskPct: number): string => {
    if (riskPct <= 1) return 'Low Risk ✓';
    if (riskPct <= 3) return 'Moderate Risk ⚠️';
    return 'High Risk ⛔';
  };

  private formatNumber = (num: number, decimals = 2): string => {
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  render() {
    const { mode, capital, entryPrice, direction, riskPercent, stopLossPrice, quantity, result } = this.state;
    const gradient = 'linear-gradient(135deg, #eab308 0%, #f59e0b 50%, #ef4444 100%)';
    const inputStyle: React.CSSProperties = { width: '100%', padding: '0.875rem', fontSize: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', textAlign: 'center', colorScheme: 'dark', boxSizing: 'border-box' };
    const labelStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginBottom: '0.25rem', display: 'block' };

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #422006 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.riskTop} format="horizontal" /></View>

          {/* Header */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.25rem' }}><RiskIcon size={60} /></div>
            <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>RISK</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.25rem', fontSize: 'clamp(0.8rem, 2.5vw, 1rem)' }}>Trading Risk Management Calculator</p>
          </View>

          {/* Disclaimer */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <DisclaimerBanner
              title="Financial Disclaimer"
              message="This calculator is for educational purposes only and is NOT financial advice. Trading involves substantial risk of loss and is not suitable for all investors. Past performance is not indicative of future results. Always consult a qualified financial advisor before making investment decisions."
              color="#eab308"
            />
          </View>

          {/* Mode Selector */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
              {(['riskOnly', 'riskAndSL', 'riskAndQty', 'slAndQty'] as CalculationMode[]).map(m => {
                const labels: Record<CalculationMode, string> = {
                  riskOnly: '📊 Risk % → Suggestions',
                  riskAndSL: '🎯 Risk + SL → Qty',
                  riskAndQty: '📦 Risk + Qty → SL',
                  slAndQty: '⚖️ SL + Qty → Risk %',
                };
                return (
                  <button key={m} onClick={() => this.setState({ mode: m, result: null, suggestions: null })}
                    style={{ padding: '0.75rem', fontSize: '0.8rem', fontWeight: 600, background: mode === m ? gradient : 'rgba(255,255,255,0.1)', color: '#fff', border: mode === m ? 'none' : '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', cursor: 'pointer' }}>
                    {labels[m]}
                  </button>
                );
              })}
            </div>
          </View>

          {/* Input Form */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', background: 'rgba(255,255,255,0.08)', borderRadius: '20px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.15)' }}>
            {/* Common Inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={labelStyle}>💰 Capital ($)</label>
                <input type="number" value={capital} onChange={(e) => this.setState({ capital: e.target.value })} style={inputStyle} placeholder="Your total capital" />
              </div>
              <div>
                <label style={labelStyle}>📈 Entry Price ($)</label>
                <input type="number" value={entryPrice} onChange={(e) => this.setState({ entryPrice: e.target.value })} style={inputStyle} placeholder="Asset entry price" />
              </div>
            </div>

            {/* Direction */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>📍 Position Direction</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button onClick={() => this.setState({ direction: 'long' })}
                  style={{ padding: '0.875rem', fontSize: '1rem', fontWeight: 700, background: direction === 'long' ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'rgba(255,255,255,0.1)', color: '#fff', border: direction === 'long' ? 'none' : '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', cursor: 'pointer' }}>
                  🟢 LONG (Buy)
                </button>
                <button onClick={() => this.setState({ direction: 'short' })}
                  style={{ padding: '0.875rem', fontSize: '1rem', fontWeight: 700, background: direction === 'short' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'rgba(255,255,255,0.1)', color: '#fff', border: direction === 'short' ? 'none' : '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', cursor: 'pointer' }}>
                  🔴 SHORT (Sell)
                </button>
              </div>
            </div>

            {/* Mode-specific inputs */}
            {(mode === 'riskOnly' || mode === 'riskAndSL' || mode === 'riskAndQty') && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>⚠️ Risk Percentage (%)</label>
                <input type="number" value={riskPercent} onChange={(e) => this.setState({ riskPercent: e.target.value })} style={inputStyle} placeholder="e.g. 1-2%" step="0.5" min="0.1" max="100" />
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Recommended: 1-2% per trade</span>
              </div>
            )}

            {(mode === 'riskAndSL' || mode === 'slAndQty') && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>🛑 Stop Loss Price ($)</label>
                <input type="number" value={stopLossPrice} onChange={(e) => this.setState({ stopLossPrice: e.target.value })} style={inputStyle} placeholder={direction === 'long' ? 'Price below entry' : 'Price above entry'} />
              </div>
            )}

            {(mode === 'riskAndQty' || mode === 'slAndQty') && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>📦 Quantity (Units)</label>
                <input type="number" value={quantity} onChange={(e) => this.setState({ quantity: e.target.value })} style={inputStyle} placeholder="Number of units" />
              </div>
            )}

            <button onClick={() => {
              if (mode === 'riskOnly') this.calculateRiskOnly();
              else if (mode === 'riskAndSL') this.calculateQuantityFromRiskAndSL();
              else if (mode === 'riskAndQty') this.calculateSLFromRiskAndQty();
              else this.calculateRiskFromSLAndQty();
            }}
              style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
              Calculate
            </button>
          </View>

          {this.state.suggestions && this.renderSuggestions()}
          {result && this.renderResults(result)}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.riskFooter} format="horizontal" /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><Footer /></View>
        </Flex>
      </View>
    );
  }

  private renderSuggestions() {
    const { suggestions, capital, riskPercent, direction, entryPrice } = this.state;
    if (!suggestions) return null;

    const riskAmount = (parseFloat(capital) * parseFloat(riskPercent)) / 100;
    const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.25rem', marginBottom: '1rem' };

    return (
      <div ref={this.resultsRef} style={{ width: '100%', maxWidth: '600px' }}>
        <AdBanner slot={ADS_CONFIG.slots.riskResults} format="horizontal" />

        {/* Summary */}
        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #eab30833 0%, #f59e0b1a 100%)', border: '2px solid #eab308' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#eab308', marginBottom: '0.5rem' }}>
              {riskPercent}% Risk = ${this.formatNumber(riskAmount)}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)' }}>
              Entry: ${entryPrice} | Direction: {direction.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Suggestions Table */}
        <div style={cardStyle}>
          <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontSize: '1rem' }}>📊 Position Options (Choose One)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {suggestions.map((s, i) => {
              const colors = ['#22c55e', '#10b981', '#059669', '#0d9488', '#0891b2'];
              return (
                <div key={s.slDistancePercent} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', background: `${colors[i]}22`, padding: '1rem', borderRadius: '12px', border: `1px solid ${colors[i]}66`, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>SL Distance</div>
                    <div style={{ color: colors[i], fontWeight: 700 }}>{s.slDistancePercent}%</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>Stop Loss</div>
                    <div style={{ color: '#ef4444', fontWeight: 700 }}>${this.formatNumber(s.stopLoss)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>Quantity</div>
                    <div style={{ color: '#60a5fa', fontWeight: 700 }}>{this.formatNumber(s.quantity, 4)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tips */}
        <div style={{ ...cardStyle, background: 'rgba(255,255,255,0.05)' }}>
          <h3 style={{ color: '#a78bfa', margin: '0 0 0.75rem 0', fontSize: '1rem' }}>💡 How to Use</h3>
          <ul style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0, paddingLeft: '1.25rem' }}>
            <li>Tighter SL (1-2%) = More quantity, but higher chance of being stopped out</li>
            <li>Wider SL (5-10%) = Less quantity, but more room for price movement</li>
            <li>Choose based on your technical analysis and support/resistance levels</li>
          </ul>
        </div>
      </div>
    );
  }

  private renderResults(result: RiskResult) {
    const riskColor = this.getRiskColor(result.riskPercent);
    const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.25rem', marginBottom: '1rem' };
    const highlightColor = result.calculatedField === 'quantity' ? '#60a5fa' : result.calculatedField === 'stopLoss' ? '#ef4444' : '#eab308';

    return (
      <div ref={this.resultsRef} style={{ width: '100%', maxWidth: '600px' }}>
        <AdBanner slot={ADS_CONFIG.slots.riskResults} format="horizontal" />

        {/* Risk Assessment */}
        <div style={{ ...cardStyle, background: `linear-gradient(135deg, ${riskColor}33 0%, ${riskColor}1a 100%)`, border: `2px solid ${riskColor}` }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', fontWeight: 900, color: riskColor }}>{result.riskPercent.toFixed(2)}%</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: riskColor, marginBottom: '0.5rem' }}>{this.getRiskLabel(result.riskPercent)}</div>
            <div style={{ color: 'rgba(255,255,255,0.7)' }}>Risk Amount: <strong style={{ color: '#fff' }}>${this.formatNumber(result.riskAmount)}</strong></div>
          </div>
        </div>

        {/* Position Details */}
        <div style={cardStyle}>
          <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontSize: '1rem' }}>📊 Position Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div style={{ background: result.calculatedField === 'stopLoss' ? `${highlightColor}22` : 'rgba(255,255,255,0.08)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: result.calculatedField === 'stopLoss' ? `2px solid ${highlightColor}` : 'none' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>🛑 Stop Loss {result.calculatedField === 'stopLoss' && '✨'}</div>
              <div style={{ color: '#ef4444', fontSize: '1.3rem', fontWeight: 700 }}>${this.formatNumber(result.stopLoss)}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>-{result.slDistancePercent.toFixed(2)}% from entry</div>
            </div>
            <div style={{ background: result.calculatedField === 'quantity' ? `${highlightColor}22` : 'rgba(255,255,255,0.08)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: result.calculatedField === 'quantity' ? `2px solid ${highlightColor}` : 'none' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>📦 Quantity {result.calculatedField === 'quantity' && '✨'}</div>
              <div style={{ color: '#60a5fa', fontSize: '1.3rem', fontWeight: 700 }}>{this.formatNumber(result.quantity, 4)}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>units</div>
            </div>
          </div>
        </div>

        {/* Take Profit Zones */}
        <div style={cardStyle}>
          <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontSize: '1rem' }}>🎯 Take Profit Zones (Risk:Reward)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {result.takeProfits.map((tp, i) => {
              const colors = ['#22c55e', '#10b981', '#059669'];
              return (
                <div key={tp.rr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${colors[i]}22`, padding: '1rem', borderRadius: '12px', border: `1px solid ${colors[i]}66` }}>
                  <div>
                    <span style={{ color: colors[i], fontWeight: 700, fontSize: '1.1rem' }}>1:{tp.rr} RR</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: '0.5rem', fontSize: '0.85rem' }}>{tp.rr >= 1.5 ? '✓ Recommended' : ''}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#fff', fontWeight: 700 }}>${this.formatNumber(tp.price)}</div>
                    <div style={{ color: colors[i], fontSize: '0.85rem' }}>+${this.formatNumber(tp.rr * result.riskAmount)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tips */}
        <div style={{ ...cardStyle, background: 'rgba(255,255,255,0.05)' }}>
          <h3 style={{ color: '#a78bfa', margin: '0 0 0.75rem 0', fontSize: '1rem' }}>💡 Risk Management Tips</h3>
          <ul style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0, paddingLeft: '1.25rem' }}>
            <li>Never risk more than <strong>1-2%</strong> of your capital per trade</li>
            <li>Aim for at least <strong>1.5:1</strong> reward-to-risk ratio</li>
            <li>These calculations are <strong>independent of leverage</strong></li>
            <li>Always use stop losses to protect your capital</li>
          </ul>
        </div>
      </div>
    );
  }
}

import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { RiskIcon } from '../components/RiskIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

type TradeDirection = 'long' | 'short';
type CalculationMode = 'riskToSL' | 'slToRisk';

interface RiskResult {
  stopLoss: number;
  quantity: number;
  riskAmount: number;
  riskPercent: number;
  takeProfits: { rr: number; price: number; profit: number }[];
  direction: TradeDirection;
}

interface RiskPageState {
  mode: CalculationMode;
  capital: string;
  entryPrice: string;
  direction: TradeDirection;
  // Mode 1: Risk % to SL/Quantity
  riskPercent: string;
  // Mode 2: SL to Risk %
  stopLossPrice: string;
  quantity: string;
  result: RiskResult | null;
}

export class RiskPage extends Component<object, RiskPageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: object) {
    super(props);
    this.state = {
      mode: 'riskToSL',
      capital: '10000',
      entryPrice: '100',
      direction: 'long',
      riskPercent: '1',
      stopLossPrice: '',
      quantity: '',
      result: null,
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

  private calculateFromRisk = () => {
    const { capital, entryPrice, direction, riskPercent } = this.state;
    const cap = parseFloat(capital);
    const entry = parseFloat(entryPrice);
    const riskPct = parseFloat(riskPercent);

    if (!cap || !entry || !riskPct || riskPct <= 0) return;

    const riskAmount = (cap * riskPct) / 100;
    // For a 1% risk, we need to determine SL distance
    // User can choose quantity, then SL is calculated, or vice versa
    // Default: assume user wants to risk X% with maximum position
    // SL distance = riskAmount / quantity
    // Let's calculate for different position sizes

    // Simple approach: Calculate SL at 2% distance from entry (common default)
    // Then calculate quantity based on that
    const slDistancePercent = 2; // 2% default SL distance
    const slDistance = entry * (slDistancePercent / 100);
    const stopLoss = direction === 'long' ? entry - slDistance : entry + slDistance;
    const quantity = riskAmount / slDistance;

    const takeProfits = this.calculateTakeProfits(entry, stopLoss, direction);

    this.setState({
      result: {
        stopLoss,
        quantity,
        riskAmount,
        riskPercent: riskPct,
        takeProfits,
        direction,
      },
    }, this.scrollToResults);
  };

  private calculateFromSL = () => {
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
    const riskAmount = slDistance * qty;
    const riskPct = (riskAmount / cap) * 100;

    const takeProfits = this.calculateTakeProfits(entry, sl, direction);

    this.setState({
      result: {
        stopLoss: sl,
        quantity: qty,
        riskAmount,
        riskPercent: riskPct,
        takeProfits,
        direction,
      },
    }, this.scrollToResults);
  };

  private calculateTakeProfits = (entry: number, sl: number, direction: TradeDirection) => {
    const slDistance = Math.abs(entry - sl);
    const rrLevels = [1.5, 2, 3];

    return rrLevels.map(rr => {
      const tpDistance = slDistance * rr;
      const price = direction === 'long' ? entry + tpDistance : entry - tpDistance;
      const profit = tpDistance * (this.state.result?.quantity || parseFloat(this.state.quantity) || 1);
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
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.riskTop} format="horizontal" /></View>

          {/* Header */}
          <View UNSAFE_style={{ textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}><RiskIcon size={80} /></div>
            <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>RISK</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.5rem' }}>Trading Risk Management Calculator</p>
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
              {(['riskToSL', 'slToRisk'] as CalculationMode[]).map(m => (
                <button key={m} onClick={() => this.setState({ mode: m, result: null })}
                  style={{ padding: '1rem', fontSize: '0.9rem', fontWeight: 600, background: mode === m ? gradient : 'rgba(255,255,255,0.1)', color: '#fff', border: mode === m ? 'none' : '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', cursor: 'pointer' }}>
                  {m === 'riskToSL' ? '📊 Risk % → SL & Qty' : '🎯 SL & Qty → Risk %'}
                </button>
              ))}
            </div>
          </View>

          {/* Input Form */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px', background: 'rgba(255,255,255,0.08)', borderRadius: '20px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.15)' }}>
            {/* Common Inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={labelStyle}>💰 Capital ($)</label>
                <input type="number" value={capital} onChange={(e) => this.setState({ capital: e.target.value })} style={inputStyle} placeholder="10000" />
              </div>
              <div>
                <label style={labelStyle}>📈 Entry Price ($)</label>
                <input type="number" value={entryPrice} onChange={(e) => this.setState({ entryPrice: e.target.value })} style={inputStyle} placeholder="100" />
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
            {mode === 'riskToSL' ? (
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>⚠️ Risk Percentage (%)</label>
                <input type="number" value={riskPercent} onChange={(e) => this.setState({ riskPercent: e.target.value })} style={inputStyle} placeholder="1" step="0.5" min="0.1" max="100" />
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Recommended: 1-2% per trade</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={labelStyle}>🛑 Stop Loss Price ($)</label>
                  <input type="number" value={stopLossPrice} onChange={(e) => this.setState({ stopLossPrice: e.target.value })} style={inputStyle} placeholder={direction === 'long' ? '95' : '105'} />
                </div>
                <div>
                  <label style={labelStyle}>📦 Quantity (Units)</label>
                  <input type="number" value={quantity} onChange={(e) => this.setState({ quantity: e.target.value })} style={inputStyle} placeholder="100" />
                </div>
              </div>
            )}

            <button onClick={mode === 'riskToSL' ? this.calculateFromRisk : this.calculateFromSL}
              style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
              Calculate Risk
            </button>
          </View>

          {result && this.renderResults(result)}

          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><AdBanner slot={ADS_CONFIG.slots.riskFooter} format="horizontal" /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '600px' }}><Footer /></View>
        </Flex>
      </View>
    );
  }

  private renderResults(result: RiskResult) {
    const riskColor = this.getRiskColor(result.riskPercent);
    const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.25rem', marginBottom: '1rem' };

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
            <div style={{ background: 'rgba(255,255,255,0.08)', padding: '1rem', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>🛑 Stop Loss</div>
              <div style={{ color: '#ef4444', fontSize: '1.3rem', fontWeight: 700 }}>${this.formatNumber(result.stopLoss)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.08)', padding: '1rem', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>📦 Quantity</div>
              <div style={{ color: '#60a5fa', fontSize: '1.3rem', fontWeight: 700 }}>{this.formatNumber(result.quantity, 4)}</div>
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

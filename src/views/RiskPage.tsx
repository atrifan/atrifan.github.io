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
import {
  calculatePositionSize,
  CalculationMode,
  TradeDirection,
  PositionSizeOutput,
  SuggestedPosition,
} from '../utils/PositionSizeCalculator';

interface RiskPageState {
  mode: CalculationMode;
  capital: string;
  entryPrice: string;
  direction: TradeDirection;
  riskPercent: string;
  stopLossPrice: string;
  quantity: string;
  result: PositionSizeOutput | null;
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

  // Unified calculation using shared calculator
  private calculate = () => {
    const { mode, capital, entryPrice, direction, riskPercent, stopLossPrice, quantity } = this.state;
    const cap = parseFloat(capital);
    const entry = parseFloat(entryPrice);
    const riskPct = parseFloat(riskPercent);
    const sl = parseFloat(stopLossPrice);
    const qty = parseFloat(quantity);

    if (!cap || !entry) {
      alert('Please enter capital and entry price');
      return;
    }

    try {
      const result = calculatePositionSize({
        mode,
        capital: cap,
        entryPrice: entry,
        direction,
        riskPercent: riskPct || undefined,
        stopLossPrice: sl || undefined,
        quantity: qty || undefined,
      });
      this.setState({ result }, this.scrollToResults);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Calculation error');
    }
  };

  private getRiskLabelWithEmoji = (riskPct: number): string => {
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
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}><AdBanner slot={ADS_CONFIG.slots.riskTop} format="horizontal" /></View>

          {/* Header */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.25rem' }}><RiskIcon size={60} /></div>
            <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>RISK</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.25rem', fontSize: 'clamp(0.8rem, 2.5vw, 1rem)' }}>Trading Risk Management Calculator</p>
          </View>

          {/* Disclaimer */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
            <DisclaimerBanner
              title="Financial Disclaimer"
              message="This calculator is for educational purposes only and is NOT financial advice. Trading involves substantial risk of loss and is not suitable for all investors. Past performance is not indicative of future results. Always consult a qualified financial advisor before making investment decisions."
              color="#eab308"
            />
          </View>

          {/* Mode Selector */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
              {(['riskOnly', 'riskAndSL', 'riskAndQty', 'slAndQty'] as CalculationMode[]).map(m => {
                const labels: Record<CalculationMode, string> = {
                  riskOnly: '📊 Risk % → Suggestions',
                  riskAndSL: '🎯 Risk + SL → Qty',
                  riskAndQty: '📦 Risk + Qty → SL',
                  slAndQty: '⚖️ SL + Qty → Risk %',
                };
                return (
                  <button key={m} onClick={() => this.setState({ mode: m, result: null })}
                    style={{ padding: '0.75rem', fontSize: '0.8rem', fontWeight: 600, background: mode === m ? gradient : 'rgba(255,255,255,0.1)', color: '#fff', border: mode === m ? 'none' : '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', cursor: 'pointer' }}>
                    {labels[m]}
                  </button>
                );
              })}
            </div>
          </View>

          {/* Input Form */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', background: 'rgba(255,255,255,0.08)', borderRadius: '20px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.15)' }}>
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

            <button onClick={this.calculate}
              style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', fontWeight: 700, background: gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
              Calculate
            </button>
          </View>

          {result && result.calculatedField === 'suggestions' && this.renderSuggestions(result)}
          {result && result.calculatedField !== 'suggestions' && this.renderResults(result)}

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}><AdBanner slot={ADS_CONFIG.slots.riskFooter} format="horizontal" /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}><Footer /></View>
        </Flex>
      </View>
    );
  }

  private renderSuggestions(result: PositionSizeOutput) {
    const suggestions = result.suggestions || [];
    const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.25rem', marginBottom: '1rem' };

    return (
      <div ref={this.resultsRef} style={{ width: '100%', maxWidth: '38rem' }}>
        <AdBanner slot={ADS_CONFIG.slots.riskResults} format="horizontal" />

        {/* Summary */}
        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #eab30833 0%, #f59e0b1a 100%)', border: '2px solid #eab308' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#eab308', marginBottom: '0.5rem' }}>
              {result.riskPercent}% Risk = ${this.formatNumber(result.riskAmount)}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)' }}>
              Entry: ${result.entryPrice} | Direction: {result.direction.toUpperCase()}
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

  private renderResults(result: PositionSizeOutput) {
    const riskColor = result.riskColor;
    const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.25rem', marginBottom: '1rem' };
    const highlightColor = result.calculatedField === 'quantity' ? '#60a5fa' : result.calculatedField === 'stopLoss' ? '#ef4444' : '#eab308';

    const takeProfits = result.takeProfits || [];

    return (
      <div ref={this.resultsRef} style={{ width: '100%', maxWidth: '38rem' }}>
        <AdBanner slot={ADS_CONFIG.slots.riskResults} format="horizontal" />

        {/* Risk Assessment */}
        <div style={{ ...cardStyle, background: `linear-gradient(135deg, ${riskColor}33 0%, ${riskColor}1a 100%)`, border: `2px solid ${riskColor}` }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', fontWeight: 900, color: riskColor }}>{result.riskPercent.toFixed(2)}%</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: riskColor, marginBottom: '0.5rem' }}>{this.getRiskLabelWithEmoji(result.riskPercent)}</div>
            <div style={{ color: 'rgba(255,255,255,0.7)' }}>Risk Amount: <strong style={{ color: '#fff' }}>${this.formatNumber(result.riskAmount)}</strong></div>
          </div>
        </div>

        {/* Position Details */}
        <div style={cardStyle}>
          <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontSize: '1rem' }}>📊 Position Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div style={{ background: result.calculatedField === 'stopLoss' ? `${highlightColor}22` : 'rgba(255,255,255,0.08)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: result.calculatedField === 'stopLoss' ? `2px solid ${highlightColor}` : 'none' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>🛑 Stop Loss {result.calculatedField === 'stopLoss' && '✨'}</div>
              <div style={{ color: '#ef4444', fontSize: '1.3rem', fontWeight: 700 }}>${this.formatNumber(result.stopLoss || 0)}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>-{(result.slDistancePercent || 0).toFixed(2)}% from entry</div>
            </div>
            <div style={{ background: result.calculatedField === 'quantity' ? `${highlightColor}22` : 'rgba(255,255,255,0.08)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: result.calculatedField === 'quantity' ? `2px solid ${highlightColor}` : 'none' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>📦 Quantity {result.calculatedField === 'quantity' && '✨'}</div>
              <div style={{ color: '#60a5fa', fontSize: '1.3rem', fontWeight: 700 }}>{this.formatNumber(result.quantity || 0, 4)}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>units</div>
            </div>
          </div>
        </div>

        {/* Take Profit Zones */}
        <div style={cardStyle}>
          <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontSize: '1rem' }}>🎯 Take Profit Zones (Risk:Reward)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {takeProfits.map((tp, i) => {
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

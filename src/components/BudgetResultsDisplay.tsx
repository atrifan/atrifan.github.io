import { Component, createRef, RefObject } from 'react';
import { View } from '@adobe/react-spectrum';
import { SavingsPlan, Currency, CURRENCY_SYMBOLS } from '../types/budget';
import { ShareResults } from './ShareResults';

interface BudgetResultsDisplayProps {
  plan: SavingsPlan;
  currency: Currency;
  onReset: () => void;
}

interface BudgetResultsDisplayState {
  showAllMonths: boolean;
  activeTooltip: string | null;
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(0.625rem)',
  borderRadius: '1.25rem',
  padding: '1.5rem',
  border: '0.0625rem solid rgba(255, 255, 255, 0.15)',
};

const statStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '1rem',
};

// Tooltip definitions
const TOOLTIPS: Record<string, { yearly: string; other: string } | string> = {
  start: {
    yearly: 'Start: Your actual balance at the beginning of the month. For yearly compounding, interest is only credited after 12 months.',
    other: 'Start: Your actual balance at the beginning of the month, including previously credited interest.',
  },
  save: 'Save: The amount you add from your pocket at the end of each month.',
  interest: {
    yearly: 'Interest: Hypothetical interest you would receive if you closed the deposit at the end of this month.',
    other: 'Interest: Actual interest credited to your account this month.',
  },
  total: 'Total: The amount you would have if you closed the savings account at the end of this month (including interest).',
};

export class BudgetResultsDisplay extends Component<BudgetResultsDisplayProps, BudgetResultsDisplayState> {
  private containerRef: RefObject<HTMLDivElement>;
  private shareableRef: RefObject<HTMLDivElement>;

  constructor(props: BudgetResultsDisplayProps) {
    super(props);
    this.state = {
      showAllMonths: false,
      activeTooltip: null,
    };
    this.containerRef = createRef<HTMLDivElement>();
    this.shareableRef = createRef<HTMLDivElement>();
    this.handleClickOutside = this.handleClickOutside.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
  }

  componentDidMount() {
    document.addEventListener('click', this.handleClickOutside);
    document.addEventListener('scroll', this.handleScroll, true);
  }

  componentWillUnmount() {
    document.removeEventListener('click', this.handleClickOutside);
    document.removeEventListener('scroll', this.handleScroll, true);
  }

  private handleClickOutside(event: MouseEvent) {
    if (this.state.activeTooltip && this.containerRef.current) {
      const target = event.target as Node;
      const tooltipButtons = this.containerRef.current.querySelectorAll('[data-tooltip-trigger]');
      let clickedOnTrigger = false;
      tooltipButtons.forEach((btn) => {
        if (btn.contains(target)) clickedOnTrigger = true;
      });
      if (!clickedOnTrigger) {
        this.setState({ activeTooltip: null });
      }
    }
  }

  private handleScroll() {
    if (this.state.activeTooltip) {
      this.setState({ activeTooltip: null });
    }
  }

  private toggleTooltip(id: string) {
    this.setState((prev) => ({
      activeTooltip: prev.activeTooltip === id ? null : id,
    }));
  }

  private getTooltipText(id: string): string {
    const tooltip = TOOLTIPS[id];
    if (typeof tooltip === 'string') return tooltip;
    const isYearly = this.props.plan.compoundingFrequency === 'yearly';
    return isYearly ? tooltip.yearly : tooltip.other;
  }

  private renderTooltipHeader(label: string, id: string, align: 'left' | 'right' = 'right') {
    return (
      <th style={{ padding: '0.5rem', textAlign: align, color: 'rgba(255,255,255,0.7)' }}>
        <button
          data-tooltip-trigger
          onClick={(e) => { e.stopPropagation(); this.toggleTooltip(id); }}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
            font: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            whiteSpace: 'nowrap',
          }}
        >
          {label} <span style={{ fontSize: '0.7rem' }}>ℹ️</span>
        </button>
      </th>
    );
  }

  private renderTooltipModal() {
    const { activeTooltip } = this.state;
    if (!activeTooltip) return null;

    const labels: Record<string, string> = {
      start: 'Start Balance',
      save: 'Monthly Savings',
      interest: 'Interest Earned',
      total: 'Total Balance',
    };

    return (
      <div
        onClick={() => this.setState({ activeTooltip: null })}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'rgba(15, 23, 42, 0.98)',
            border: '0.0625rem solid rgba(255,255,255,0.3)',
            borderRadius: '1rem',
            padding: '1.25rem',
            maxWidth: '20rem',
            width: '100%',
            boxShadow: '0 1rem 3rem rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ color: '#fff', margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
              {labels[activeTooltip] || activeTooltip}
            </h4>
            <button
              onClick={() => this.setState({ activeTooltip: null })}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#fff',
                width: '2rem',
                height: '2rem',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              ✕
            </button>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.85)', margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
            {this.getTooltipText(activeTooltip)}
          </p>
        </div>
      </div>
    );
  }

  private formatCurrency(amount: number): string {
    const symbol = CURRENCY_SYMBOLS[this.props.currency];
    // Use fixed 2 decimals, then format with proper separators
    const formatted = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${symbol}${formatted}`;
  }

  private formatCurrencyPrecise(amount: number): string {
    const symbol = CURRENCY_SYMBOLS[this.props.currency];
    // Use 2 decimals consistently
    const formatted = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${symbol}${formatted}`;
  }

  render() {
    const { plan, onReset } = this.props;

    return (
      <View UNSAFE_style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Warnings */}
        {plan.warnings.length > 0 && (
          <div style={{ ...cardStyle, background: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
            {plan.warnings.map((warning, i) => (
              <p key={i} style={{ color: '#fca5a5', margin: '0.5rem 0', fontSize: '1rem' }}>{warning}</p>
            ))}
          </div>
        )}

        {/* Shareable Content Container */}
        <div ref={this.shareableRef} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.25) 50%, rgba(4, 120, 87, 0.15) 100%)', padding: '1.5rem', borderRadius: '1.5rem', border: '0.0625rem solid rgba(16, 185, 129, 0.3)' }}>

        {/* Main Stats */}
        <div style={cardStyle}>
          <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 800, textAlign: 'center', marginBottom: '1.5rem' }}>
            📊 Your Savings Plan
            {plan.savingsMode === 'duration' && <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)', display: 'block', marginTop: '0.25rem' }}>({plan.monthsToGoal} month savings projection)</span>}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(6.25rem, 1fr))', gap: '0.75rem' }}>
            <div style={{ ...statStyle, padding: '0.75rem', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '0.75rem' }}>
              <div style={{ fontSize: 'clamp(1.3rem, 5vw, 2rem)', fontWeight: 800, color: '#10b981', wordBreak: 'break-word' }}>
                {this.formatCurrency(plan.monthlyTargetSavings)}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>Save Monthly</div>
            </div>
            <div style={{ ...statStyle, padding: '0.75rem', background: 'rgba(251, 191, 36, 0.15)', borderRadius: '0.75rem' }}>
              <div style={{ fontSize: 'clamp(1.3rem, 5vw, 2rem)', fontWeight: 800, color: '#fbbf24', wordBreak: 'break-word' }}>
                {this.formatCurrency(plan.finalBalance)}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
                {plan.savingsMode === 'duration' ? 'Final Balance' : 'Goal Amount'}
              </div>
            </div>
            <div style={{ ...statStyle, padding: '0.75rem', background: 'rgba(96, 165, 250, 0.15)', borderRadius: '0.75rem' }}>
              <div style={{ fontSize: 'clamp(1.3rem, 5vw, 2rem)', fontWeight: 800, color: '#60a5fa' }}>
                {plan.monthsToGoal}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
                {plan.savingsMode === 'duration' ? 'Months' : 'Months to Goal'}
              </div>
            </div>
          </div>

          {/* Interest Summary */}
          {plan.interestEnabled && plan.totalInterestEarned > 0 && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399' }}>
                +{this.formatCurrency(plan.totalInterestEarned)} 📈
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>
                Interest Earned ({plan.annualInterestRate}% {plan.compoundingFrequency} compounding)
              </div>
              {/* Interest Rate Breakdown */}
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', textAlign: 'left' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>📊 Rate Breakdown:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(5rem, 1fr))', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(52, 211, 153, 0.1)', borderRadius: '0.5rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Daily</div>
                    <div style={{ color: '#34d399', fontWeight: 600, fontSize: 'clamp(0.7rem, 2.5vw, 0.85rem)' }}>{(plan.annualInterestRate! / 365).toFixed(4)}%</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', wordBreak: 'break-word' }}>
                      ≈ {this.formatCurrencyPrecise(plan.monthlyTargetSavings * (plan.annualInterestRate! / 100 / 365))}/day
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(52, 211, 153, 0.1)', borderRadius: '0.5rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Monthly</div>
                    <div style={{ color: '#34d399', fontWeight: 600, fontSize: 'clamp(0.7rem, 2.5vw, 0.85rem)' }}>{(plan.annualInterestRate! / 12).toFixed(3)}%</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', wordBreak: 'break-word' }}>
                      ≈ {this.formatCurrencyPrecise(plan.monthlyTargetSavings * (plan.annualInterestRate! / 100 / 12))}/mo
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(52, 211, 153, 0.1)', borderRadius: '0.5rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Yearly</div>
                    <div style={{ color: '#34d399', fontWeight: 600, fontSize: 'clamp(0.7rem, 2.5vw, 0.85rem)' }}>{plan.annualInterestRate}%</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', wordBreak: 'break-word' }}>
                      ≈ {this.formatCurrencyPrecise(plan.monthlyTargetSavings * 12 * (plan.annualInterestRate! / 100))}/yr
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Budget Breakdown - What You Have Left to Spend */}
        <div style={cardStyle}>
          <h3 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            💸 Your Spending Money
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 0.5rem 0' }}>
            After savings &amp; fixed expenses, this is your flexible spending budget
          </p>
          <div style={{
            background: 'rgba(167, 139, 250, 0.1)',
            borderRadius: '0.5rem',
            padding: '0.5rem 0.75rem',
            marginBottom: '1rem',
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.7)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span>💡</span>
            <span>For fun, entertainment, dining out, shopping &amp; unexpected expenses</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(6.25rem, 1fr))', gap: '0.75rem', textAlign: 'center' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(167, 139, 250, 0.15)', borderRadius: '0.75rem' }}>
              <div style={{ fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', fontWeight: 700, color: '#a78bfa', wordBreak: 'break-word' }}>
                {this.formatCurrency(plan.weeklyBudgetForLiving)}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>Weekly</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'rgba(244, 114, 182, 0.15)', borderRadius: '0.75rem' }}>
              <div style={{ fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', fontWeight: 700, color: '#f472b6', wordBreak: 'break-word' }}>
                {this.formatCurrency(plan.dailyBudgetForLiving)}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>Daily</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'rgba(52, 211, 153, 0.15)', borderRadius: '0.75rem' }}>
              <div style={{ fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', fontWeight: 700, color: '#34d399', wordBreak: 'break-word' }}>
                {plan.targetDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>Target Date</div>
            </div>
          </div>
        </div>

        {/* Advanced Analysis */}
        {plan.estimatedMonthlyDiningOut !== undefined && (
          <div style={cardStyle}>
            <h3 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, marginBottom: '1rem' }}>
              🔬 Lifestyle Analysis
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(6.25rem, 1fr))', gap: '0.75rem' }}>
              <div style={{ ...statStyle, padding: '0.75rem', background: 'rgba(251, 146, 60, 0.15)', borderRadius: '0.75rem' }}>
                <div style={{ fontSize: 'clamp(1.1rem, 4vw, 1.4rem)', fontWeight: 700, color: '#fb923c', wordBreak: 'break-word' }}>
                  {this.formatCurrency(plan.estimatedMonthlyDiningOut!)}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Est. Dining Out</div>
              </div>
              <div style={{ ...statStyle, padding: '0.75rem', background: 'rgba(74, 222, 128, 0.15)', borderRadius: '0.75rem' }}>
                <div style={{ fontSize: 'clamp(1.1rem, 4vw, 1.4rem)', fontWeight: 700, color: '#4ade80', wordBreak: 'break-word' }}>
                  {this.formatCurrency(plan.estimatedMonthlyGroceries!)}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Est. Groceries</div>
              </div>
              <div style={{ ...statStyle, padding: '0.75rem', background: plan.potentialMonthlySavings! >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', borderRadius: '0.75rem' }}>
                <div style={{ fontSize: 'clamp(1.1rem, 4vw, 1.4rem)', fontWeight: 700, color: plan.potentialMonthlySavings! >= 0 ? '#10b981' : '#ef4444', wordBreak: 'break-word' }}>
                  {this.formatCurrency(plan.potentialMonthlySavings!)}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Buffer Left</div>
              </div>
            </div>
          </div>
        )}

        {/* Tips */}
        <div style={cardStyle}>
          <h3 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, marginBottom: '1rem' }}>
            💡 Money-Saving Tips
          </h3>
          <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
            {plan.tips.map((tip, i) => (
              <li key={i} style={{ color: 'rgba(255,255,255,0.85)', marginBottom: '0.5rem', fontSize: '1rem' }}>{tip}</li>
            ))}
          </ul>
        </div>

        {/* Monthly Breakdown Preview */}
        {this.renderMonthlyBreakdown()}
        </div>
        {/* End of Shareable Content Container */}

        {/* Share Button - Under Results */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
          <ShareResults
            targetRef={this.shareableRef}
            title="My Budget Plan - Tulzo"
            text={`Saving ${this.formatCurrency(plan.monthlyTargetSavings)}/month to reach ${this.formatCurrency(plan.finalBalance)} in ${plan.monthsToGoal} months! 💰`}
          />
        </div>

        {/* Reset Button */}
        <button onClick={onReset} style={{
          width: '100%', padding: '1rem', fontSize: '1.1rem', fontWeight: 700,
          background: 'rgba(255,255,255,0.1)', color: '#fff', border: '0.125rem solid rgba(255,255,255,0.3)',
          borderRadius: '0.75rem', cursor: 'pointer', marginTop: '0.5rem',
        }}>
          🔄 Recalculate
        </button>
      </View>
    );
  }

  private renderMonthlyBreakdown() {
    const { plan } = this.props;
    const { showAllMonths } = this.state;
    const displayMonths = showAllMonths ? plan.breakdown : plan.breakdown.slice(0, 6);
    const hasMore = plan.breakdown.length > 6;

    return (
      <div style={{ ...cardStyle, overflow: 'visible', paddingTop: '2rem' }} ref={this.containerRef}>
        <h3 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, marginBottom: '1rem', marginTop: '-0.5rem' }}>
          📅 Monthly Projection {showAllMonths ? `(All ${plan.breakdown.length} Months)` : '(First 6 Months)'}
        </h3>

        {/* Column Legend with Tooltips - Outside scrollable area */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '0.75rem',
          fontSize: '0.8rem',
          color: 'rgba(255,255,255,0.6)'
        }}>
          <span>Tap column headers for info:</span>
        </div>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'clamp(0.75rem, 2.5vw, 0.9rem)', minWidth: plan.interestEnabled ? '26rem' : '20rem' }}>
            <thead>
              <tr style={{ borderBottom: '0.125rem solid rgba(255,255,255,0.2)' }}>
                <th style={{ padding: '0.5rem', textAlign: 'left', color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>Month</th>
                {this.renderTooltipHeader('Start', 'start')}
                {this.renderTooltipHeader('Save', 'save')}
                {plan.interestEnabled && this.renderTooltipHeader('Interest', 'interest')}
                {this.renderTooltipHeader('Total', 'total')}
              </tr>
            </thead>
            <tbody>
              {displayMonths.map((month, i) => {
                const isLastMonth = showAllMonths && i === plan.breakdown.length - 1;
                return (
                  <tr key={i} style={{ borderBottom: '0.0625rem solid rgba(255,255,255,0.1)' }}>
                    <td style={{ padding: '0.5rem', color: '#fff', whiteSpace: 'nowrap' }}>{month.month}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {this.formatCurrencyPrecise(month.startBalance)}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', color: '#10b981', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      +{this.formatCurrency(month.targetSavings)}
                    </td>
                    {plan.interestEnabled && (
                      <td style={{ padding: '0.5rem', textAlign: 'right', color: '#34d399', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        +{this.formatCurrencyPrecise(month.interestEarned)}
                      </td>
                    )}
                    <td style={{ padding: '0.5rem', textAlign: 'right', color: '#fbbf24', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {this.formatCurrencyPrecise(month.cumulativeSavings)}
                      {isLastMonth && <span style={{ marginLeft: '0.25rem' }}>🎉</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <button
            onClick={() => this.setState({ showAllMonths: !showAllMonths })}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%',
              marginTop: '1rem',
              padding: '0.75rem',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '0.0625rem solid rgba(255, 255, 255, 0.2)',
              borderRadius: '0.625rem',
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
          >
            <span style={{
              transition: 'transform 0.3s',
              transform: showAllMonths ? 'rotate(180deg)' : 'rotate(0deg)',
            }}>
              ▼
            </span>
            {showAllMonths ? 'Show Less' : `View All ${plan.breakdown.length} Months`}
          </button>
        )}
        {/* Bank Disclaimer */}
        {plan.interestEnabled && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: 'rgba(251, 191, 36, 0.1)',
            border: '0.0625rem solid rgba(251, 191, 36, 0.3)',
            borderRadius: '0.5rem',
            fontSize: '0.75rem',
            color: 'rgba(255, 255, 255, 0.6)',
          }}>
            <span style={{ color: '#fbbf24' }}>⚠️ Disclaimer:</span> This is a mathematical computation for planning purposes only.
            Actual interest rates, compounding rules, fees, and policies may vary by bank.
            Please check with your financial institution for exact terms and conditions.
          </div>
        )}

        {/* Tooltip Modal */}
        {this.renderTooltipModal()}
      </div>
    );
  }
}

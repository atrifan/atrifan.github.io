import { Component } from 'react';
import { View } from '@adobe/react-spectrum';
import { SavingsPlan, Currency, CURRENCY_SYMBOLS } from '../types/budget';

interface BudgetResultsDisplayProps {
  plan: SavingsPlan;
  currency: Currency;
  onReset: () => void;
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(10px)',
  borderRadius: '20px',
  padding: '1.5rem',
  border: '1px solid rgba(255, 255, 255, 0.15)',
};

const statStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '1rem',
};

export class BudgetResultsDisplay extends Component<BudgetResultsDisplayProps> {
  private formatCurrency(amount: number): string {
    const symbol = CURRENCY_SYMBOLS[this.props.currency];
    return `${symbol}${Math.round(amount).toLocaleString()}`;
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

        {/* Main Stats */}
        <div style={cardStyle}>
          <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 800, textAlign: 'center', marginBottom: '1.5rem' }}>
            📊 Your Savings Plan
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
            <div style={statStyle}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>
                {this.formatCurrency(plan.monthlyTargetSavings)}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>Save Monthly</div>
            </div>
            <div style={statStyle}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fbbf24' }}>
                {this.formatCurrency(plan.monthlyBudgetForLiving)}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>Living Budget</div>
            </div>
            <div style={statStyle}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#60a5fa' }}>
                {plan.monthsToGoal}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>Months to Goal</div>
            </div>
          </div>
        </div>

        {/* Budget Breakdown */}
        <div style={cardStyle}>
          <h3 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, marginBottom: '1rem' }}>
            💸 Budget Breakdown
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#a78bfa' }}>
                {this.formatCurrency(plan.weeklyBudgetForLiving)}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Weekly</div>
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f472b6' }}>
                {this.formatCurrency(plan.dailyBudgetForLiving)}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Daily</div>
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34d399' }}>
                {plan.targetDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Target Date</div>
            </div>
          </div>
        </div>

        {/* Advanced Analysis */}
        {plan.estimatedMonthlyDiningOut !== undefined && (
          <div style={cardStyle}>
            <h3 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, marginBottom: '1rem' }}>
              🔬 Lifestyle Analysis
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
              <div style={statStyle}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fb923c' }}>
                  {this.formatCurrency(plan.estimatedMonthlyDiningOut!)}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Est. Dining Out</div>
              </div>
              <div style={statStyle}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#4ade80' }}>
                  {this.formatCurrency(plan.estimatedMonthlyGroceries!)}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Est. Groceries</div>
              </div>
              <div style={statStyle}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: plan.potentialMonthlySavings! >= 0 ? '#10b981' : '#ef4444' }}>
                  {this.formatCurrency(plan.potentialMonthlySavings!)}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Buffer Left</div>
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

        {/* Reset Button */}
        <button onClick={onReset} style={{
          width: '100%', padding: '1rem', fontSize: '1.1rem', fontWeight: 700,
          background: 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid rgba(255,255,255,0.3)',
          borderRadius: '12px', cursor: 'pointer', marginTop: '0.5rem',
        }}>
          🔄 Recalculate
        </button>
      </View>
    );
  }

  private renderMonthlyBreakdown() {
    const { plan } = this.props;
    const preview = plan.breakdown.slice(0, 6);

    return (
      <div style={cardStyle}>
        <h3 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, marginBottom: '1rem' }}>
          📅 Monthly Projection (First 6 Months)
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.2)' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: 'rgba(255,255,255,0.7)' }}>Month</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>Save</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((month, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '0.75rem', color: '#fff' }}>{month.month}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                    +{this.formatCurrency(month.targetSavings)}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: '#fbbf24', fontWeight: 700 }}>
                    {this.formatCurrency(month.cumulativeSavings)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plan.breakdown.length > 6 && (
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', textAlign: 'center', marginTop: '1rem' }}>
            ... and {plan.breakdown.length - 6} more months
          </p>
        )}
      </div>
    );
  }
}

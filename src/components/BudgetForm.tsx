import { Component } from 'react';
import { View } from '@adobe/react-spectrum';
import { FullBudgetInput, SavingsIntensity, Currency, AdvancedExpenses, CURRENCY_SYMBOLS } from '../types/budget';
import { ExpenseCalculator } from './ExpenseCalculator';

interface BudgetFormProps {
  onSubmit: (input: FullBudgetInput) => void;
}

interface BudgetFormState {
  currency: Currency;
  monthlyNetIncome: string;
  monthlyFixedExpenses: string;
  currentSavings: string;
  savingsGoal: string;
  targetDate: string;
  useTargetDate: boolean;
  intensity: SavingsIntensity;
  advancedMode: boolean;
  showExpenseCalculator: boolean;
  dateError: string;
  // Advanced expenses
  weeklyDiningOut: string;
  waterPrice: string;
  cokePrice: string;
  beerPrice: string;
  espressoPrice: string;
  burgerPrice: string;
  pizzaPrice: string;
  breadPrice: string;
  milkPrice: string;
  waterPackPrice: string;
  chickenPrice: string;
  weeklyBreadLoaves: string;
  weeklyMilkLiters: string;
  weeklyWaterPacks: string;
  weeklyChickenKg: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  padding: '1rem 1.25rem',
  fontSize: '1rem',
  fontWeight: 600,
  background: 'rgba(255, 255, 255, 0.95)',
  border: '2px solid transparent',
  borderRadius: '12px',
  outline: 'none',
  color: '#1a1a2e',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2310b981'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 1rem center',
  backgroundSize: '1.5rem',
  paddingRight: '3rem',
};

interface FormFieldProps {
  icon: string;
  label: string;
  children: React.ReactNode;
}

const FormField: React.FC<FormFieldProps> = ({ icon, label, children }) => (
  <div style={{
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    padding: '1rem 1.25rem',
    marginBottom: '0.75rem',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
      <span style={{ fontSize: '1.25rem' }}>{icon}</span>
      <label style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '1rem', fontWeight: 600 }}>
        {label}
      </label>
    </div>
    {children}
  </div>
);

export class BudgetForm extends Component<BudgetFormProps, BudgetFormState> {
  constructor(props: BudgetFormProps) {
    super(props);
    this.state = {
      currency: 'EUR',
      monthlyNetIncome: '',
      monthlyFixedExpenses: '',
      currentSavings: '',
      savingsGoal: '',
      targetDate: '',
      useTargetDate: false,
      intensity: 'medium',
      advancedMode: false,
      showExpenseCalculator: false,
      dateError: '',
      weeklyDiningOut: '',
      waterPrice: '',
      cokePrice: '',
      beerPrice: '',
      espressoPrice: '',
      burgerPrice: '',
      pizzaPrice: '',
      breadPrice: '',
      milkPrice: '',
      waterPackPrice: '',
      chickenPrice: '',
      weeklyBreadLoaves: '',
      weeklyMilkLiters: '',
      weeklyWaterPacks: '',
      weeklyChickenKg: '',
    };
  }

  private handleExpenseCalculatorSave = (total: number) => {
    this.setState({
      monthlyFixedExpenses: total.toString(),
      showExpenseCalculator: false
    });
  };

  private calculateMonthsFromDate = (targetDate: string): number => {
    const [year, month, day] = targetDate.split('-').map(Number);
    const target = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return Math.round(diffDays / 30.44 * 10) / 10; // Round to 1 decimal (avg days per month)
  };

  private isDateInPast = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const [year, month, day] = dateStr.split('-').map(Number);
    const target = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return target < today;
  };

  private handleDateChange = (dateStr: string) => {
    if (this.isDateInPast(dateStr)) {
      this.setState({ targetDate: dateStr, dateError: '⚠️ Please select a future date' });
    } else {
      this.setState({ targetDate: dateStr, dateError: '' });
    }
  };

  private handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = this.state;

    // Don't submit if there's a date error
    if (s.useTargetDate && s.dateError) {
      return;
    }

    const advancedExpenses: AdvancedExpenses | undefined = s.advancedMode ? {
      weeklyDiningOut: parseFloat(s.weeklyDiningOut) || 0,
      waterPrice: parseFloat(s.waterPrice) || 0,
      cokePrice: parseFloat(s.cokePrice) || 0,
      beerPrice: parseFloat(s.beerPrice) || 0,
      espressoPrice: parseFloat(s.espressoPrice) || 0,
      burgerPrice: parseFloat(s.burgerPrice) || 0,
      pizzaPrice: parseFloat(s.pizzaPrice) || 0,
      breadPrice: parseFloat(s.breadPrice) || 0,
      milkPrice: parseFloat(s.milkPrice) || 0,
      waterPackPrice: parseFloat(s.waterPackPrice) || 0,
      chickenPrice: parseFloat(s.chickenPrice) || 0,
      weeklyBreadLoaves: parseFloat(s.weeklyBreadLoaves) || 0,
      weeklyMilkLiters: parseFloat(s.weeklyMilkLiters) || 0,
      weeklyWaterPacks: parseFloat(s.weeklyWaterPacks) || 0,
      weeklyChickenKg: parseFloat(s.weeklyChickenKg) || 0,
    } : undefined;

    this.props.onSubmit({
      currency: s.currency,
      monthlyIncome: parseFloat(s.monthlyNetIncome) || 0,
      monthlyTaxes: 0, // User inputs NET income, no taxes needed
      monthlyFixedExpenses: parseFloat(s.monthlyFixedExpenses) || 0,
      currentSavings: parseFloat(s.currentSavings) || 0,
      savingsGoal: parseFloat(s.savingsGoal) || 0,
      targetDate: s.useTargetDate && s.targetDate ? s.targetDate : undefined,
      intensity: s.intensity,
      advancedMode: s.advancedMode,
      advancedExpenses,
    });
  };

  render() {
    const s = this.state;
    const symbol = CURRENCY_SYMBOLS[s.currency];

    return (
      <View
        UNSAFE_style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '32px',
          padding: 'clamp(1.5rem, 4vw, 2.5rem)',
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>💰</span>
          <h2 style={{ color: '#fff', fontSize: 'clamp(1.3rem, 4vw, 1.8rem)', fontWeight: 800, margin: 0 }}>
            Your Financial Details
          </h2>
        </div>

        <form onSubmit={this.handleSubmit}>
          {/* Currency */}
          <FormField icon="💱" label="Currency">
            <select value={s.currency} onChange={(e) => this.setState({ currency: e.target.value as Currency })} style={selectStyle}>
              <option value="EUR">🇪🇺 Euro (€)</option>
              <option value="USD">🇺🇸 US Dollar ($)</option>
              <option value="GBP">🇬🇧 British Pound (£)</option>
              <option value="RON">🇷🇴 Romanian Leu (lei)</option>
            </select>
          </FormField>

          {/* Net Income */}
          <FormField icon="💵" label={`Monthly NET Income (${symbol})`}>
            <input type="number" value={s.monthlyNetIncome} onChange={(e) => this.setState({ monthlyNetIncome: e.target.value })} step="0.01" style={inputStyle} placeholder="After taxes - what you receive" />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0.5rem 0 0 0' }}>
              💡 Enter your take-home pay (after taxes are deducted)
            </p>
          </FormField>

          {/* Fixed Expenses with Calculator */}
          <FormField icon="🏠" label={`Fixed Monthly Expenses (${symbol})`}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="number" value={s.monthlyFixedExpenses} onChange={(e) => this.setState({ monthlyFixedExpenses: e.target.value })} step="0.01" style={{ ...inputStyle, flex: 1 }} placeholder="Rent, utilities, subscriptions..." />
              <button type="button" onClick={() => this.setState({ showExpenseCalculator: true })} style={{
                padding: '0 1rem', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                border: 'none', borderRadius: '12px', color: '#fff', fontSize: '1.2rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.25rem',
              }} title="Open expense calculator">
                🧮
              </button>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0.5rem 0 0 0' }}>
              💡 Click 🧮 to add up your expenses
            </p>
          </FormField>

          {/* Savings */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <FormField icon="🏦" label={`Current Savings (${symbol})`}>
              <input type="number" value={s.currentSavings} onChange={(e) => this.setState({ currentSavings: e.target.value })} step="0.01" style={inputStyle} placeholder="What you have" />
            </FormField>
            <FormField icon="🎯" label={`Savings Goal (${symbol})`}>
              <input type="number" value={s.savingsGoal} onChange={(e) => this.setState({ savingsGoal: e.target.value })} step="0.01" style={inputStyle} placeholder="Target amount" />
            </FormField>
          </div>

          {/* Timeline */}
          <FormField icon="📅" label="Timeline">
            <select value={s.useTargetDate ? 'custom' : 'auto'} onChange={(e) => this.setState({ useTargetDate: e.target.value === 'custom' })} style={selectStyle}>
              <option value="auto">🤖 Calculate based on intensity</option>
              <option value="custom">📆 I have a target date</option>
            </select>
          </FormField>

          {s.useTargetDate && (
            <FormField icon="🗓️" label="Target Date">
              <input
                type="date"
                value={s.targetDate}
                onChange={(e) => this.handleDateChange(e.target.value)}
                style={{
                  ...inputStyle,
                  borderColor: s.dateError ? '#ef4444' : 'transparent',
                }}
                min={new Date().toISOString().split('T')[0]}
              />
              {s.dateError && (
                <p style={{ color: '#ef4444', fontSize: '0.9rem', margin: '0.5rem 0 0 0', fontWeight: 600 }}>
                  {s.dateError}
                </p>
              )}
              {s.targetDate && !s.dateError && (
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: '0.5rem 0 0 0' }}>
                  ⏱️ That's {this.calculateMonthsFromDate(s.targetDate)} months from now
                </p>
              )}
            </FormField>
          )}

          {/* Intensity */}
          {!s.useTargetDate && (
            <FormField icon="⚡" label="Savings Intensity">
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(['light', 'medium', 'aggressive'] as SavingsIntensity[]).map((level) => (
                  <button key={level} type="button" onClick={() => this.setState({ intensity: level })} style={{
                    flex: 1, padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600,
                    background: s.intensity === level ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255,255,255,0.1)',
                    color: '#fff', border: s.intensity === level ? 'none' : '2px solid rgba(255,255,255,0.3)',
                    borderRadius: '10px', cursor: 'pointer',
                  }}>
                    {level === 'light' ? '🌱 Light' : level === 'medium' ? '💪 Medium' : '🔥 Aggressive'}
                  </button>
                ))}
              </div>
            </FormField>
          )}

          {/* Advanced Mode Toggle */}
          <FormField icon="⚙️" label="Calculator Mode">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => this.setState({ advancedMode: false })} style={{
                flex: 1, padding: '0.75rem', fontSize: '1rem', fontWeight: 600,
                background: !s.advancedMode ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255,255,255,0.1)',
                color: '#fff', border: !s.advancedMode ? 'none' : '2px solid rgba(255,255,255,0.3)',
                borderRadius: '10px', cursor: 'pointer',
              }}>
                📊 Simple
              </button>
              <button type="button" onClick={() => this.setState({ advancedMode: true })} style={{
                flex: 1, padding: '0.75rem', fontSize: '1rem', fontWeight: 600,
                background: s.advancedMode ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255,255,255,0.1)',
                color: '#fff', border: s.advancedMode ? 'none' : '2px solid rgba(255,255,255,0.3)',
                borderRadius: '10px', cursor: 'pointer',
              }}>
                🔬 Advanced
              </button>
            </div>
          </FormField>

          {this.renderAdvancedSection()}

          {/* Submit */}
          <button type="submit" style={{
            width: '100%', padding: '1.25rem 2rem', fontSize: '1.3rem', fontWeight: 800,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff',
            border: 'none', borderRadius: '16px', cursor: 'pointer', marginTop: '1rem',
            boxShadow: '0 10px 40px rgba(16, 185, 129, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
          }}>
            <span style={{ fontSize: '1.5rem' }}>📈</span>
            Calculate My Plan
          </button>
        </form>

        {/* Expense Calculator Modal */}
        {s.showExpenseCalculator && (
          <ExpenseCalculator
            currency={s.currency}
            initialValue={parseFloat(s.monthlyFixedExpenses) || 0}
            onSave={this.handleExpenseCalculatorSave}
            onClose={() => this.setState({ showExpenseCalculator: false })}
          />
        )}
      </View>
    );
  }

  private renderAdvancedSection() {
    if (!this.state.advancedMode) return null;
    const s = this.state;
    const symbol = CURRENCY_SYMBOLS[s.currency];

    return (
      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '16px', padding: '1rem', marginTop: '0.5rem' }}>
        <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '1rem', textAlign: 'center' }}>🍽️ Lifestyle Expenses</h3>

        <FormField icon="🍔" label="Weekly Dining Out (times)">
          <input type="number" value={s.weeklyDiningOut} onChange={(e) => this.setState({ weeklyDiningOut: e.target.value })} style={inputStyle} />
        </FormField>

        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Restaurant Prices ({symbol})</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
          <input type="number" value={s.waterPrice} onChange={(e) => this.setState({ waterPrice: e.target.value })} placeholder="💧 Water" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
          <input type="number" value={s.cokePrice} onChange={(e) => this.setState({ cokePrice: e.target.value })} placeholder="🥤 Coke" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
          <input type="number" value={s.beerPrice} onChange={(e) => this.setState({ beerPrice: e.target.value })} placeholder="🍺 Beer" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
          <input type="number" value={s.espressoPrice} onChange={(e) => this.setState({ espressoPrice: e.target.value })} placeholder="☕ Espresso" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
          <input type="number" value={s.burgerPrice} onChange={(e) => this.setState({ burgerPrice: e.target.value })} placeholder="🍔 Burger" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
          <input type="number" value={s.pizzaPrice} onChange={(e) => this.setState({ pizzaPrice: e.target.value })} placeholder="🍕 Pizza" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
        </div>

        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Grocery Prices ({symbol})</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
          <input type="number" value={s.breadPrice} onChange={(e) => this.setState({ breadPrice: e.target.value })} placeholder="🍞 Bread" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
          <input type="number" value={s.milkPrice} onChange={(e) => this.setState({ milkPrice: e.target.value })} placeholder="🥛 Milk/L" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
          <input type="number" value={s.waterPackPrice} onChange={(e) => this.setState({ waterPackPrice: e.target.value })} placeholder="💧 Water 6pk" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
          <input type="number" value={s.chickenPrice} onChange={(e) => this.setState({ chickenPrice: e.target.value })} placeholder="🍗 Chicken/kg" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
        </div>

        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Weekly Consumption</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
          <input type="number" value={s.weeklyBreadLoaves} onChange={(e) => this.setState({ weeklyBreadLoaves: e.target.value })} placeholder="🍞 Loaves" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
          <input type="number" value={s.weeklyMilkLiters} onChange={(e) => this.setState({ weeklyMilkLiters: e.target.value })} placeholder="🥛 Liters" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
          <input type="number" value={s.weeklyWaterPacks} onChange={(e) => this.setState({ weeklyWaterPacks: e.target.value })} placeholder="💧 Packs" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
          <input type="number" value={s.weeklyChickenKg} onChange={(e) => this.setState({ weeklyChickenKg: e.target.value })} placeholder="🍗 Kg" style={{ ...inputStyle, fontSize: '0.9rem', padding: '0.75rem' }} />
        </div>
      </div>
    );
  }
}


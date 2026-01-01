import { Component } from 'react';
import { View } from '@adobe/react-spectrum';
import { Sex, UserInput } from '../types';

type UnitSystem = 'metric' | 'imperial';

interface WeightFormProps {
  onSubmit: (input: UserInput) => void;
}

interface WeightFormState {
  age: string;
  sex: Sex;
  height: string;
  heightFeet: string;
  heightInches: string;
  currentWeight: string;
  desiredWeight: string;
  targetDate: string;
  useTargetDate: boolean;
  unitSystem: UnitSystem;
  showWarning: boolean;
  warningMessage: string;
  dateError: string;
}

// Safe weight loss is 0.5-1 kg per week (CDC guidelines)
const MAX_SAFE_WEIGHT_LOSS_PER_WEEK_KG = 1.0;

interface FormFieldProps {
  icon: string;
  label: string;
  children: React.ReactNode;
}

const FormField: React.FC<FormFieldProps> = ({ icon, label, children }) => (
  <div style={{
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    padding: '1rem',
    marginBottom: '0.75rem',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    transition: 'all 0.3s ease',
    overflow: 'hidden',
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  padding: '1rem 1.25rem',
  fontSize: '1.1rem',
  fontWeight: 600,
  background: 'rgba(255, 255, 255, 0.95)',
  border: '2px solid transparent',
  borderRadius: '12px',
  outline: 'none',
  transition: 'all 0.3s ease',
  color: '#1a1a2e',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23667eea'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 1rem center',
  backgroundSize: '1.5rem',
  paddingRight: '3rem',
};

/**
 * Weight Loss Form Component - Beautiful Redesign
 */
export class WeightForm extends Component<WeightFormProps, WeightFormState> {
  constructor(props: WeightFormProps) {
    super(props);

    // Detect user's locale for default unit system
    const defaultUnit = this.detectUnitSystem();

    this.state = {
      age: '',
      sex: 'male',
      height: '',
      heightFeet: '',
      heightInches: '',
      currentWeight: '',
      desiredWeight: '',
      targetDate: '',
      useTargetDate: false,
      unitSystem: defaultUnit,
      showWarning: false,
      warningMessage: '',
      dateError: ''
    };
  }

  private detectUnitSystem(): UnitSystem {
    // Default to metric system
    return 'metric';
  }

  // Convert feet/inches to cm
  private feetInchesToCm(feet: number, inches: number): number {
    return (feet * 12 + inches) * 2.54;
  }

  // Convert pounds to kg
  private lbsToKg(lbs: number): number {
    return lbs * 0.453592;
  }

  // Convert kg to lbs
  private kgToLbs(kg: number): number {
    return kg * 2.20462;
  }

  // Convert cm to feet/inches
  private cmToFeetInches(cm: number): { feet: number; inches: number } {
    const totalInches = cm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return { feet, inches };
  }

  private handleUnitChange = (newUnit: UnitSystem) => {
    const { unitSystem, height, heightFeet, heightInches, currentWeight, desiredWeight } = this.state;

    if (newUnit === unitSystem) return;

    if (newUnit === 'imperial') {
      // Convert metric to imperial
      const heightCm = parseFloat(height) || 175;
      const { feet, inches } = this.cmToFeetInches(heightCm);
      const currentLbs = currentWeight ? this.kgToLbs(parseFloat(currentWeight)) : 0;
      const desiredLbs = desiredWeight ? this.kgToLbs(parseFloat(desiredWeight)) : 0;

      this.setState({
        unitSystem: 'imperial',
        heightFeet: heightCm ? feet.toString() : '',
        heightInches: heightCm ? inches.toString() : '',
        currentWeight: currentLbs ? Math.round(currentLbs).toString() : '',
        desiredWeight: desiredLbs ? Math.round(desiredLbs).toString() : ''
      });
    } else {
      // Convert imperial to metric
      const feet = parseFloat(heightFeet) || 0;
      const inches = parseFloat(heightInches) || 0;
      const heightCm = (feet || inches) ? this.feetInchesToCm(feet, inches) : 0;
      const currentKg = currentWeight ? this.lbsToKg(parseFloat(currentWeight)) : 0;
      const desiredKg = desiredWeight ? this.lbsToKg(parseFloat(desiredWeight)) : 0;

      this.setState({
        unitSystem: 'metric',
        height: heightCm ? Math.round(heightCm).toString() : '',
        currentWeight: currentKg ? Math.round(currentKg).toString() : '',
        desiredWeight: desiredKg ? Math.round(desiredKg).toString() : ''
      });
    }
  };

  private checkAggressiveWeightLoss = (currentKg: number, desiredKg: number, weeks: number): { isAggressive: boolean; message: string } => {
    const weightLoss = currentKg - desiredKg;
    if (weightLoss <= 0) return { isAggressive: false, message: '' };

    const lossPerWeek = weightLoss / weeks;

    if (lossPerWeek > MAX_SAFE_WEIGHT_LOSS_PER_WEEK_KG) {
      return {
        isAggressive: true,
        message: `⚠️ Warning: Your plan targets ${lossPerWeek.toFixed(2)} kg/week weight loss. ` +
          `Medical guidelines recommend no more than ${MAX_SAFE_WEIGHT_LOSS_PER_WEEK_KG} kg/week for safe, sustainable weight loss. ` +
          `Please consult a doctor or registered dietitian before proceeding with this aggressive plan.`
      };
    }
    return { isAggressive: false, message: '' };
  };

  private calculateWeeksFromDate = (targetDate: string): number => {
    const [year, month, day] = targetDate.split('-').map(Number);
    const target = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return Math.round(diffDays / 7 * 10) / 10; // Round to 1 decimal
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
    const { age, sex, height, heightFeet, heightInches, currentWeight, desiredWeight, targetDate, useTargetDate, unitSystem, dateError } = this.state;

    // Don't submit if there's a date error
    if (useTargetDate && dateError) {
      return;
    }

    // Convert to metric for calculations
    let heightCm: number;
    let currentKg: number;
    let desiredKg: number;

    if (unitSystem === 'imperial') {
      heightCm = this.feetInchesToCm(parseFloat(heightFeet) || 0, parseFloat(heightInches) || 0);
      currentKg = this.lbsToKg(parseFloat(currentWeight) || 0);
      desiredKg = this.lbsToKg(parseFloat(desiredWeight) || 0);
    } else {
      heightCm = parseFloat(height) || 0;
      currentKg = parseFloat(currentWeight) || 0;
      desiredKg = parseFloat(desiredWeight) || 0;
    }

    // Calculate weeks: from target date or auto-calculate based on safe weight loss
    const weeks = useTargetDate && targetDate
      ? this.calculateWeeksFromDate(targetDate)
      : Math.ceil((currentKg - desiredKg) / MAX_SAFE_WEIGHT_LOSS_PER_WEEK_KG);

    // Check for aggressive weight loss
    const { isAggressive, message } = this.checkAggressiveWeightLoss(currentKg, desiredKg, weeks);

    if (isAggressive) {
      this.setState({ showWarning: true, warningMessage: message });
    } else {
      this.setState({ showWarning: false, warningMessage: '' });
    }

    // Submit with metric values - pass targetDate directly if user selected one
    this.props.onSubmit({
      age: parseInt(age) || 0,
      sex,
      height: Math.round(heightCm),
      currentWeight: Math.round(currentKg * 10) / 10,
      desiredWeight: Math.round(desiredKg * 10) / 10,
      timeToWeight: weeks,
      targetDate: useTargetDate && targetDate ? targetDate : undefined
    });
  };

  private dismissWarning = () => {
    this.setState({ showWarning: false });
  };

  render() {
    const { age, sex, height, heightFeet, heightInches, currentWeight, desiredWeight, targetDate, useTargetDate, unitSystem, showWarning, warningMessage, dateError } = this.state;
    const isMetric = unitSystem === 'metric';
    const weightUnit = isMetric ? 'kg' : 'lbs';
    const heightLabel = isMetric ? 'Height (cm)' : 'Height';

    return (
      <View
        UNSAFE_style={{
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '32px',
          padding: 'clamp(1.5rem, 4vw, 3rem)',
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.3)',
          position: 'relative' as const,
        }}
      >
        {/* Warning Modal */}
        {showWarning && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)',
              borderRadius: '24px',
              padding: '2rem',
              maxWidth: '500px',
              textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}>
              <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>⚠️</span>
              <h3 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '1rem' }}>Aggressive Weight Loss Detected</h3>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                {warningMessage}
              </p>
              <button
                onClick={this.dismissWarning}
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  background: '#fff',
                  color: '#ee5a24',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                }}
              >
                I Understand
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>📊</span>
          <h2 style={{ color: '#fff', fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, margin: 0 }}>
            Enter Your Details
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.5rem', fontSize: '1.1rem' }}>
            We'll create your personalized plan
          </p>
        </div>

        <form onSubmit={this.handleSubmit}>
          {/* Unit System Toggle */}
          <FormField icon="🌍" label="Unit System">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => this.handleUnitChange('metric')}
                style={{
                  flex: 1,
                  padding: '1rem',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  background: isMetric ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: isMetric ? 'none' : '2px solid rgba(255,255,255,0.3)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
              >
                🇪🇺 Metric (kg/cm)
              </button>
              <button
                type="button"
                onClick={() => this.handleUnitChange('imperial')}
                style={{
                  flex: 1,
                  padding: '1rem',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  background: !isMetric ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: !isMetric ? 'none' : '2px solid rgba(255,255,255,0.3)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
              >
                🇺🇸 Imperial (lbs/ft)
              </button>
            </div>
          </FormField>

          {/* Age & Sex Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <FormField icon="🎂" label="Age">
              <input
                type="number"
                value={age}
                onChange={(e) => this.setState({ age: e.target.value })}
                min={10}
                max={120}
                required
                style={inputStyle}
                placeholder="Your age"
              />
            </FormField>

            <FormField icon="👤" label="Sex">
              <select
                value={sex}
                onChange={(e) => this.setState({ sex: e.target.value as Sex })}
                required
                style={selectStyle}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </FormField>
          </div>

          {/* Height - conditional based on unit system */}
          <FormField icon="📏" label={heightLabel}>
            {isMetric ? (
              <input
                type="number"
                value={height}
                onChange={(e) => this.setState({ height: e.target.value })}
                min={100}
                max={250}
                step="0.1"
                required
                style={inputStyle}
                placeholder="Your height in cm"
              />
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  value={heightFeet}
                  onChange={(e) => this.setState({ heightFeet: e.target.value })}
                  min={3}
                  max={8}
                  required
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="Feet"
                />
                <input
                  type="number"
                  value={heightInches}
                  onChange={(e) => this.setState({ heightInches: e.target.value })}
                  min={0}
                  max={11}
                  step="0.1"
                  required
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="Inches"
                />
              </div>
            )}
          </FormField>

          {/* Weight Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <FormField icon="⚖️" label={`Current Weight (${weightUnit})`}>
              <input
                type="number"
                value={currentWeight}
                onChange={(e) => this.setState({ currentWeight: e.target.value })}
                min={isMetric ? 30 : 66}
                max={isMetric ? 300 : 660}
                step="0.1"
                required
                style={inputStyle}
                placeholder="Current weight"
              />
            </FormField>

            <FormField icon="🎯" label={`Goal Weight (${weightUnit})`}>
              <input
                type="number"
                value={desiredWeight}
                onChange={(e) => this.setState({ desiredWeight: e.target.value })}
                min={isMetric ? 30 : 66}
                max={isMetric ? 300 : 660}
                step="0.1"
                required
                style={inputStyle}
                placeholder="Target weight"
              />
            </FormField>
          </div>

          {/* Timeline */}
          <FormField icon="📅" label="Timeline">
            <select
              value={useTargetDate ? 'custom' : 'auto'}
              onChange={(e) => this.setState({ useTargetDate: e.target.value === 'custom' })}
              style={selectStyle}
            >
              <option value="auto">🤖 Calculate for me (Recommended)</option>
              <option value="custom">📆 I have a target date</option>
            </select>
          </FormField>

          {useTargetDate && (
            <FormField icon="🗓️" label="Target Date">
              <input
                type="date"
                value={targetDate}
                onChange={(e) => this.handleDateChange(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                required
                style={{
                  ...inputStyle,
                  borderColor: dateError ? '#ef4444' : 'transparent',
                }}
              />
              {dateError && (
                <p style={{ color: '#ef4444', fontSize: '0.9rem', margin: '0.5rem 0 0 0', fontWeight: 600 }}>
                  {dateError}
                </p>
              )}
              {targetDate && !dateError && (
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: '0.5rem 0 0 0' }}>
                  ⏱️ That's {this.calculateWeeksFromDate(targetDate)} weeks from now
                </p>
              )}
            </FormField>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '1.25rem 2rem',
              fontSize: '1.4rem',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: '16px',
              cursor: 'pointer',
              marginTop: '1.5rem',
              boxShadow: '0 10px 40px rgba(102, 126, 234, 0.4)',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = '0 15px 50px rgba(102, 126, 234, 0.5)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 10px 40px rgba(102, 126, 234, 0.4)';
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>🚀</span>
            Calculate My Plan
          </button>
        </form>
      </View>
    );
  }
}


'use client';

import { Component, createRef, RefObject } from 'react';
import { View } from '@adobe/react-spectrum';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { ShareResults } from '../components/ShareResults';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';
import { MeasurementSystem } from '../types/preferences';
import {
  calculateDonationEligibility, calculateBloodCompatibility, calculateBabyBloodType,
  BloodTypeABO, RhFactor
} from '../utils/BloodCalculator';

type CalculatorMode = 'donation' | 'compatibility' | 'baby';

interface DonationResult {
  eligible: boolean;
  amount: number;
  maxSafeAmount: number; // Maximum safe blood loss based on blood volume
  bloodVolumeLiters: number; // Total blood volume in liters
  warnings: string[];
  restrictions: string[];
  tips: string[];
}

interface CompatibilityResult {
  bloodType: string;
  canDonateTo: string[];
  canReceiveFrom: string[];
  isUniversalDonor: boolean;
  isUniversalRecipient: boolean;
}

interface BabyBloodResult {
  possibleTypes: { type: string; percentage: number }[];
  rhIncompatibilityRisk: boolean;
  rhWarning: string | null;
}

interface BloodPageState {
  mode: CalculatorMode;
  unitSystem: 'metric' | 'imperial';
  // Donation inputs
  age: string;
  weight: string;
  height: string;
  heightFeet: string;
  heightInches: string;
  gender: 'male' | 'female';
  // Compatibility inputs
  bloodType: string;
  rhFactor: '+' | '-';
  // Baby inputs
  fatherBloodType: string;
  fatherRh: '+' | '-';
  motherBloodType: string;
  motherRh: '+' | '-';
  // Results
  donationResult: DonationResult | null;
  compatibilityResult: CompatibilityResult | null;
  babyResult: BabyBloodResult | null;
  // Modals
  showAgeWarning: boolean;
  showWeightWarning: boolean;
  showRhWarning: boolean;
}

interface BloodPageProps {
  initialUnitSystem?: MeasurementSystem;
}

class BloodPageClass extends Component<BloodPageProps, BloodPageState> {
  private resultRef: RefObject<HTMLDivElement> = createRef();
  private donationResultRef: RefObject<HTMLDivElement> = createRef();
  private compatibilityResultRef: RefObject<HTMLDivElement> = createRef();
  private babyResultRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: BloodPageProps) {
    super(props);
    this.state = {
      mode: 'donation',
      unitSystem: props.initialUnitSystem || 'metric',
      age: '',
      weight: '',
      height: '',
      heightFeet: '',
      heightInches: '',
      gender: 'male',
      bloodType: 'O',
      rhFactor: '+',
      fatherBloodType: 'A',
      fatherRh: '+',
      motherBloodType: 'B',
      motherRh: '+',
      donationResult: null,
      compatibilityResult: null,
      babyResult: null,
      showAgeWarning: false,
      showWeightWarning: false,
      showRhWarning: false,
    };
  }

  componentDidMount() {
    applySEO('blood');
  }

  private scrollToResult = () => {
    setTimeout(() => {
      this.resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  private reset = () => {
    this.setState({
      age: '', weight: '', height: '', heightFeet: '', heightInches: '',
      gender: 'male', bloodType: 'O', rhFactor: '+',
      fatherBloodType: 'A', fatherRh: '+', motherBloodType: 'B', motherRh: '+',
      donationResult: null, compatibilityResult: null, babyResult: null,
      showAgeWarning: false, showWeightWarning: false, showRhWarning: false,
    });
  };

  // Use shared BloodCalculator - single source of truth
  private calculateDonation = () => {
    const { age, weight, height, heightFeet, heightInches, gender, unitSystem } = this.state;

    // Call shared calculator
    const result = calculateDonationEligibility({
      age: parseInt(age),
      weight: parseFloat(weight),
      height: parseFloat(height),
      gender,
      unitSystem,
      heightFeet: parseFloat(heightFeet) || undefined,
      heightInches: parseFloat(heightInches) || undefined,
    });

    // UI-specific: show warning modals
    if (parseInt(age) < 17) {
      this.setState({ showAgeWarning: true });
    }
    if (unitSystem === 'imperial') {
      const weightKg = parseFloat(weight) * 0.453592;
      if (weightKg < 50) this.setState({ showWeightWarning: true });
    } else if (parseFloat(weight) < 50) {
      this.setState({ showWeightWarning: true });
    }

    // UI-specific: add restrictions (not in shared calculator)
    const restrictions: string[] = [
      'No blood-borne diseases (HIV, Hepatitis B/C, etc.)',
      'Not currently sick or feeling unwell',
      'No recent tattoos or piercings (wait 3-12 months depending on region)',
      'No recent travel to malaria-endemic areas',
      'Not pregnant or recently given birth (wait 6 months)',
    ];

    // UI-specific: add extra tip
    const tips = [...result.tips, 'Bring ID and list of medications'];

    this.setState({
      donationResult: {
        eligible: result.eligible,
        amount: result.amount,
        maxSafeAmount: result.maxSafeAmount,
        bloodVolumeLiters: result.bloodVolume,
        warnings: result.warnings,
        restrictions,
        tips,
      },
    }, this.scrollToResult);
  };

  private calculateCompatibility = () => {
    const { bloodType, rhFactor } = this.state;

    // Call shared calculator
    const result = calculateBloodCompatibility({
      bloodType: bloodType as BloodTypeABO,
      rhFactor: rhFactor as RhFactor,
    });

    this.setState({
      compatibilityResult: {
        bloodType: result.fullBloodType,
        canDonateTo: result.canDonateTo,
        canReceiveFrom: result.canReceiveFrom,
        isUniversalDonor: result.isUniversalDonor,
        isUniversalRecipient: result.isUniversalRecipient,
      },
    }, this.scrollToResult);
  };

  private calculateBabyBlood = () => {
    const { fatherBloodType, fatherRh, motherBloodType, motherRh } = this.state;

    // Call shared calculator
    const result = calculateBabyBloodType({
      fatherBloodType: fatherBloodType as BloodTypeABO,
      fatherRh: fatherRh as RhFactor,
      motherBloodType: motherBloodType as BloodTypeABO,
      motherRh: motherRh as RhFactor,
    });

    // UI-specific: show warning modal
    if (result.rhIncompatibilityRisk) {
      this.setState({ showRhWarning: true });
    }

    this.setState({
      babyResult: {
        possibleTypes: result.possibleTypes,
        rhIncompatibilityRisk: result.rhIncompatibilityRisk,
        rhWarning: result.rhWarning,
      },
    }, this.scrollToResult);
  };

  private renderWarningModal = (
    show: boolean,
    title: string,
    message: string,
    onClose: () => void
  ) => {
    if (!show) return null;

    return (
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
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: '20px',
          padding: '2rem',
          maxWidth: '31rem',
          width: '100%',
          border: '2px solid #ef4444',
          boxShadow: '0 0 30px rgba(239, 68, 68, 0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '2rem' }}>⚠️</span>
            <h3 style={{ color: '#ef4444', margin: 0, fontSize: '1.5rem' }}>{title}</h3>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.9)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            {message}
          </p>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '1rem',
              background: '#ef4444',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            I Understand
          </button>
        </div>
      </div>
    );
  };

  render() {
    const {
      mode, age, weight, height, heightFeet, heightInches, gender, unitSystem,
      bloodType, rhFactor,
      fatherBloodType, fatherRh, motherBloodType, motherRh,
      donationResult, compatibilityResult, babyResult,
      showAgeWarning, showWeightWarning, showRhWarning,
    } = this.state;

    const gradient = 'linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)';
    const bloodTypes = ['A', 'B', 'AB', 'O'];

    return (
      <View minHeight="100vh" UNSAFE_style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        padding: 'clamp(1rem, 3vw, 2rem)',
      }}>
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />

        <View maxWidth="50rem" marginX="auto">
          <BackToTools />

          {/* Top Ad */}
          <AdBanner slot={ADS_CONFIG.slots.bloodTop} format="horizontal" />

          {/* Header */}
          <View UNSAFE_style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 1rem',
              background: gradient,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.5rem',
              boxShadow: '0 8px 32px rgba(239, 68, 68, 0.4)',
            }}>
              🩸
            </div>
            <h1 style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              fontWeight: 800,
              background: gradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: '0 0 0.5rem',
            }}>
              BLOOD
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem' }}>
              Blood Donation, Compatibility & Baby Blood Predictor
            </p>
          </View>

          {/* Disclaimer */}
          <DisclaimerBanner />

          {/* Mode Tabs */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'center',
            marginBottom: '2rem',
            flexWrap: 'wrap',
          }}>
            {[
              { id: 'donation', label: '💉 Donation', desc: 'Can I donate?' },
              { id: 'compatibility', label: '🔄 Compatibility', desc: 'Who can I help?' },
              { id: 'baby', label: '👶 Baby Blood', desc: 'Predict baby\'s type' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => this.setState({
                  mode: m.id as CalculatorMode,
                  donationResult: null,
                  compatibilityResult: null,
                  babyResult: null,
                })}
                style={{
                  padding: '1rem 1.5rem',
                  borderRadius: '16px',
                  border: mode === m.id ? '2px solid #ef4444' : '2px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  background: mode === m.id ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  minWidth: '140px',
                }}
              >
                <div style={{ fontSize: '1.25rem' }}>{m.label}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem' }}>{m.desc}</div>
              </button>
            ))}
          </div>

          {/* Calculator Forms */}
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '24px',
            padding: 'clamp(1.5rem, 4vw, 2rem)',
            border: '1px solid rgba(255,255,255,0.1)',
            marginBottom: '2rem',
          }}>
            {mode === 'donation' && (
              <div>
                <h2 style={{ color: '#fff', marginBottom: '1.5rem', textAlign: 'center' }}>
                  💉 Blood Donation Eligibility
                </h2>
                <div style={{ display: 'grid', gap: '1rem', maxWidth: '25rem', margin: '0 auto' }}>
                  {/* Unit System Toggle */}
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.5rem' }}>
                      Units
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {(['metric', 'imperial'] as const).map((u) => (
                        <button
                          key={u}
                          onClick={() => this.setState({ unitSystem: u, weight: '', height: '', heightFeet: '', heightInches: '' })}
                          style={{
                            flex: 1,
                            padding: '0.75rem',
                            borderRadius: '12px',
                            border: unitSystem === u ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
                            background: unitSystem === u ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0,0,0,0.3)',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                          }}
                        >
                          {u === 'metric' ? '🌍 Metric (kg/cm)' : '🇺🇸 Imperial (lb/ft)'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.5rem' }}>
                      Age (years)
                    </label>
                    <input
                      type="number"
                      value={age}
                      onChange={(e) => this.setState({ age: e.target.value })}
                      placeholder="e.g., 25"
                      style={{
                        width: '100%',
                        padding: '1rem',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: 'rgba(0,0,0,0.3)',
                        color: '#fff',
                        fontSize: '1rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.5rem' }}>
                      Weight ({unitSystem === 'metric' ? 'kg' : 'lbs'})
                    </label>
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => this.setState({ weight: e.target.value })}
                      placeholder={unitSystem === 'metric' ? 'e.g., 70' : 'e.g., 154'}
                      style={{
                        width: '100%',
                        padding: '1rem',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: 'rgba(0,0,0,0.3)',
                        color: '#fff',
                        fontSize: '1rem',
                      }}
                    />
                  </div>
                  {unitSystem === 'metric' ? (
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.5rem' }}>
                        Height (cm)
                      </label>
                      <input
                        type="number"
                        value={height}
                        onChange={(e) => this.setState({ height: e.target.value })}
                        placeholder="e.g., 175"
                        style={{
                          width: '100%',
                          padding: '1rem',
                          borderRadius: '12px',
                          border: '1px solid rgba(255,255,255,0.2)',
                          background: 'rgba(0,0,0,0.3)',
                          color: '#fff',
                          fontSize: '1rem',
                        }}
                      />
                    </div>
                  ) : (
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.5rem' }}>
                        Height (ft &amp; in)
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="number"
                          value={heightFeet}
                          onChange={(e) => this.setState({ heightFeet: e.target.value })}
                          placeholder="ft"
                          style={{
                            flex: 1,
                            padding: '1rem',
                            borderRadius: '12px',
                            border: '1px solid rgba(255,255,255,0.2)',
                            background: 'rgba(0,0,0,0.3)',
                            color: '#fff',
                            fontSize: '1rem',
                          }}
                        />
                        <input
                          type="number"
                          value={heightInches}
                          onChange={(e) => this.setState({ heightInches: e.target.value })}
                          placeholder="in"
                          style={{
                            flex: 1,
                            padding: '1rem',
                            borderRadius: '12px',
                            border: '1px solid rgba(255,255,255,0.2)',
                            background: 'rgba(0,0,0,0.3)',
                            color: '#fff',
                            fontSize: '1rem',
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.5rem' }}>
                      Gender
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {(['male', 'female'] as const).map((g) => (
                        <button
                          key={g}
                          onClick={() => this.setState({ gender: g })}
                          style={{
                            flex: 1,
                            padding: '1rem',
                            borderRadius: '12px',
                            border: gender === g ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
                            background: gender === g ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0,0,0,0.3)',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          {g === 'male' ? '♂️ Male' : '♀️ Female'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                      onClick={this.calculateDonation}
                      disabled={!age || !weight || (unitSystem === 'metric' ? !height : !heightFeet)}
                      style={{
                        flex: 1,
                        padding: '1rem',
                        background: (age && weight && (unitSystem === 'metric' ? height : heightFeet)) ? gradient : 'rgba(255,255,255,0.1)',
                        border: 'none',
                        borderRadius: '12px',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '1.1rem',
                        cursor: (age && weight && (unitSystem === 'metric' ? height : heightFeet)) ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Check Eligibility
                    </button>
                    <button onClick={this.reset}
                      style={{ padding: '1rem', fontSize: '1.1rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '12px', cursor: 'pointer' }}>
                      🔄
                    </button>
                  </div>
                </div>
              </div>
            )}

            {mode === 'compatibility' && (
              <div>
                <h2 style={{ color: '#fff', marginBottom: '1.5rem', textAlign: 'center' }}>
                  🔄 Blood Type Compatibility
                </h2>
                <div style={{ maxWidth: '25rem', margin: '0 auto' }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.5rem' }}>
                      Your Blood Type
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {bloodTypes.map((t) => (
                        <button
                          key={t}
                          onClick={() => this.setState({ bloodType: t })}
                          style={{
                            flex: 1,
                            minWidth: '60px',
                            padding: '1rem',
                            borderRadius: '12px',
                            border: bloodType === t ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
                            background: bloodType === t ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0,0,0,0.3)',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 700,
                            fontSize: '1.25rem',
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.5rem' }}>
                      Rh Factor
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {(['+', '-'] as const).map((rh) => (
                        <button
                          key={rh}
                          onClick={() => this.setState({ rhFactor: rh })}
                          style={{
                            flex: 1,
                            padding: '1rem',
                            borderRadius: '12px',
                            border: rhFactor === rh ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
                            background: rhFactor === rh ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0,0,0,0.3)',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 700,
                            fontSize: '1.5rem',
                          }}
                        >
                          Rh{rh}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      onClick={this.calculateCompatibility}
                      style={{
                        flex: 1,
                        padding: '1rem',
                        background: gradient,
                        border: 'none',
                        borderRadius: '12px',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '1.1rem',
                        cursor: 'pointer',
                      }}
                    >
                      Check Compatibility
                    </button>
                    <button onClick={this.reset}
                      style={{ padding: '1rem', fontSize: '1.1rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '12px', cursor: 'pointer' }}>
                      🔄
                    </button>
                  </div>
                </div>
              </div>
            )}

            {mode === 'baby' && (
              <div>
                <h2 style={{ color: '#fff', marginBottom: '1.5rem', textAlign: 'center' }}>
                  👶 Baby Blood Type Predictor
                </h2>
                <div style={{ display: 'grid', gap: '1.5rem', maxWidth: '31rem', margin: '0 auto' }}>
                  {/* Father's blood type */}
                  <div style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    borderRadius: '16px',
                    padding: '1rem',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                  }}>
                    <h3 style={{ color: '#3b82f6', margin: '0 0 1rem', fontSize: '1rem' }}>
                      👨 Father&apos;s Blood Type
                    </h3>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                      {bloodTypes.map((t) => (
                        <button
                          key={t}
                          onClick={() => this.setState({ fatherBloodType: t })}
                          style={{
                            flex: 1,
                            minWidth: '50px',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            border: fatherBloodType === t ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.2)',
                            background: fatherBloodType === t ? 'rgba(59, 130, 246, 0.3)' : 'rgba(0,0,0,0.3)',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {(['+', '-'] as const).map((rh) => (
                        <button
                          key={rh}
                          onClick={() => this.setState({ fatherRh: rh })}
                          style={{
                            flex: 1,
                            padding: '0.75rem',
                            borderRadius: '8px',
                            border: fatherRh === rh ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.2)',
                            background: fatherRh === rh ? 'rgba(59, 130, 246, 0.3)' : 'rgba(0,0,0,0.3)',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          Rh{rh}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mother's blood type */}
                  <div style={{
                    background: 'rgba(236, 72, 153, 0.1)',
                    borderRadius: '16px',
                    padding: '1rem',
                    border: '1px solid rgba(236, 72, 153, 0.3)',
                  }}>
                    <h3 style={{ color: '#ec4899', margin: '0 0 1rem', fontSize: '1rem' }}>
                      👩 Mother&apos;s Blood Type
                    </h3>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                      {bloodTypes.map((t) => (
                        <button
                          key={t}
                          onClick={() => this.setState({ motherBloodType: t })}
                          style={{
                            flex: 1,
                            minWidth: '50px',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            border: motherBloodType === t ? '2px solid #ec4899' : '1px solid rgba(255,255,255,0.2)',
                            background: motherBloodType === t ? 'rgba(236, 72, 153, 0.3)' : 'rgba(0,0,0,0.3)',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {(['+', '-'] as const).map((rh) => (
                        <button
                          key={rh}
                          onClick={() => this.setState({ motherRh: rh })}
                          style={{
                            flex: 1,
                            padding: '0.75rem',
                            borderRadius: '8px',
                            border: motherRh === rh ? '2px solid #ec4899' : '1px solid rgba(255,255,255,0.2)',
                            background: motherRh === rh ? 'rgba(236, 72, 153, 0.3)' : 'rgba(0,0,0,0.3)',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          Rh{rh}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      onClick={this.calculateBabyBlood}
                      style={{
                        flex: 1,
                        padding: '1rem',
                        background: gradient,
                        border: 'none',
                        borderRadius: '12px',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '1.1rem',
                        cursor: 'pointer',
                      }}
                    >
                      Predict Baby&apos;s Blood Type
                    </button>
                    <button onClick={this.reset}
                      style={{ padding: '1rem', fontSize: '1.1rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '12px', cursor: 'pointer' }}>
                      🔄
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Hero Ad - between input and results (only show when there are results) */}
          {(donationResult || compatibilityResult || babyResult) && (
            <AdBanner slot={ADS_CONFIG.slots.bloodResults} format="horizontal" />
          )}

          {/* Results */}
          <div ref={this.resultRef}>
            {donationResult && (
              <>
              <div ref={this.donationResultRef} style={{
                background: donationResult.eligible
                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(22, 163, 74, 0.2) 100%)'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.2) 100%)',
                borderRadius: '24px',
                padding: 'clamp(1.5rem, 4vw, 2rem)',
                border: `2px solid ${donationResult.eligible ? '#22c55e' : '#ef4444'}`,
                marginBottom: '1rem',
              }}>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <span style={{ fontSize: '4rem' }}>
                    {donationResult.eligible ? '✅' : '❌'}
                  </span>
                  <h3 style={{
                    color: donationResult.eligible ? '#22c55e' : '#ef4444',
                    fontSize: '1.75rem',
                    margin: '0.5rem 0',
                  }}>
                    {donationResult.eligible ? 'You Can Donate!' : 'Not Eligible to Donate'}
                  </h3>
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '1rem',
                      maxWidth: '25rem',
                      margin: '0 auto'
                    }}>
                      <div style={{
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '1rem'
                      }}>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: 0 }}>Your Blood Volume</p>
                        <p style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0 0' }}>
                          {donationResult.bloodVolumeLiters} L
                        </p>
                      </div>
                      <div style={{
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '1rem'
                      }}>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: 0 }}>
                          {donationResult.eligible ? 'Recommended Donation' : 'Max Safe Loss'}
                        </p>
                        <p style={{
                          color: donationResult.eligible ? '#22c55e' : '#fbbf24',
                          fontSize: '1.5rem',
                          fontWeight: 700,
                          margin: '0.25rem 0 0'
                        }}>
                          {donationResult.eligible ? donationResult.amount : donationResult.maxSafeAmount} ml
                        </p>
                      </div>
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                      {donationResult.eligible
                        ? 'Blood volume calculated using Nadler\'s formula based on your height, weight, and gender'
                        : 'Based on your body measurements, this is the maximum safe blood loss (10.5% of blood volume)'}
                    </p>
                  </div>
                </div>

                {donationResult.warnings.length > 0 && (
                  <div style={{
                    background: 'rgba(251, 191, 36, 0.1)',
                    borderRadius: '12px',
                    padding: '1rem',
                    marginBottom: '1rem',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                  }}>
                    <h4 style={{ color: '#fbbf24', margin: '0 0 0.5rem' }}>⚠️ Warnings</h4>
                    <ul style={{ color: 'rgba(255,255,255,0.8)', margin: 0, paddingLeft: '1.25rem' }}>
                      {donationResult.warnings.map((w, i) => (
                        <li key={i} style={{ marginBottom: '0.25rem' }}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1rem',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}>
                  <h4 style={{ color: '#ef4444', margin: '0 0 0.5rem' }}>🚫 Restrictions</h4>
                  <ul style={{ color: 'rgba(255,255,255,0.8)', margin: 0, paddingLeft: '1.25rem' }}>
                    {donationResult.restrictions.map((r, i) => (
                      <li key={i} style={{ marginBottom: '0.25rem' }}>{r}</li>
                    ))}
                  </ul>
                </div>

                <div style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  borderRadius: '12px',
                  padding: '1rem',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}>
                  <h4 style={{ color: '#22c55e', margin: '0 0 0.5rem' }}>💡 Tips for Donation Day</h4>
                  <ul style={{ color: 'rgba(255,255,255,0.8)', margin: 0, paddingLeft: '1.25rem' }}>
                    {donationResult.tips.map((t, i) => (
                      <li key={i} style={{ marginBottom: '0.25rem' }}>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div style={{ marginTop: '0.5rem', marginBottom: '2rem', textAlign: 'center' }}>
                <ShareResults
                  targetRef={this.donationResultRef}
                  title="Blood Donation Eligibility - Tulzo"
                  text={donationResult.eligible
                    ? `I can donate ${donationResult.amount}ml of blood! 🩸`
                    : 'Check your blood donation eligibility at Tulzo! 🩸'}
                />
              </div>
              </>
            )}

            {compatibilityResult && (
              <>
              <div ref={this.compatibilityResultRef} style={{
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '24px',
                padding: 'clamp(1.5rem, 4vw, 2rem)',
                border: '2px solid rgba(239, 68, 68, 0.3)',
                marginBottom: '1rem',
              }}>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <div style={{
                    display: 'inline-block',
                    background: gradient,
                    borderRadius: '50%',
                    width: '100px',
                    height: '100px',
                    lineHeight: '100px',
                    fontSize: '2.5rem',
                    fontWeight: 800,
                    color: '#fff',
                    marginBottom: '0.5rem',
                  }}>
                    {compatibilityResult.bloodType}
                  </div>
                  {compatibilityResult.isUniversalDonor && (
                    <p style={{ color: '#22c55e', fontWeight: 700, fontSize: '1.1rem' }}>
                      🌟 Universal Donor - You can donate to everyone!
                    </p>
                  )}
                  {compatibilityResult.isUniversalRecipient && (
                    <p style={{ color: '#3b82f6', fontWeight: 700, fontSize: '1.1rem' }}>
                      🌟 Universal Recipient - You can receive from everyone!
                    </p>
                  )}
                </div>

                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <div style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                  }}>
                    <h4 style={{ color: '#22c55e', margin: '0 0 1rem', textAlign: 'center' }}>
                      ➡️ Can Donate To
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                      {compatibilityResult.canDonateTo.map((t) => (
                        <span key={t} style={{
                          background: 'rgba(34, 197, 94, 0.2)',
                          padding: '0.5rem 1rem',
                          borderRadius: '20px',
                          color: '#22c55e',
                          fontWeight: 700,
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                  }}>
                    <h4 style={{ color: '#3b82f6', margin: '0 0 1rem', textAlign: 'center' }}>
                      ⬅️ Can Receive From
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                      {compatibilityResult.canReceiveFrom.map((t) => (
                        <span key={t} style={{
                          background: 'rgba(59, 130, 246, 0.2)',
                          padding: '0.5rem 1rem',
                          borderRadius: '20px',
                          color: '#3b82f6',
                          fontWeight: 700,
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
              <div style={{ marginTop: '0.5rem', marginBottom: '2rem', textAlign: 'center' }}>
                <ShareResults
                  targetRef={this.compatibilityResultRef}
                  title="Blood Type Compatibility - Tulzo"
                  text={`My blood type is ${compatibilityResult.bloodType}! I can donate to ${compatibilityResult.canDonateTo.length} blood types. 🩸`}
                />
              </div>
              </>
            )}

            {babyResult && (
              <>
              <div ref={this.babyResultRef} style={{
                background: 'rgba(167, 139, 250, 0.1)',
                borderRadius: '24px',
                padding: 'clamp(1.5rem, 4vw, 2rem)',
                border: '2px solid rgba(167, 139, 250, 0.3)',
                marginBottom: '1rem',
              }}>
                <h3 style={{ color: '#a78bfa', textAlign: 'center', marginBottom: '1.5rem' }}>
                  👶 Possible Baby Blood Types
                </h3>

                {babyResult.rhIncompatibilityRisk && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    borderRadius: '12px',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    border: '2px solid #ef4444',
                  }}>
                    <h4 style={{ color: '#ef4444', margin: '0 0 0.5rem' }}>
                      ⚠️ Rh Incompatibility Risk Detected
                    </h4>
                    <p style={{ color: 'rgba(255,255,255,0.9)', margin: 0, lineHeight: 1.6 }}>
                      {babyResult.rhWarning}
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
                  {babyResult.possibleTypes.map((t) => (
                    <div key={t.type} style={{
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '16px',
                      padding: '1.25rem',
                      minWidth: '100px',
                      textAlign: 'center',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}>
                      <div style={{
                        fontSize: '2rem',
                        fontWeight: 800,
                        color: '#fff',
                        marginBottom: '0.5rem',
                      }}>
                        {t.type}
                      </div>
                      <div style={{
                        background: gradient,
                        borderRadius: '20px',
                        padding: '0.25rem 0.75rem',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                      }}>
                        {t.percentage}%
                      </div>
                    </div>
                  ))}
                </div>

                <p style={{
                  color: 'rgba(255,255,255,0.6)',
                  textAlign: 'center',
                  marginTop: '1.5rem',
                  fontSize: '0.9rem',
                }}>
                  ⚕️ Always consult with a doctor or genetic counselor for accurate medical advice.
                </p>
              </div>
              <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                <ShareResults
                  targetRef={this.babyResultRef}
                  title="Baby Blood Type Predictor - Tulzo"
                  text={`Predicted baby blood types: ${babyResult.possibleTypes.map(t => `${t.type} (${t.percentage}%)`).join(', ')} 👶🩸`}
                />
              </div>
              </>
            )}
          </div>

          {/* Bottom Ad */}
          <AdBanner slot={ADS_CONFIG.slots.bloodFooter} format="horizontal" />

          <Footer />
        </View>

        {/* Warning Modals */}
        {this.renderWarningModal(
          showAgeWarning,
          'Age Restriction',
          'According to the American Red Cross and NHS Blood Donation guidelines, blood donors must be at least 17 years old (16 with parental consent in some regions). This is to ensure the safety of both the donor and the recipient. Please wait until you meet the age requirement.',
          () => this.setState({ showAgeWarning: false })
        )}

        {this.renderWarningModal(
          showWeightWarning,
          'Weight Restriction',
          'According to blood donation guidelines, donors must weigh at least 50 kg (110 lbs) to safely donate blood. This ensures that removing 450-500ml of blood does not adversely affect your health. Please consult with a healthcare provider if you have questions.',
          () => this.setState({ showWeightWarning: false })
        )}

        {this.renderWarningModal(
          showRhWarning,
          'Rh Incompatibility Warning',
          'When the mother is Rh-negative and the father is Rh-positive, there is a risk of Rh incompatibility if the baby inherits the father\'s Rh-positive blood type. This can cause the mother\'s immune system to produce antibodies that may affect future pregnancies. Please consult with an OB-GYN or fertility specialist about RhoGAM (Rh immunoglobulin) injection to prevent complications.',
          () => this.setState({ showRhWarning: false })
        )}
      </View>
    );
  }
}

// Wrapper functional component to inject preferences
import { usePreferences } from '../contexts/PreferencesContext';

export const BloodPage: React.FC = () => {
  const { preferences } = usePreferences();
  return <BloodPageClass initialUnitSystem={preferences.measurementSystem} />;
};


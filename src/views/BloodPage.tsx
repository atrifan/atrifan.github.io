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

// Blood type genetics data
const BLOOD_TYPE_ALLELES: Record<string, string[]> = {
  'A': ['AA', 'AO'],
  'B': ['BB', 'BO'],
  'AB': ['AB'],
  'O': ['OO'],
};

const RH_ALLELES: Record<string, string[]> = {
  '+': ['++', '+-'],
  '-': ['--'],
};

// Blood compatibility matrix
const DONATION_COMPATIBILITY: Record<string, string[]> = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O+', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A+', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+'],
};

const RECEIVE_COMPATIBILITY: Record<string, string[]> = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

type CalculatorMode = 'donation' | 'compatibility' | 'baby';

interface DonationResult {
  eligible: boolean;
  amount: number;
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

export class BloodPage extends Component<object, BloodPageState> {
  private resultRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: object) {
    super(props);
    this.state = {
      mode: 'donation',
      unitSystem: 'metric',
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

  // Calculate blood volume (Nadler's formula)
  private calculateBloodVolume = (weight: number, height: number, gender: 'male' | 'female'): number => {
    const heightM = height / 100;
    if (gender === 'male') {
      return 0.3669 * Math.pow(heightM, 3) + 0.03219 * weight + 0.6041;
    }
    return 0.3561 * Math.pow(heightM, 3) + 0.03308 * weight + 0.1833;
  };

  private calculateDonation = () => {
    const { age, weight, height, heightFeet, heightInches, gender, unitSystem } = this.state;
    const ageNum = parseInt(age);

    // Convert to metric if imperial
    let weightKg: number;
    let heightCm: number;

    if (unitSystem === 'imperial') {
      weightKg = parseFloat(weight) * 0.453592; // lbs to kg
      const feet = parseFloat(heightFeet) || 0;
      const inches = parseFloat(heightInches) || 0;
      heightCm = (feet * 12 + inches) * 2.54; // feet/inches to cm
    } else {
      weightKg = parseFloat(weight);
      heightCm = parseFloat(height);
    }

    const warnings: string[] = [];
    const restrictions: string[] = [];
    const tips: string[] = [];
    let eligible = true;

    // Age check (minimum 17, some places 16 with consent)
    if (ageNum < 17) {
      eligible = false;
      this.setState({ showAgeWarning: true });
      warnings.push('You must be at least 17 years old to donate blood (16 with parental consent in some regions).');
    } else if (ageNum > 65) {
      warnings.push('First-time donors should be under 66. Regular donors can continue until 70+.');
    }

    // Weight check (minimum 110 lbs / 50 kg)
    if (weightKg < 50) {
      eligible = false;
      this.setState({ showWeightWarning: true });
      warnings.push('You must weigh at least 50 kg (110 lbs) to donate blood safely.');
    }

    // Calculate safe donation amount
    const bloodVolume = this.calculateBloodVolume(weightKg, heightCm, gender);
    const bloodVolumeML = bloodVolume * 1000;
    // Standard donation is 450-500ml, max 10.5% of blood volume
    const maxSafeDonation = Math.min(500, bloodVolumeML * 0.105);
    const recommendedDonation = Math.round(Math.max(0, Math.min(maxSafeDonation, 470)));

    // Add standard restrictions
    restrictions.push('No blood-borne diseases (HIV, Hepatitis B/C, etc.)');
    restrictions.push('Not currently sick or feeling unwell');
    restrictions.push('No recent tattoos or piercings (wait 3-12 months depending on region)');
    restrictions.push('No recent travel to malaria-endemic areas');
    restrictions.push('Not pregnant or recently given birth (wait 6 months)');

    // Add tips
    tips.push('Eat a healthy meal before donating');
    tips.push('Stay well hydrated - drink plenty of water');
    tips.push('Avoid alcohol 24 hours before donation');
    tips.push('Get a good night\'s sleep');
    tips.push('Bring ID and list of medications');

    this.setState({
      donationResult: {
        eligible,
        amount: eligible ? recommendedDonation : 0,
        warnings,
        restrictions,
        tips,
      },
    }, this.scrollToResult);
  };

  private calculateCompatibility = () => {
    const { bloodType, rhFactor } = this.state;
    const fullType = `${bloodType}${rhFactor}`;

    const canDonateTo = DONATION_COMPATIBILITY[fullType] || [];
    const canReceiveFrom = RECEIVE_COMPATIBILITY[fullType] || [];

    this.setState({
      compatibilityResult: {
        bloodType: fullType,
        canDonateTo,
        canReceiveFrom,
        isUniversalDonor: fullType === 'O-',
        isUniversalRecipient: fullType === 'AB+',
      },
    }, this.scrollToResult);
  };

  private calculateBabyBlood = () => {
    const { fatherBloodType, fatherRh, motherBloodType, motherRh } = this.state;

    // Calculate possible ABO types using Punnett square
    const fatherAlleles = BLOOD_TYPE_ALLELES[fatherBloodType];
    const motherAlleles = BLOOD_TYPE_ALLELES[motherBloodType];

    const possibleGenotypes: Record<string, number> = {};
    let totalCombinations = 0;

    for (const fAllele of fatherAlleles) {
      for (const mAllele of motherAlleles) {
        // Each parent contributes one allele
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
    const fatherRhAlleles = RH_ALLELES[fatherRh];
    const motherRhAlleles = RH_ALLELES[motherRh];

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
    let rhWarning: string | null = null;

    if (rhIncompatibilityRisk) {
      rhWarning = 'Rh incompatibility detected! If the mother is Rh-negative and the father is Rh-positive, the baby may be Rh-positive. This can cause the mother\'s immune system to produce antibodies against the baby\'s blood cells. Consult with a doctor about RhoGAM injection.';
      this.setState({ showRhWarning: true });
    }

    this.setState({
      babyResult: {
        possibleTypes: possibleTypes.filter(t => t.percentage > 0),
        rhIncompatibilityRisk,
        rhWarning,
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
          maxWidth: '500px',
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

        <View maxWidth="800px" marginX="auto">
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
              Blood Donation & Compatibility Calculator
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
                <div style={{ display: 'grid', gap: '1rem', maxWidth: '400px', margin: '0 auto' }}>
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
                  <button
                    onClick={this.calculateDonation}
                    disabled={!age || !weight || (unitSystem === 'metric' ? !height : !heightFeet)}
                    style={{
                      padding: '1rem',
                      background: (age && weight && (unitSystem === 'metric' ? height : heightFeet)) ? gradient : 'rgba(255,255,255,0.1)',
                      border: 'none',
                      borderRadius: '12px',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      cursor: (age && weight && (unitSystem === 'metric' ? height : heightFeet)) ? 'pointer' : 'not-allowed',
                      marginTop: '0.5rem',
                    }}
                  >
                    Check Eligibility
                  </button>
                </div>
              </div>
            )}

            {mode === 'compatibility' && (
              <div>
                <h2 style={{ color: '#fff', marginBottom: '1.5rem', textAlign: 'center' }}>
                  🔄 Blood Type Compatibility
                </h2>
                <div style={{ maxWidth: '400px', margin: '0 auto' }}>
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
                  <button
                    onClick={this.calculateCompatibility}
                    style={{
                      width: '100%',
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
                </div>
              </div>
            )}

            {mode === 'baby' && (
              <div>
                <h2 style={{ color: '#fff', marginBottom: '1.5rem', textAlign: 'center' }}>
                  👶 Baby Blood Type Predictor
                </h2>
                <div style={{ display: 'grid', gap: '1.5rem', maxWidth: '500px', margin: '0 auto' }}>
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

                  <button
                    onClick={this.calculateBabyBlood}
                    style={{
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
                </div>
              </div>
            )}
          </div>

          {/* Hero Ad - between input and results */}
          <AdBanner slot={ADS_CONFIG.slots.bloodResults} format="horizontal" />

          {/* Results */}
          <div ref={this.resultRef}>
            {donationResult && (
              <div style={{
                background: donationResult.eligible
                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(22, 163, 74, 0.2) 100%)'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.2) 100%)',
                borderRadius: '24px',
                padding: 'clamp(1.5rem, 4vw, 2rem)',
                border: `2px solid ${donationResult.eligible ? '#22c55e' : '#ef4444'}`,
                marginBottom: '2rem',
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
                  {donationResult.eligible && (
                    <p style={{ color: '#fff', fontSize: '1.25rem' }}>
                      Recommended donation: <strong>{donationResult.amount} ml</strong>
                    </p>
                  )}
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

                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                  <ShareResults
                    targetRef={this.resultRef}
                    title="Blood Donation Eligibility - Tulzo"
                    text={donationResult.eligible
                      ? `I can donate ${donationResult.amount}ml of blood! 🩸`
                      : 'Check your blood donation eligibility at Tulzo! 🩸'}
                  />
                </div>
              </div>
            )}

            {compatibilityResult && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '24px',
                padding: 'clamp(1.5rem, 4vw, 2rem)',
                border: '2px solid rgba(239, 68, 68, 0.3)',
                marginBottom: '2rem',
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

                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                  <ShareResults
                    targetRef={this.resultRef}
                    title="Blood Type Compatibility - Tulzo"
                    text={`My blood type is ${compatibilityResult.bloodType}! I can donate to ${compatibilityResult.canDonateTo.length} blood types. 🩸`}
                  />
                </div>
              </div>
            )}

            {babyResult && (
              <div style={{
                background: 'rgba(167, 139, 250, 0.1)',
                borderRadius: '24px',
                padding: 'clamp(1.5rem, 4vw, 2rem)',
                border: '2px solid rgba(167, 139, 250, 0.3)',
                marginBottom: '2rem',
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

                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <ShareResults
                    targetRef={this.resultRef}
                    title="Baby Blood Type Predictor - Tulzo"
                    text={`Predicted baby blood types: ${babyResult.possibleTypes.map(t => `${t.type} (${t.percentage}%)`).join(', ')} 👶🩸`}
                  />
                </div>
              </div>
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

